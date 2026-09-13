"""Read-model records for the dashboard API.

The review pipeline posts its findings to GitHub and then forgets them. The
dashboard needs to look at the same results later, so every completed review is
projected into the flat records below and kept in the store.

These types are deliberately separate from `app.models.review`: that module
describes what the pipeline produces, this one describes what a UI needs to
render, including the derived numbers (scores, durations, counts) that nobody
wants to recompute in the browser.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field

from app.models.review import ReviewComment, ReviewResult, Severity


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ReviewStatus(str, Enum):
    """The state a pull request review is in, as the dashboard shows it."""

    QUEUED = "queued"
    REVIEWING = "reviewing"
    PASSED = "passed"
    NEEDS_CHANGES = "needs_changes"
    CRITICAL = "critical"
    FAILED = "failed"


class FindingSource(str, Enum):
    STATIC = "static"
    AI = "ai"


class Finding(BaseModel):
    """One review finding, enriched with the context a reviewer needs to act."""

    id: str
    path: str
    line: int | None = None
    severity: Severity = Severity.INFO
    rule: str
    title: str
    message: str
    source: FindingSource = FindingSource.STATIC
    category: str = "quality"
    why_it_matters: str = ""
    suggested_fix: str = ""
    snippet: str | None = None

    @classmethod
    def from_comment(cls, comment: ReviewComment, index: int) -> "Finding":
        """Project a pipeline comment into a dashboard finding."""
        meta = RULE_CATALOG.get(comment.rule)

        return cls(
            id=f"f{index}",
            path=comment.path,
            line=comment.line,
            severity=comment.severity,
            rule=comment.rule,
            title=meta.title if meta else comment.rule.replace("-", " ").title(),
            message=comment.message,
            source=FindingSource.AI if comment.source == "ai" else FindingSource.STATIC,
            category=meta.category if meta else "quality",
            why_it_matters=meta.why_it_matters if meta else "",
            suggested_fix=meta.suggested_fix if meta else "",
        )


class DiffLine(BaseModel):
    """One rendered line of a diff, ready to paint."""

    kind: str  # "add" | "remove" | "context" | "hunk"
    old_line: int | None = None
    new_line: int | None = None
    content: str


class DiffFile(BaseModel):
    """A changed file plus its rendered diff and the findings that land in it."""

    path: str
    status: str = "modified"
    language: str = "text"
    additions: int = 0
    deletions: int = 0
    lines: list[DiffLine] = Field(default_factory=list)


class QualityMetrics(BaseModel):
    """The measurable half of a review, next to the findings."""

    cyclomatic_complexity: float = 0.0
    max_function_length: int = 0
    functions_changed: int = 0
    documented_ratio: float = 0.0
    duplication_ratio: float = 0.0
    test_files_changed: int = 0
    source_files_changed: int = 0
    estimated_coverage_delta: float = 0.0
    naming_violations: int = 0


class PullRequestRecord(BaseModel):
    """Everything the dashboard knows about one analysed pull request."""

    id: str
    number: int
    title: str
    author: str
    author_avatar: str | None = None
    repository: str
    head_branch: str = ""
    base_branch: str = "main"
    head_sha: str = ""
    html_url: str = ""
    status: ReviewStatus = ReviewStatus.QUEUED
    score: int = 0
    files_reviewed: int = 0
    additions: int = 0
    deletions: int = 0
    ai_used: bool = False
    posted: bool = False
    summary: str = ""
    duration_seconds: float = 0.0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    findings: list[Finding] = Field(default_factory=list)
    files: list[DiffFile] = Field(default_factory=list)
    metrics: QualityMetrics = Field(default_factory=QualityMetrics)
    decision: str | None = None
    error: str | None = None
    is_demo: bool = False

    @property
    def counts(self) -> dict[str, int]:
        counts = {severity.value: 0 for severity in Severity}
        for finding in self.findings:
            counts[finding.severity.value] += 1
        return counts


class RepositoryRecord(BaseModel):
    """A repository the app is installed on, with its rolled-up health."""

    id: str
    name: str
    owner: str
    full_name: str
    default_branch: str = "main"
    private: bool = False
    language: str = "Python"
    auto_review: bool = True
    active: bool = True
    reviews_count: int = 0
    open_findings: int = 0
    health_score: int = 0
    last_reviewed_at: datetime | None = None
    last_pull_request: str | None = None
    is_demo: bool = False


class RuleMeta(BaseModel):
    """Human-facing description of a static rule the analyser implements."""

    rule: str
    title: str
    category: str
    default_severity: Severity
    layer: str  # "diff" | "ast" | "pull-request"
    languages: list[str] = Field(default_factory=lambda: ["any"])
    description: str = ""
    why_it_matters: str = ""
    suggested_fix: str = ""


def _rule(
    rule: str,
    title: str,
    category: str,
    default_severity: Severity,
    layer: str,
    languages: list[str],
    description: str,
    why_it_matters: str,
    suggested_fix: str,
) -> RuleMeta:
    return RuleMeta(
        rule=rule,
        title=title,
        category=category,
        default_severity=default_severity,
        layer=layer,
        languages=languages,
        description=description,
        why_it_matters=why_it_matters,
        suggested_fix=suggested_fix,
    )


# Every rule the static analyser in app/analysis actually implements. The
# dashboard reads this so the documentation page cannot drift from the code.
RULE_CATALOG: dict[str, RuleMeta] = {
    meta.rule: meta
    for meta in [
        _rule(
            "long-line",
            "Line exceeds the length limit",
            "style",
            Severity.INFO,
            "diff",
            ["any"],
            "Flags added lines longer than the configured character limit.",
            "Long lines force horizontal scrolling in review and hide the end of the "
            "statement, which is where the bug usually is.",
            "Break the expression across lines or extract a named intermediate value.",
        ),
        _rule(
            "todo-added",
            "New TODO or FIXME introduced",
            "maintainability",
            Severity.INFO,
            "diff",
            ["any"],
            "Flags TODO, FIXME, HACK and XXX markers added by this pull request.",
            "A TODO merged without an owner or a ticket is a note nobody will ever read again.",
            "Link the marker to a tracked issue, or resolve it before merging.",
        ),
        _rule(
            "debug-leftover",
            "Debug statement left in the code",
            "correctness",
            Severity.WARNING,
            "diff",
            ["Python", "JavaScript", "TypeScript"],
            "Flags print, console.log, debugger and breakpoint calls added to source files.",
            "Debug output reaches production logs, leaks internal state, and drowns the "
            "signal real logging is meant to carry.",
            "Delete the statement or replace it with a call to the project logger.",
        ),
        _rule(
            "possible-secret",
            "Possible hard-coded secret",
            "security",
            Severity.ERROR,
            "diff",
            ["any"],
            "Flags added lines that look like an API key, token, password or private key.",
            "A secret committed to git stays in the history after it is deleted, so the "
            "credential has to be rotated, not just removed.",
            "Move the value to an environment variable and rotate the exposed credential.",
        ),
        _rule(
            "high-complexity",
            "Function is too complex",
            "complexity",
            Severity.WARNING,
            "ast",
            ["Python"],
            "Measures cyclomatic complexity per function from the syntax tree.",
            "Every branch is a path a test has to cover. Past roughly ten, the paths "
            "outnumber the tests anyone will write.",
            "Extract the branch bodies into named helpers, or replace the chain with a "
            "lookup table.",
        ),
        _rule(
            "long-function",
            "Function is too long",
            "complexity",
            Severity.WARNING,
            "ast",
            ["Python"],
            "Flags functions whose body runs past the configured line budget.",
            "A function that does not fit on a screen cannot be held in one reader's head, "
            "so reviewers skim it instead of checking it.",
            "Split the function along its natural sections into smaller named units.",
        ),
        _rule(
            "too-many-arguments",
            "Too many parameters",
            "design",
            Severity.INFO,
            "ast",
            ["Python"],
            "Flags function signatures that take more parameters than the limit allows.",
            "A long parameter list is easy to call in the wrong order and usually means "
            "two responsibilities are sharing one function.",
            "Group the related parameters into a dataclass, or split the function.",
        ),
        _rule(
            "naming-convention",
            "Name does not follow the convention",
            "style",
            Severity.INFO,
            "ast",
            ["Python"],
            "Checks that functions use snake_case and classes use PascalCase.",
            "Consistent naming lets a reader tell a class from a function without "
            "looking it up.",
            "Rename to match the language convention used across the project.",
        ),
        _rule(
            "missing-docstring",
            "Public definition has no docstring",
            "documentation",
            Severity.INFO,
            "ast",
            ["Python"],
            "Flags public functions and classes defined without a docstring.",
            "The next person to touch this code has to reconstruct the intent from the "
            "implementation, and will get it subtly wrong.",
            "Add one line saying what the function does and what it returns.",
        ),
        _rule(
            "mutable-default-argument",
            "Mutable default argument",
            "correctness",
            Severity.ERROR,
            "ast",
            ["Python"],
            "Flags list, dict and set literals used as default parameter values.",
            "The default is created once at definition time and shared by every call, so "
            "state leaks between unrelated invocations.",
            "Default to None and build the container inside the function body.",
        ),
        _rule(
            "bare-except",
            "Bare except clause",
            "correctness",
            Severity.WARNING,
            "ast",
            ["Python"],
            "Flags `except:` with no exception type.",
            "A bare except swallows KeyboardInterrupt and SystemExit too, so the process "
            "stops responding to the signals that are supposed to stop it.",
            "Catch the specific exception you can actually handle.",
        ),
        _rule(
            "silent-failure",
            "Exception caught and ignored",
            "correctness",
            Severity.WARNING,
            "ast",
            ["Python"],
            "Flags except blocks whose body is only `pass`.",
            "The failure still happened; now nothing records it, so the bug reappears "
            "later with no trail back to its cause.",
            "Log the exception, or re-raise once the cleanup is done.",
        ),
        _rule(
            "identity-comparison",
            "Identity comparison against a literal",
            "correctness",
            Severity.WARNING,
            "ast",
            ["Python"],
            "Flags `is` and `is not` used against string or number literals.",
            "Identity holds only while the interpreter happens to intern the value, so "
            "the comparison works in tests and fails in production.",
            "Compare with == unless you genuinely mean object identity.",
        ),
        _rule(
            "syntax-error",
            "File does not parse",
            "correctness",
            Severity.ERROR,
            "ast",
            ["Python"],
            "Reported when the analyser cannot build a syntax tree for a changed file.",
            "Code that does not parse cannot run, and it blocks every other rule from "
            "seeing the file at all.",
            "Fix the syntax error reported at the given line.",
        ),
        _rule(
            "missing-tests",
            "No tests accompany the change",
            "testing",
            Severity.WARNING,
            "pull-request",
            ["any"],
            "Reported when a pull request changes source files but touches no test files.",
            "An untested change is a change nobody can safely modify afterwards, which is "
            "the single most repeated comment in human review.",
            "Add a test that fails without this change and passes with it.",
        ),
    ]
}


# How each severity moves the review score. Errors have to dominate, or a pull
# request with one hard-coded secret and clean style still scores well.
SEVERITY_PENALTY = {Severity.ERROR: 18, Severity.WARNING: 6, Severity.INFO: 1.5}


def score_findings(findings: list[Finding], files_reviewed: int) -> int:
    """Turn a list of findings into a 0-100 review score.

    The penalty is scaled by the size of the change: ten findings across forty
    files is a different situation from ten findings in one file, and a flat sum
    would report them identically.
    """
    if not findings:
        return 100

    penalty = sum(SEVERITY_PENALTY[finding.severity] for finding in findings)
    size_relief = 1 + max(files_reviewed - 1, 0) * 0.08
    score = 100 - penalty / size_relief

    return max(0, min(100, round(score)))


def status_for(findings: list[Finding], score: int) -> ReviewStatus:
    """Derive the headline status from what the review found."""
    counts = {severity.value: 0 for severity in Severity}
    for finding in findings:
        counts[finding.severity.value] += 1

    if counts["error"]:
        return ReviewStatus.CRITICAL
    if counts["warning"] or score < 85:
        return ReviewStatus.NEEDS_CHANGES
    return ReviewStatus.PASSED


def record_from_result(
    result: ReviewResult,
    *,
    record_id: str,
    title: str,
    author: str = "",
    head_branch: str = "",
    base_branch: str = "main",
    head_sha: str = "",
    duration_seconds: float = 0.0,
) -> PullRequestRecord:
    """Project a finished pipeline run into the record the dashboard reads."""
    findings = [Finding.from_comment(comment, index) for index, comment in enumerate(result.comments)]
    score = score_findings(findings, result.files_reviewed)

    return PullRequestRecord(
        id=record_id,
        number=result.pr_number,
        title=title,
        author=author,
        repository=f"{result.owner}/{result.repo}",
        head_branch=head_branch,
        base_branch=base_branch,
        head_sha=head_sha,
        html_url=f"https://github.com/{result.owner}/{result.repo}/pull/{result.pr_number}",
        status=ReviewStatus.FAILED if result.error else status_for(findings, score),
        score=score,
        files_reviewed=result.files_reviewed,
        ai_used=result.ai_used,
        posted=result.posted,
        summary=result.summary,
        duration_seconds=duration_seconds,
        findings=findings,
        error=result.error,
    )
