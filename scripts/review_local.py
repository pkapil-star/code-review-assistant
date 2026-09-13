"""Run the review pipeline over a local git diff, with no GitHub involved.

Useful for a demo, and for trying a rule change without opening a pull request:

    python scripts/review_local.py            # working tree against HEAD
    python scripts/review_local.py main       # current branch against main
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.providers import get_provider  # noqa: E402
from app.ai.reviewer import review_with_ai  # noqa: E402
from app.analysis.diff import ChangedFile, parse_patch  # noqa: E402
from app.analysis.static import deduplicate, run_static_analysis, sort_comments  # noqa: E402
from app.models.review import SEVERITY_ICON  # noqa: E402

FILE_HEADER = "diff --git a/"


def git_diff(base: str | None) -> str:
    """Return the unified diff for the working tree or against a base ref."""
    command = ["git", "diff", "--unified=3"]
    if base:
        command.append(base)

    # Force UTF-8: on Windows the default console encoding chokes on diffs that
    # contain any non-ASCII byte.
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )

    if result.returncode != 0:
        raise SystemExit(f"git diff failed: {result.stderr.strip()}")

    return result.stdout


def split_diff(diff_text: str) -> list[ChangedFile]:
    """Split one big diff into per-file patches the analyser understands."""
    files: list[ChangedFile] = []
    current_path: str | None = None
    current_lines: list[str] = []

    def flush() -> None:
        if current_path and current_lines:
            patch = "\n".join(current_lines)
            files.append(
                ChangedFile(path=current_path, patch=patch, added_lines=parse_patch(patch))
            )

    for line in diff_text.split("\n"):
        if line.startswith(FILE_HEADER):
            flush()
            current_path = line.split(" b/")[-1].strip()
            current_lines = []
            continue

        if current_path is not None:
            current_lines.append(line)

    flush()
    return files


def read_sources(files: list[ChangedFile]) -> dict[str, str]:
    """Read the current on-disk text of the Python files in the diff."""
    sources: dict[str, str] = {}

    for changed_file in files:
        path = Path(changed_file.path)
        if path.suffix == ".py" and path.is_file():
            sources[changed_file.path] = path.read_text(encoding="utf-8", errors="replace")

    return sources


async def main() -> int:
    """Review the local diff and print the findings."""
    base = sys.argv[1] if len(sys.argv) > 1 else None
    files = split_diff(git_diff(base))

    if not files:
        print("No changes to review.")
        return 0

    static_comments = run_static_analysis(files, read_sources(files))
    provider = get_provider()
    ai_comments, summary = await review_with_ai("local diff", files, provider=provider)

    comments = sort_comments(deduplicate(static_comments + ai_comments))

    print(f"Reviewed {len(files)} file(s) with {provider.name} + static analysis.\n")

    if summary:
        print(f"{summary}\n")

    if not comments:
        print("No issues found in the changed lines.")
        return 0

    for comment in comments:
        location = f"{comment.path}:{comment.line}" if comment.line else comment.path
        icon = SEVERITY_ICON[comment.severity]
        print(f"{icon} {location} [{comment.rule}] ({comment.source})")
        print(f"   {comment.message}\n")

    print(f"{len(comments)} finding(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
