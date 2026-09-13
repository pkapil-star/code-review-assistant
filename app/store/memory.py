"""An in-process store for finished reviews.

The service has no database yet, so reviews live here for as long as the process
does. Everything the dashboard reads goes through this one object, which means
swapping in Postgres later is a change to this file and nothing else.

Access is guarded by a lock because the queue workers write to the store from
several tasks at once while HTTP handlers read from it.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone

from app.store.records import (
    Finding,
    PullRequestRecord,
    RepositoryRecord,
    ReviewStatus,
    utcnow,
)

# Statuses that mean the review finished and its findings are final.
TERMINAL_STATUSES = {ReviewStatus.PASSED, ReviewStatus.NEEDS_CHANGES, ReviewStatus.CRITICAL}


class ReviewStore:
    """Holds pull request records and the repositories they belong to."""

    def __init__(self) -> None:
        self._pull_requests: dict[str, PullRequestRecord] = {}
        self._repositories: dict[str, RepositoryRecord] = {}
        self._lock = asyncio.Lock()
        self.seeded_with_demo_data = False

    # -- writes ---------------------------------------------------------

    async def put_pull_request(self, record: PullRequestRecord) -> PullRequestRecord:
        """Insert or replace one pull request record and refresh its repository."""
        async with self._lock:
            record.updated_at = utcnow()
            self._pull_requests[record.id] = record
            self._refresh_repository(record)
            return record

    async def update_pull_request(self, record_id: str, **fields) -> PullRequestRecord | None:
        """Apply a partial update to one record, e.g. a reviewer's decision."""
        async with self._lock:
            record = self._pull_requests.get(record_id)
            if record is None:
                return None

            for key, value in fields.items():
                setattr(record, key, value)

            record.updated_at = utcnow()
            self._refresh_repository(record)
            return record

    async def put_repository(self, repository: RepositoryRecord) -> RepositoryRecord:
        async with self._lock:
            self._repositories[repository.id] = repository
            return repository

    def _refresh_repository(self, record: PullRequestRecord) -> None:
        """Recompute the rolled-up health of the repository a record belongs to.

        Called with the lock already held.
        """
        owner, _, name = record.repository.partition("/")
        repo_id = record.repository.replace("/", "__")

        repository = self._repositories.get(repo_id)
        if repository is None:
            repository = RepositoryRecord(
                id=repo_id,
                name=name,
                owner=owner,
                full_name=record.repository,
                is_demo=record.is_demo,
            )
            self._repositories[repo_id] = repository

        records = [
            candidate
            for candidate in self._pull_requests.values()
            if candidate.repository == record.repository
        ]
        finished = [candidate for candidate in records if candidate.status in TERMINAL_STATUSES]

        repository.reviews_count = len(records)
        repository.open_findings = sum(
            len(candidate.findings) for candidate in records if candidate.decision != "approved"
        )
        repository.health_score = (
            round(sum(candidate.score for candidate in finished) / len(finished))
            if finished
            else 0
        )

        latest = max(records, key=lambda candidate: candidate.updated_at)
        repository.last_reviewed_at = latest.updated_at
        repository.last_pull_request = f"#{latest.number} {latest.title}"

    # -- reads ----------------------------------------------------------

    def list_pull_requests(self) -> list[PullRequestRecord]:
        """Every record, most recently updated first."""
        return sorted(
            self._pull_requests.values(),
            key=lambda record: record.updated_at,
            reverse=True,
        )

    def get_pull_request(self, record_id: str) -> PullRequestRecord | None:
        return self._pull_requests.get(record_id)

    def list_repositories(self) -> list[RepositoryRecord]:
        return sorted(self._repositories.values(), key=lambda repo: repo.full_name)

    def get_repository(self, repo_id: str) -> RepositoryRecord | None:
        return self._repositories.get(repo_id)

    def all_findings(self) -> list[Finding]:
        return [finding for record in self._pull_requests.values() for finding in record.findings]

    @property
    def is_empty(self) -> bool:
        return not self._pull_requests

    # -- derived views --------------------------------------------------

    def summary(self) -> dict:
        """The headline numbers the dashboard puts at the top of the page."""
        records = self.list_pull_requests()
        finished = [record for record in records if record.status in TERMINAL_STATUSES]
        findings = self.all_findings()
        severities = Counter(finding.severity.value for finding in findings)

        return {
            "pull_requests_reviewed": len(records),
            "issues_detected": len(findings),
            "critical_issues": severities.get("error", 0),
            "warnings": severities.get("warning", 0),
            "suggestions": severities.get("info", 0),
            "average_score": (
                round(sum(record.score for record in finished) / len(finished))
                if finished
                else 0
            ),
            "average_duration_seconds": (
                round(sum(record.duration_seconds for record in finished) / len(finished), 1)
                if finished
                else 0.0
            ),
            "ai_reviews": sum(1 for record in records if record.ai_used),
            "repositories": len(self._repositories),
            "needs_attention": sum(
                1
                for record in records
                if record.status in (ReviewStatus.CRITICAL, ReviewStatus.NEEDS_CHANGES)
                and record.decision is None
            ),
        }

    def severity_distribution(self) -> list[dict]:
        counts = Counter(finding.severity.value for finding in self.all_findings())
        return [
            {"severity": severity, "count": counts.get(severity, 0)}
            for severity in ("error", "warning", "info")
        ]

    def category_distribution(self) -> list[dict]:
        counts = Counter(finding.category for finding in self.all_findings())
        return [
            {"category": category, "count": count}
            for category, count in counts.most_common()
        ]

    def source_distribution(self) -> list[dict]:
        counts = Counter(finding.source.value for finding in self.all_findings())
        return [
            {"source": source, "count": counts.get(source, 0)}
            for source in ("static", "ai")
        ]

    def rule_distribution(self, limit: int = 8) -> list[dict]:
        counts = Counter(finding.rule for finding in self.all_findings())
        return [{"rule": rule, "count": count} for rule, count in counts.most_common(limit)]

    def timeseries(self, days: int = 30) -> list[dict]:
        """Daily review volume, findings and score over the trailing window.

        Days with no activity are still emitted, otherwise a line chart would
        join two distant points and imply a trend that never happened.
        """
        today = datetime.now(timezone.utc).date()
        start = today - timedelta(days=days - 1)

        buckets: dict[str, dict] = {}
        for offset in range(days):
            day = start + timedelta(days=offset)
            buckets[day.isoformat()] = {
                "date": day.isoformat(),
                "reviews": 0,
                "findings": 0,
                "critical": 0,
                "score_total": 0,
                "scored": 0,
                "duration_total": 0.0,
            }

        for record in self._pull_requests.values():
            key = record.created_at.date().isoformat()
            bucket = buckets.get(key)
            if bucket is None:
                continue

            bucket["reviews"] += 1
            bucket["findings"] += len(record.findings)
            bucket["critical"] += record.counts["error"]
            bucket["duration_total"] += record.duration_seconds

            if record.status in TERMINAL_STATUSES:
                bucket["score_total"] += record.score
                bucket["scored"] += 1

        series = []
        for bucket in buckets.values():
            scored = bucket.pop("scored")
            score_total = bucket.pop("score_total")
            duration_total = bucket.pop("duration_total")
            reviews = bucket["reviews"]

            bucket["average_score"] = round(score_total / scored) if scored else None
            bucket["average_duration"] = (
                round(duration_total / reviews, 1) if reviews else None
            )
            series.append(bucket)

        return series


_store: ReviewStore | None = None


def get_store() -> ReviewStore:
    """Return the process-wide review store, creating it on first use."""
    global _store

    if _store is None:
        _store = ReviewStore()

    return _store


def reset_store() -> None:
    """Drop the store. Used by tests so cases cannot leak into each other."""
    global _store
    _store = None
