from __future__ import annotations

import re
from dataclasses import dataclass, field

HUNK_HEADER = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@")


@dataclass
class AddedLine:
    """One line that this pull request adds."""

    number: int  # line number in the new version of the file
    content: str
    position: int  # offset inside the patch, used by the older GitHub comment API


@dataclass
class ChangedFile:
    """A file touched by the pull request, plus the lines it adds."""

    path: str
    status: str = "modified"
    patch: str = ""
    added_lines: list[AddedLine] = field(default_factory=list)
    previous_path: str | None = None

    @property
    def is_deleted(self) -> bool:
        return self.status == "removed"

    @property
    def added_line_numbers(self) -> set[int]:
        return {line.number for line in self.added_lines}

    def added_source(self) -> str:
        """The added lines joined back together, for quick text-level checks."""
        return "\n".join(line.content for line in self.added_lines)


def parse_patch(patch: str) -> list[AddedLine]:
    """Pull the added lines out of a unified diff patch.

    GitHub gives us one patch per file. We track two numbers per added line:
    the line number in the new file (used by the modern review API) and the
    position within the patch (used by the older one).
    """
    if not patch:
        return []

    added: list[AddedLine] = []
    new_line_number = 0
    position = 0

    for raw_line in patch.split("\n"):
        header_match = HUNK_HEADER.match(raw_line)
        if header_match:
            new_line_number = int(header_match.group(1))
            position += 1
            continue

        if new_line_number == 0:
            # Anything before the first hunk header is not part of the diff body.
            continue

        position += 1

        if raw_line.startswith("+"):
            added.append(
                AddedLine(number=new_line_number, content=raw_line[1:], position=position)
            )
            new_line_number += 1
        elif raw_line.startswith("-"):
            continue  # removed line: exists only in the old file
        elif raw_line.startswith("\\"):
            continue  # "\ No newline at end of file"
        else:
            new_line_number += 1  # context line

    return added


def build_changed_files(files_payload: list[dict]) -> list[ChangedFile]:
    """Convert the GitHub "list pull request files" response into ChangedFile objects."""
    changed: list[ChangedFile] = []

    for entry in files_payload:
        path = entry.get("filename")
        if not path:
            continue

        patch = entry.get("patch", "") or ""
        changed.append(
            ChangedFile(
                path=path,
                status=entry.get("status", "modified"),
                patch=patch,
                added_lines=parse_patch(patch),
                previous_path=entry.get("previous_filename"),
            )
        )

    return changed


def build_diff_text(files: list[ChangedFile], max_bytes: int) -> str:
    """Rebuild a readable diff for the AI layer, stopping before max_bytes.

    Large pull requests can blow past an LLM's context window, so we truncate
    and say so rather than sending a half-file with no warning.
    """
    chunks: list[str] = []
    total = 0

    for changed_file in files:
        if not changed_file.patch:
            continue

        chunk = f"--- {changed_file.path} ({changed_file.status})\n{changed_file.patch}\n"
        encoded_size = len(chunk.encode("utf-8"))

        if total + encoded_size > max_bytes:
            chunks.append(f"\n[diff truncated: {len(files) - len(chunks)} more file(s) not shown]")
            break

        chunks.append(chunk)
        total += encoded_size

    return "\n".join(chunks)
