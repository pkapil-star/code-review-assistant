"""Tests for the rule-based review layer."""

import ast

from app.analysis.diff import ChangedFile, build_changed_files, parse_patch
from app.analysis.generic_rules import analyze_changed_file
from app.analysis.python_rules import analyze_python_source, cyclomatic_complexity
from app.analysis.static import check_test_coverage, deduplicate, is_test_file, run_static_analysis
from app.models.review import ReviewComment, Severity
from tests.conftest import files_payload

COMPLEX_FUNCTION = """
def handle(value, mode, retries, timeout, verbose, extra):
    if value is None:
        return None
    if mode == "a":
        for item in value:
            if item and item > 0:
                while retries:
                    retries -= 1
            elif item:
                pass
    elif mode == "b":
        try:
            return value[0]
        except:
            pass
    if verbose and timeout:
        return extra
    return value
"""


def rules_for(source: str) -> set[str]:
    """Return the rule names the Python analyser reports for a snippet."""
    return {comment.rule for comment in analyze_python_source("sample.py", source)}


def test_cyclomatic_complexity_counts_branches():
    """A straight-line function is 1; each branch and boolean adds one."""
    simple = ast.parse("def f():\n    return 1\n")
    branchy = ast.parse("def f(a):\n    if a and a > 1:\n        return 1\n    return 2\n")

    assert cyclomatic_complexity(simple) == 1
    assert cyclomatic_complexity(branchy) == 3


def test_detects_high_complexity_and_arguments():
    """A deeply branching function with many arguments trips both thresholds."""
    found = rules_for(COMPLEX_FUNCTION)

    assert "high-complexity" in found
    assert "too-many-arguments" in found


def test_detects_bare_except_and_silent_failure():
    """A bare except that only passes hides real failures twice over."""
    found = rules_for("def f():\n    try:\n        pass\n    except:\n        pass\n")

    assert "bare-except" in found
    assert "silent-failure" in found


def test_detects_mutable_default_argument():
    """The classic shared-list bug is reported as an error, not a hint."""
    comments = analyze_python_source("sample.py", "def f(items=[]):\n    return items\n")

    rules = {c.rule: c.severity for c in comments}
    assert rules["mutable-default-argument"] == Severity.ERROR


def test_detects_naming_and_docstring_issues():
    """PEP 8 naming and missing docstrings are reported as informational."""
    found = rules_for("class lower_case:\n    pass\n\n\ndef BadName():\n    return 1\n")

    assert "naming-convention" in found
    assert "missing-docstring" in found


def test_reports_syntax_error_once():
    """A file that does not parse yields exactly one blocking finding."""
    comments = analyze_python_source("broken.py", "def f(:\n")

    assert len(comments) == 1
    assert comments[0].rule == "syntax-error"
    assert comments[0].severity == Severity.ERROR


def test_clean_code_produces_no_findings():
    """Well-formed code must come back silent, or the tool becomes noise."""
    source = 'def double(value):\n    """Return twice the value."""\n    return value * 2\n'

    assert analyze_python_source("clean.py", source) == []


def test_generic_rules_flag_debug_and_todo():
    """Leftover debugging and new TODOs are caught in any language."""
    patch = "@@ -1,2 +1,4 @@\n context\n+console.log(x);\n+// TODO: fix later\n"
    changed = ChangedFile(path="app.js", patch=patch, added_lines=parse_patch(patch))

    found = {c.rule for c in analyze_changed_file(changed)}

    assert "debug-leftover" in found
    assert "todo-added" in found


def test_generic_rules_flag_possible_secret():
    """A credential pasted into the diff is an error-level finding."""
    patch = '@@ -1,1 +1,2 @@\n context\n+api_key = "ghp_abcdefghijklmnopqrstuvwxyz0123"\n'
    changed = ChangedFile(path="settings.py", patch=patch, added_lines=parse_patch(patch))

    comments = [c for c in analyze_changed_file(changed) if c.rule == "possible-secret"]

    assert comments and comments[0].severity == Severity.ERROR


def test_generic_rules_ignore_placeholders():
    """An example file full of placeholders is not a leak."""
    patch = '@@ -1,1 +1,2 @@\n context\n+api_key = "your-api-key-here"\n'
    changed = ChangedFile(path=".env.example", patch=patch, added_lines=parse_patch(patch))

    assert [c for c in analyze_changed_file(changed) if c.rule == "possible-secret"] == []


def test_is_test_file_recognises_common_layouts():
    """Test detection has to cover the Python and JavaScript conventions."""
    assert is_test_file("tests/test_service.py")
    assert is_test_file("src/service.test.ts")
    assert not is_test_file("app/service.py")


def test_missing_tests_warning():
    """Changing source without touching tests earns one warning."""
    files = build_changed_files(files_payload())

    comments = check_test_coverage(files)

    assert len(comments) == 1
    assert comments[0].rule == "missing-tests"


def test_no_missing_tests_warning_when_tests_change():
    """Once a test file is in the pull request, the warning goes away."""
    files = build_changed_files(files_payload() + files_payload(filename="tests/test_service.py"))

    assert check_test_coverage(files) == []


def test_findings_are_limited_to_added_lines():
    """Problems in untouched code are not for this pull request to answer for."""
    patch = "@@ -1,2 +1,3 @@\n def existing(items=[]):\n     return items\n+NEW = 1\n"
    changed = ChangedFile(path="legacy.py", patch=patch, added_lines=parse_patch(patch))
    source = "def existing(items=[]):\n    return items\nNEW = 1\n"

    comments = run_static_analysis([changed], {"legacy.py": source})

    assert "mutable-default-argument" not in {c.rule for c in comments}


def test_deduplicate_drops_repeat_findings():
    """The static and AI layers often notice the same thing."""
    first = ReviewComment(path="a.py", line=3, rule="bug", message="x", source="static")
    second = ReviewComment(path="a.py", line=3, rule="bug", message="x again", source="ai")

    assert len(deduplicate([first, second])) == 1
