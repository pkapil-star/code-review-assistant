"""Tests for unified diff parsing.

Line numbers decide where a comment lands, so an off-by-one here would put
every inline comment on the wrong line.
"""

from app.analysis.diff import build_changed_files, build_diff_text, parse_patch
from tests.conftest import SAMPLE_PATCH, files_payload

MULTI_HUNK_PATCH = (
    "@@ -1,3 +1,4 @@\n"
    " alpha\n"
    "+beta\n"
    " gamma\n"
    "@@ -20,3 +21,4 @@\n"
    " delta\n"
    "+epsilon\n"
    " zeta\n"
)


def test_parse_patch_numbers_added_lines():
    """Added lines carry their line number in the new version of the file."""
    added = parse_patch(SAMPLE_PATCH)

    assert [line.number for line in added] == [3, 4, 5, 6]
    assert added[0].content == "def process(a):"


def test_parse_patch_skips_removed_lines():
    """Removed lines exist only in the old file, so they get no comment."""
    contents = [line.content for line in parse_patch(SAMPLE_PATCH)]

    assert "def old_name(a):" not in contents


def test_parse_patch_handles_multiple_hunks():
    """Each hunk header resets the line counter to the number it declares."""
    added = parse_patch(MULTI_HUNK_PATCH)

    assert [line.number for line in added] == [2, 22]
    assert [line.content for line in added] == ["beta", "epsilon"]


def test_parse_patch_tolerates_empty_input():
    """A binary or renamed file arrives with no patch at all."""
    assert parse_patch("") == []


def test_build_changed_files_reads_metadata():
    """Filename and status come straight from the API response."""
    files = build_changed_files(files_payload())

    assert len(files) == 1
    assert files[0].path == "app/service.py"
    assert files[0].status == "modified"
    assert files[0].added_line_numbers == {3, 4, 5, 6}


def test_build_diff_text_truncates_large_diffs():
    """A diff past the byte budget is cut, and the cut is stated in the text."""
    files = build_changed_files(files_payload())

    text = build_diff_text(files, max_bytes=10)

    assert "truncated" in text
