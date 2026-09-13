from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Severity(str, Enum):
    """How badly a finding needs a human to look at it."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


SEVERITY_ORDER = {Severity.ERROR: 0, Severity.WARNING: 1, Severity.INFO: 2}

SEVERITY_ICON = {Severity.ERROR: "🛑", Severity.WARNING: "⚠️", Severity.INFO: "💡"}


class ReviewComment(BaseModel):
    """A single review finding, anchored to a file and (optionally) a line."""

    path: str
    line: int | None = None
    severity: Severity = Severity.INFO
    rule: str
    message: str
    source: str = "static"  # "static" or "ai"

    def render(self) -> str:
        """Format the finding as the markdown body of a GitHub comment."""
        icon = SEVERITY_ICON[self.severity]
        return f"{icon} **{self.severity.value}** · `{self.rule}` ({self.source})\n\n{self.message}"

    def dedupe_key(self) -> tuple[str, int | None, str]:
        return (self.path, self.line, self.rule)


class ReviewResult(BaseModel):
    """Everything the pipeline produced for one pull request."""

    owner: str = ""
    repo: str = ""
    pr_number: int = 0
    comments: list[ReviewComment] = Field(default_factory=list)
    summary: str = ""
    files_reviewed: int = 0
    ai_used: bool = False
    posted: bool = False
    error: str | None = None

    @property
    def counts(self) -> dict[str, int]:
        counts = {s.value: 0 for s in Severity}
        for comment in self.comments:
            counts[comment.severity.value] += 1
        return counts
