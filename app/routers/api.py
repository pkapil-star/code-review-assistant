"""The read API the dashboard talks to.

Everything here is a projection of what the review pipeline already produced.
No endpoint in this module triggers a review of a real pull request; reviews
still start from a verified GitHub webhook, which is the only path that can
prove the event is genuine.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.config import settings
from app.queue.instance import get_review_queue
from app.store.memory import TERMINAL_STATUSES, get_store
from app.store.records import (
    RULE_CATALOG,
    PullRequestRecord,
    RepositoryRecord,
    ReviewStatus,
    RuleMeta,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard"])

SortKey = Literal["updated", "score", "findings", "number"]


class ConnectionStatus(BaseModel):
    """What the top bar shows about the service's link to GitHub."""

    connected: bool
    app_id_configured: bool
    webhook_secret_configured: bool
    private_key_configured: bool
    ai_provider: str
    ai_configured: bool
    post_comments: bool
    queue_backend: str
    workers_running: bool
    environment: str
    demo_data: bool


class DecisionRequest(BaseModel):
    decision: Literal["approved", "changes_requested", "cleared"]


class SettingsView(BaseModel):
    """The subset of configuration that is safe to show in a browser.

    Secrets are reported as booleans only. The values never leave the process.
    """

    environment: str
    ai_provider: str
    ai_model: str
    ai_max_tokens: int
    max_comments_per_review: int
    max_diff_bytes: int
    post_comments: bool
    queue_backend: str
    queue_workers: int
    queue_max_retries: int
    github_api_url: str
    github_app_id_configured: bool
    github_webhook_secret_configured: bool
    github_private_key_configured: bool
    anthropic_api_key_configured: bool
    demo_data: bool


def _github_connected() -> bool:
    """True when every credential a GitHub App needs is present."""
    return bool(
        settings.github_app_id
        and settings.github_webhook_secret
        and settings.github_private_key_path
    )


@router.get("/status", response_model=ConnectionStatus)
def connection_status() -> ConnectionStatus:
    """Integration state for the top bar, computed from real configuration."""
    queue = get_review_queue()

    return ConnectionStatus(
        connected=_github_connected(),
        app_id_configured=bool(settings.github_app_id),
        webhook_secret_configured=bool(settings.github_webhook_secret),
        private_key_configured=bool(settings.github_private_key_path),
        ai_provider=settings.ai_provider,
        ai_configured=settings.ai_provider == "mock" or bool(settings.anthropic_api_key),
        post_comments=settings.post_comments,
        queue_backend=settings.queue_backend,
        workers_running=queue.running,
        environment=settings.environment,
        demo_data=get_store().seeded_with_demo_data,
    )


@router.get("/settings", response_model=SettingsView)
def read_settings() -> SettingsView:
    """Configuration for the settings page, with secrets reduced to booleans."""
    return SettingsView(
        environment=settings.environment,
        ai_provider=settings.ai_provider,
        ai_model=settings.anthropic_model,
        ai_max_tokens=settings.ai_max_tokens,
        max_comments_per_review=settings.max_comments_per_review,
        max_diff_bytes=settings.max_diff_bytes,
        post_comments=settings.post_comments,
        queue_backend=settings.queue_backend,
        queue_workers=settings.queue_workers,
        queue_max_retries=settings.queue_max_retries,
        github_api_url=settings.github_api_url,
        github_app_id_configured=bool(settings.github_app_id),
        github_webhook_secret_configured=bool(settings.github_webhook_secret),
        github_private_key_configured=bool(settings.github_private_key_path),
        anthropic_api_key_configured=bool(settings.anthropic_api_key),
        demo_data=get_store().seeded_with_demo_data,
    )


@router.get("/rules", response_model=list[RuleMeta])
def list_rules() -> list[RuleMeta]:
    """The static rules the analyser implements, read straight from the catalog."""
    return sorted(RULE_CATALOG.values(), key=lambda meta: (meta.layer, meta.rule))


@router.get("/repositories", response_model=list[RepositoryRecord])
def list_repositories() -> list[RepositoryRecord]:
    return get_store().list_repositories()


@router.get("/repositories/{repo_id}", response_model=RepositoryRecord)
def get_repository(repo_id: str) -> RepositoryRecord:
    repository = get_store().get_repository(repo_id)

    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    return repository


class RepositorySettingsRequest(BaseModel):
    auto_review: bool | None = None
    active: bool | None = None


@router.patch("/repositories/{repo_id}", response_model=RepositoryRecord)
async def update_repository(
    repo_id: str, payload: RepositorySettingsRequest
) -> RepositoryRecord:
    """Toggle automatic review for one repository.

    The flag is held in the store only. Nothing is written back to GitHub, so a
    repository switched off here still delivers webhooks; the UI states this.
    """
    store = get_store()
    repository = store.get_repository(repo_id)

    if repository is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found")

    if payload.auto_review is not None:
        repository.auto_review = payload.auto_review
    if payload.active is not None:
        repository.active = payload.active

    return await store.put_repository(repository)


class PullRequestListItem(BaseModel):
    """A row in the pull request table: the record without its diff or findings."""

    id: str
    number: int
    title: str
    author: str
    repository: str
    head_branch: str
    base_branch: str
    html_url: str
    status: ReviewStatus
    score: int
    files_reviewed: int
    additions: int
    deletions: int
    ai_used: bool
    duration_seconds: float
    created_at: str
    updated_at: str
    decision: str | None
    is_demo: bool
    counts: dict[str, int]
    findings_count: int

    @classmethod
    def from_record(cls, record: PullRequestRecord) -> "PullRequestListItem":
        return cls(
            id=record.id,
            number=record.number,
            title=record.title,
            author=record.author,
            repository=record.repository,
            head_branch=record.head_branch,
            base_branch=record.base_branch,
            html_url=record.html_url,
            status=record.status,
            score=record.score,
            files_reviewed=record.files_reviewed,
            additions=record.additions,
            deletions=record.deletions,
            ai_used=record.ai_used,
            duration_seconds=record.duration_seconds,
            created_at=record.created_at.isoformat(),
            updated_at=record.updated_at.isoformat(),
            decision=record.decision,
            is_demo=record.is_demo,
            counts=record.counts,
            findings_count=len(record.findings),
        )


@router.get("/pull-requests", response_model=list[PullRequestListItem])
def list_pull_requests(
    query: str = Query(default="", description="Match against title, author or branch"),
    repository: str = Query(default=""),
    review_status: str = Query(default=""),
    severity: str = Query(default="", description="error, warning or info"),
    sort: SortKey = Query(default="updated"),
) -> list[PullRequestListItem]:
    """The pull request table, filtered and sorted on the server.

    Filtering here rather than in the browser keeps the same behaviour once the
    store is backed by a database and the list no longer fits in one response.
    """
    records = get_store().list_pull_requests()
    needle = query.strip().lower()

    if needle:
        records = [
            record
            for record in records
            if needle in record.title.lower()
            or needle in record.author.lower()
            or needle in record.repository.lower()
            or needle in record.head_branch.lower()
            or needle == str(record.number)
        ]

    if repository:
        records = [record for record in records if record.repository == repository]

    if review_status:
        records = [record for record in records if record.status.value == review_status]

    if severity:
        records = [record for record in records if record.counts.get(severity, 0) > 0]

    sorters = {
        "updated": lambda record: record.updated_at.timestamp(),
        "score": lambda record: record.score,
        "findings": lambda record: len(record.findings),
        "number": lambda record: record.number,
    }
    records = sorted(records, key=sorters[sort], reverse=True)

    return [PullRequestListItem.from_record(record) for record in records]


@router.get("/pull-requests/{record_id}", response_model=PullRequestRecord)
def get_pull_request(record_id: str) -> PullRequestRecord:
    record = get_store().get_pull_request(record_id)

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pull request not found")

    return record


@router.get("/pull-requests/{record_id}/findings")
def get_findings(record_id: str) -> dict:
    """Findings for one pull request, grouped the way the review panel shows them."""
    record = get_store().get_pull_request(record_id)

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pull request not found")

    return {
        "total": len(record.findings),
        "counts": record.counts,
        "by_source": {
            "static": [f for f in record.findings if f.source.value == "static"],
            "ai": [f for f in record.findings if f.source.value == "ai"],
        },
        "findings": record.findings,
    }


@router.post("/pull-requests/{record_id}/decision", response_model=PullRequestRecord)
async def set_decision(record_id: str, payload: DecisionRequest) -> PullRequestRecord:
    """Record a human decision on a review.

    The decision is stored against the record so the dashboard stops listing the
    pull request as needing attention. It is not sent to GitHub: approving a
    pull request on a reviewer's behalf needs their own OAuth token, which this
    service does not hold. The UI says so at the point of action.
    """
    store = get_store()
    decision = None if payload.decision == "cleared" else payload.decision
    record = await store.update_pull_request(record_id, decision=decision)

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pull request not found")

    logger.info("Recorded decision %s on %s", payload.decision, record_id)
    return record


@router.get("/analytics")
def analytics(days: int = Query(default=30, ge=7, le=90)) -> dict:
    """Trends and distributions for the analytics page."""
    store = get_store()
    records = store.list_pull_requests()
    finished = [record for record in records if record.status in TERMINAL_STATUSES]

    repositories = []
    for repository in store.list_repositories():
        repo_records = [r for r in finished if r.repository == repository.full_name]
        repositories.append(
            {
                "repository": repository.full_name,
                "reviews": repository.reviews_count,
                "health_score": repository.health_score,
                "findings": sum(len(r.findings) for r in repo_records),
                "critical": sum(r.counts["error"] for r in repo_records),
                "average_duration": (
                    round(sum(r.duration_seconds for r in repo_records) / len(repo_records), 1)
                    if repo_records
                    else 0.0
                ),
            }
        )

    return {
        "summary": store.summary(),
        "timeseries": store.timeseries(days),
        "severity_distribution": store.severity_distribution(),
        "category_distribution": store.category_distribution(),
        "source_distribution": store.source_distribution(),
        "top_rules": store.rule_distribution(),
        "repositories": repositories,
        "complexity": [
            {
                "repository": record.repository,
                "pull_request": record.number,
                "complexity": record.metrics.cyclomatic_complexity,
                "score": record.score,
                "findings": len(record.findings),
            }
            for record in finished
            if record.metrics.cyclomatic_complexity
        ],
    }


@router.get("/dashboard")
def dashboard() -> dict:
    """Everything the dashboard's first paint needs, in one round trip."""
    store = get_store()
    records = store.list_pull_requests()

    needs_attention = [
        record
        for record in records
        if record.status in (ReviewStatus.CRITICAL, ReviewStatus.NEEDS_CHANGES)
        and record.decision is None
    ]

    activity = [
        {
            "id": record.id,
            "repository": record.repository,
            "number": record.number,
            "title": record.title,
            "status": record.status,
            "score": record.score,
            "ai_used": record.ai_used,
            "findings": len(record.findings),
            "critical": record.counts["error"],
            "at": record.updated_at.isoformat(),
        }
        for record in records[:8]
    ]

    return {
        "summary": store.summary(),
        "recent": [PullRequestListItem.from_record(record) for record in records[:6]],
        "needs_attention": [PullRequestListItem.from_record(record) for record in needs_attention[:4]],
        "activity": activity,
        "severity_distribution": store.severity_distribution(),
        "category_distribution": store.category_distribution(),
        "source_distribution": store.source_distribution(),
        "top_rules": store.rule_distribution(6),
        "timeseries": store.timeseries(14),
        "repositories": store.list_repositories(),
    }
