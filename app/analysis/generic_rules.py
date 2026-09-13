"""Text-level checks that apply to any language.

These rules look at the added lines of a diff, not at a parsed tree, so they
work for JavaScript, Go, YAML or anything else a pull request touches.
"""

from __future__ import annotations

import re

from app.analysis.diff import AddedLine, ChangedFile
from app.models.review import ReviewComment, Severity

MAX_LINE_LENGTH = 120

TODO_PATTERN = re.compile(r"\b(TODO|FIXME|XXX|HACK)\b")

# Leftovers from a debugging session that should not reach the default branch.
DEBUG_PATTERNS = [
    (re.compile(r"\bbreakpoint\s*\("), "breakpoint()"),
    (re.compile(r"\bpdb\.set_trace\s*\("), "pdb.set_trace()"),
    (re.compile(r"^\s*debugger\s*;?\s*$"), "debugger"),
    (re.compile(r"\bconsole\.log\s*\("), "console.log()"),
]

# Values that look like credentials pasted straight into the source.
SECRET_PATTERNS = [
    (
        re.compile(r"""(?i)(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][^"']{8,}["']"""),
        "hardcoded credential",
    ),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AWS access key id"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"), "GitHub token"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "API secret key"),
]

# Placeholders in example files and fixtures in tests are not real leaks.
PLACEHOLDER_HINTS = (
    "your-",
    "changeme",
    "example",
    "xxxxx",
    "placeholder",
    "dummy",
    "fake",
    "test-",
    "test_",
)


def _looks_like_placeholder(line: str) -> bool:
    """Return True for values that are obviously stand-ins, not real secrets."""
    lowered = line.lower()
    return any(hint in lowered for hint in PLACEHOLDER_HINTS)


def _comment(path: str, added: AddedLine, severity: Severity, rule: str, message: str):
    """Build a finding anchored to one added line."""
    return ReviewComment(
        path=path, line=added.number, severity=severity, rule=rule, message=message
    )


def _check_line_length(path: str, added: AddedLine) -> list[ReviewComment]:
    """Flag a line past the soft length limit."""
    if len(added.content) <= MAX_LINE_LENGTH:
        return []

    return [
        _comment(
            path,
            added,
            Severity.INFO,
            "long-line",
            f"Line is {len(added.content)} characters (soft limit {MAX_LINE_LENGTH}).",
        )
    ]


def _check_todo(path: str, added: AddedLine) -> list[ReviewComment]:
    """Flag a TODO or FIXME the pull request introduces."""
    if not TODO_PATTERN.search(added.content):
        return []

    return [
        _comment(
            path,
            added,
            Severity.INFO,
            "todo-added",
            "This change adds a TODO. Link it to a tracked issue so it does not get lost.",
        )
    ]


def _check_debug_leftovers(path: str, added: AddedLine) -> list[ReviewComment]:
    """Flag debugger calls and stray logging left in the code."""
    for pattern, label in DEBUG_PATTERNS:
        if pattern.search(added.content):
            return [
                _comment(
                    path,
                    added,
                    Severity.WARNING,
                    "debug-leftover",
                    f"`{label}` looks like a leftover from debugging. Remove it before merging.",
                )
            ]

    return []


def _check_secrets(path: str, added: AddedLine) -> list[ReviewComment]:
    """Flag anything that looks like a real credential in the diff."""
    if _looks_like_placeholder(added.content):
        return []

    for pattern, label in SECRET_PATTERNS:
        if pattern.search(added.content):
            return [
                _comment(
                    path,
                    added,
                    Severity.ERROR,
                    "possible-secret",
                    f"This line looks like a {label} committed to the repository. "
                    "Move it to an environment variable and rotate the value, because "
                    "git history keeps it even after a later deletion.",
                )
            ]

    return []


LINE_RULES = (_check_line_length, _check_todo, _check_debug_leftovers, _check_secrets)


def analyze_changed_file(changed_file: ChangedFile) -> list[ReviewComment]:
    """Apply the language-agnostic rules to the lines this file adds."""
    comments: list[ReviewComment] = []

    for added in changed_file.added_lines:
        for rule in LINE_RULES:
            comments.extend(rule(changed_file.path, added))

    return comments
