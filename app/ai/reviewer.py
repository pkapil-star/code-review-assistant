"""The AI review layer.

Static rules catch what rules can describe. This layer asks a model about the
things rules cannot see: whether the change is correct, whether an edge case is
handled, whether the new code contradicts the code around it.
"""

from __future__ import annotations

import json
import logging
import re

from app.ai.providers import LLMProvider, get_provider
from app.analysis.diff import ChangedFile, build_diff_text
from app.config import settings
from app.models.review import ReviewComment, Severity

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior software engineer reviewing a pull request.

Report only problems that a careful human reviewer would raise:
- bugs, wrong logic, off-by-one errors, unhandled edge cases
- null or None dereferences and unchecked error paths
- security problems: injection, missing authorization, leaked secrets
- race conditions and resource leaks
- a public interface changed in a way that breaks its callers

Do not report formatting, import order, or style preferences. A separate static
analysis layer already covers complexity, naming and missing tests, so skip those.
Say nothing when the change looks fine. A short review with three real findings
beats a long one padded with noise.

Answer with JSON only, in exactly this shape:
{"summary": "one or two sentences about the change as a whole",
 "comments": [{"path": "file path from the diff",
               "line": 42,
               "severity": "info | warning | error",
               "rule": "short-kebab-case-label",
               "message": "what is wrong and how to fix it"}]}

The line number must be a line the diff adds, shown with a leading + sign."""

# Models sometimes wrap JSON in a markdown fence even when told not to.
JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def build_user_prompt(title: str, files: list[ChangedFile], max_bytes: int | None = None) -> str:
    """Assemble the diff and pull request title into the prompt body."""
    max_bytes = settings.max_diff_bytes if max_bytes is None else max_bytes
    diff_text = build_diff_text(files, max_bytes)
    file_list = "\n".join(f"- {f.path} ({f.status})" for f in files)

    return (
        f"Pull request title: {title or 'untitled'}\n\n"
        f"Files changed ({len(files)}):\n{file_list}\n\n"
        f"Unified diff:\n{diff_text}"
    )


def extract_json(raw: str) -> dict:
    """Pull the JSON object out of a model response.

    Returns an empty dict rather than raising, because a malformed AI answer
    should cost us the AI findings only, not the whole review.
    """
    if not raw or not raw.strip():
        return {}

    candidate = raw.strip()

    fenced = JSON_BLOCK.search(candidate)
    if fenced:
        candidate = fenced.group(1).strip()
    else:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start != -1 and end > start:
            candidate = candidate[start : end + 1]

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        logger.warning("AI response was not valid JSON. Dropping the AI findings.")
        return {}

    return parsed if isinstance(parsed, dict) else {}


def _resolve_line(entry: dict, path: str, valid_lines: set[int]) -> int | None:
    """Return the line to anchor a finding to, or None when it cannot be anchored.

    A line the diff never added would make GitHub reject the whole review, so an
    out-of-range line is dropped and the finding travels in the review body.
    """
    raw = entry.get("line")

    if not isinstance(raw, (int, str)) or not str(raw).isdigit():
        return None

    line = int(raw)

    if line not in valid_lines:
        logger.info("AI comment for %s:%s is outside the diff. Keeping it unanchored.", path, line)
        return None

    return line


def _resolve_severity(entry: dict) -> Severity:
    """Map the severity the model wrote onto ours, defaulting to info."""
    try:
        return Severity(str(entry.get("severity", "info")).lower())
    except ValueError:
        return Severity.INFO


def parse_comments(payload: dict, files: list[ChangedFile]) -> list[ReviewComment]:
    """Turn the parsed model output into ReviewComment objects.

    Anything the model invents is dropped here: a file it did not get, a line it
    did not see, or a severity that is not one of ours. That keeps a confused
    model from posting a comment onto an unrelated part of the repository.
    """
    valid_lines = {f.path: f.added_line_numbers for f in files}
    comments: list[ReviewComment] = []

    for entry in payload.get("comments", []):
        if not isinstance(entry, dict):
            continue

        path = entry.get("path")
        message = entry.get("message")

        if not path or not message or path not in valid_lines:
            logger.info("Dropping AI comment for unknown path: %r", path)
            continue

        comments.append(
            ReviewComment(
                path=path,
                line=_resolve_line(entry, path, valid_lines[path]),
                severity=_resolve_severity(entry),
                rule=str(entry.get("rule") or "ai-review"),
                message=str(message),
                source="ai",
            )
        )

    return comments


async def review_with_ai(
    title: str, files: list[ChangedFile], provider: LLMProvider | None = None
) -> tuple[list[ReviewComment], str]:
    """Ask the model to review the diff and return its findings plus a summary.

    Any provider failure is logged and swallowed: the static findings still get
    posted, which is better than posting nothing because an API call timed out.
    """
    provider = provider or get_provider()
    reviewable = [f for f in files if f.patch and not f.is_deleted]

    if not reviewable:
        return [], ""

    try:
        raw = await provider.complete(SYSTEM_PROMPT, build_user_prompt(title, reviewable))
    except Exception as exc:  # noqa: BLE001 - the review must survive any provider error
        logger.exception("AI provider %s failed: %s", getattr(provider, "name", "unknown"), exc)
        return [], ""

    payload = extract_json(raw)
    summary = str(payload.get("summary", "") or "")

    return parse_comments(payload, reviewable), summary
