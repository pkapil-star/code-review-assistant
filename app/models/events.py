from __future__ import annotations

from pydantic import BaseModel

# Only these pull_request actions are worth a review. "synchronize" means new
# commits were pushed to an already-open PR.
REVIEWABLE_ACTIONS = {"opened", "reopened", "synchronize", "ready_for_review"}


class PullRequestEvent(BaseModel):
    """The handful of fields we actually need out of a GitHub pull_request webhook."""

    action: str
    owner: str
    repo: str
    pr_number: int
    head_sha: str
    installation_id: int | None = None
    title: str = ""
    draft: bool = False

    @property
    def full_name(self) -> str:
        return f"{self.owner}/{self.repo}"

    def should_review(self) -> bool:
        return self.action in REVIEWABLE_ACTIONS and not self.draft


class UnsupportedEventError(ValueError):
    """Raised when a payload is not a pull_request event we can handle."""


def parse_pull_request_event(payload: dict) -> PullRequestEvent:
    """Turn a raw GitHub webhook payload into a PullRequestEvent.

    Raises UnsupportedEventError if the payload is missing the fields we need,
    which keeps malformed or unexpected events out of the review queue.
    """
    pull_request = payload.get("pull_request")
    repository = payload.get("repository")

    if not isinstance(pull_request, dict) or not isinstance(repository, dict):
        raise UnsupportedEventError("payload is missing 'pull_request' or 'repository'")

    full_name = repository.get("full_name", "")
    if "/" not in full_name:
        raise UnsupportedEventError(f"unexpected repository full_name: {full_name!r}")

    owner, repo = full_name.split("/", 1)
    number = pull_request.get("number")
    head_sha = (pull_request.get("head") or {}).get("sha")

    if number is None or not head_sha:
        raise UnsupportedEventError("payload is missing pull request number or head sha")

    installation = payload.get("installation") or {}

    return PullRequestEvent(
        action=payload.get("action", ""),
        owner=owner,
        repo=repo,
        pr_number=int(number),
        head_sha=head_sha,
        installation_id=installation.get("id"),
        title=pull_request.get("title", "") or "",
        draft=bool(pull_request.get("draft", False)),
    )
