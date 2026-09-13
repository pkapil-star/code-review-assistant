"""The static analysis layer.

This is the rule-based half of the review. It runs before the AI layer, costs
nothing per pull request, and produces findings we can point at a concrete line.
"""

from __future__ import annotations

from app.analysis.diff import ChangedFile
from app.analysis.generic_rules import analyze_changed_file
from app.analysis.python_rules import analyze_python_source
from app.models.review import SEVERITY_ORDER, ReviewComment, Severity

TEST_PATH_HINTS = ("test_", "_test.", "/tests/", "tests/", ".test.", ".spec.", "spec/")

SOURCE_EXTENSIONS = (".py", ".js", ".ts", ".tsx", ".jsx", ".go", ".java", ".rb", ".rs")


def is_test_file(path: str) -> bool:
    """Return True when a path looks like a test file rather than production code."""
    lowered = path.lower()
    return any(hint in lowered for hint in TEST_PATH_HINTS)


def is_source_file(path: str) -> bool:
    """Return True for files that hold application code."""
    return path.lower().endswith(SOURCE_EXTENSIONS)


def check_test_coverage(files: list[ChangedFile]) -> list[ReviewComment]:
    """Warn when a pull request changes source code but touches no tests.

    This is a heuristic, not a coverage measurement. It catches the single most
    common review comment a senior engineer has to repeat: where are the tests.
    """
    source_files = [f for f in files if is_source_file(f.path) and not is_test_file(f.path)]
    test_files = [f for f in files if is_test_file(f.path)]

    if not source_files or test_files:
        return []

    listed = ", ".join(f"`{f.path}`" for f in source_files[:5])
    if len(source_files) > 5:
        listed += f" and {len(source_files) - 5} more"

    return [
        ReviewComment(
            path=source_files[0].path,
            line=None,
            severity=Severity.WARNING,
            rule="missing-tests",
            message=(
                f"This pull request changes {len(source_files)} source file(s) ({listed}) "
                "but adds or updates no test files. Add a test that fails without this change."
            ),
        )
    ]


def _filter_to_added_lines(
    comments: list[ReviewComment], changed_file: ChangedFile
) -> list[ReviewComment]:
    """Keep only findings that land on a line this pull request actually added.

    Whole-file analysis sees pre-existing problems too. Commenting on untouched
    code annoys the author, so we drop anything outside the diff.
    """
    added = changed_file.added_line_numbers
    return [c for c in comments if c.line is None or c.line in added]


def analyze_file(changed_file: ChangedFile, source: str | None = None) -> list[ReviewComment]:
    """Run the rules that apply to one changed file.

    `source` is the full content of the file at the head commit. Without it we
    can still run the text-level rules over the diff, but not the AST rules,
    which need a complete, parseable module.
    """
    if changed_file.is_deleted:
        return []

    comments = analyze_changed_file(changed_file)

    if changed_file.path.endswith(".py") and source is not None:
        ast_comments = analyze_python_source(changed_file.path, source)
        comments.extend(_filter_to_added_lines(ast_comments, changed_file))

    return comments


def sort_comments(comments: list[ReviewComment]) -> list[ReviewComment]:
    """Order findings by severity, then file and line, so the worst read first."""
    return sorted(
        comments,
        key=lambda c: (SEVERITY_ORDER[c.severity], c.path, c.line if c.line is not None else -1),
    )


def deduplicate(comments: list[ReviewComment]) -> list[ReviewComment]:
    """Drop repeat findings for the same rule on the same line.

    The static layer and the AI layer often notice the same problem, and the
    author should see it once.
    """
    seen: set[tuple[str, int | None, str]] = set()
    unique: list[ReviewComment] = []

    for comment in comments:
        key = comment.dedupe_key()
        if key in seen:
            continue
        seen.add(key)
        unique.append(comment)

    return unique


def run_static_analysis(
    files: list[ChangedFile], sources: dict[str, str] | None = None
) -> list[ReviewComment]:
    """Run every static rule over a pull request and return sorted, unique findings."""
    sources = sources or {}
    comments: list[ReviewComment] = []

    for changed_file in files:
        comments.extend(analyze_file(changed_file, sources.get(changed_file.path)))

    comments.extend(check_test_coverage(files))

    return sort_comments(deduplicate(comments))
