"""AST-based checks for Python files.

Everything here works on the parsed syntax tree rather than on raw text, so it
understands structure: how deeply a function branches, how many arguments it
takes, whether an except clause actually handles anything.
"""

from __future__ import annotations

import ast
import re

from app.models.review import ReviewComment, Severity

MAX_COMPLEXITY = 10
MAX_FUNCTION_LINES = 50
MAX_ARGUMENTS = 5

SNAKE_CASE = re.compile(r"^_{0,2}[a-z][a-z0-9_]*_{0,2}$")
PASCAL_CASE = re.compile(r"^_?[A-Z][A-Za-z0-9]*$")

# Nodes that add a branch, and therefore another path through the function.
BRANCHING_NODES = (
    ast.If,
    ast.For,
    ast.AsyncFor,
    ast.While,
    ast.ExceptHandler,
    ast.With,
    ast.AsyncWith,
    ast.Assert,
    ast.IfExp,
    ast.comprehension,
)


def cyclomatic_complexity(node: ast.AST) -> int:
    """Count the independent paths through a function.

    Start at 1 for the straight-line path, then add 1 for every branch point.
    Boolean operators count too: `if a and b` is two conditions, not one.
    """
    complexity = 1

    for child in ast.walk(node):
        if isinstance(child, BRANCHING_NODES):
            complexity += 1
        elif isinstance(child, ast.BoolOp):
            complexity += len(child.values) - 1
        elif isinstance(child, ast.Match):
            complexity += len(child.cases)

    return complexity


def _function_length(node) -> int:
    end_line = getattr(node, "end_lineno", None) or node.lineno
    return end_line - node.lineno + 1


def _argument_count(node) -> int:
    args = node.args
    count = len(args.posonlyargs) + len(args.args) + len(args.kwonlyargs)

    # `self` and `cls` are passed implicitly, so they should not count against
    # the argument budget of the author.
    if args.posonlyargs or args.args:
        first = (args.posonlyargs + args.args)[0].arg
        if first in {"self", "cls"}:
            count -= 1

    return count


class _PythonVisitor(ast.NodeVisitor):
    """Walks one parsed module and collects findings."""

    def __init__(self, path: str) -> None:
        self.path = path
        self.comments: list[ReviewComment] = []

    def _add(self, line: int, severity: Severity, rule: str, message: str) -> None:
        self.comments.append(
            ReviewComment(
                path=self.path, line=line, severity=severity, rule=rule, message=message
            )
        )

    def _check_function(self, node) -> None:
        complexity = cyclomatic_complexity(node)
        if complexity > MAX_COMPLEXITY:
            self._add(
                node.lineno,
                Severity.WARNING,
                "high-complexity",
                f"`{node.name}` has a cyclomatic complexity of {complexity} "
                f"(threshold {MAX_COMPLEXITY}). That is {complexity} independent paths to test. "
                "Consider extracting the branching logic into smaller helpers.",
            )

        length = _function_length(node)
        if length > MAX_FUNCTION_LINES:
            self._add(
                node.lineno,
                Severity.WARNING,
                "long-function",
                f"`{node.name}` is {length} lines long (threshold {MAX_FUNCTION_LINES}). "
                "Long functions are harder to test and to review.",
            )

        arg_count = _argument_count(node)
        if arg_count > MAX_ARGUMENTS:
            self._add(
                node.lineno,
                Severity.INFO,
                "too-many-arguments",
                f"`{node.name}` takes {arg_count} arguments (threshold {MAX_ARGUMENTS}). "
                "Grouping related arguments into a dataclass or model usually reads better.",
            )

        if not node.name.startswith("_") and not SNAKE_CASE.match(node.name):
            self._add(
                node.lineno,
                Severity.INFO,
                "naming-convention",
                f"Function `{node.name}` is not snake_case (PEP 8).",
            )

        if not node.name.startswith("_") and ast.get_docstring(node) is None:
            self._add(
                node.lineno,
                Severity.INFO,
                "missing-docstring",
                f"Public function `{node.name}` has no docstring.",
            )

        for default in node.args.defaults + [d for d in node.args.kw_defaults if d]:
            if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                self._add(
                    default.lineno,
                    Severity.ERROR,
                    "mutable-default-argument",
                    f"`{node.name}` uses a mutable default argument. Python creates it once "
                    "at definition time, so every call shares the same object. Use `None` and "
                    "build the container inside the function.",
                )

        self.generic_visit(node)

    visit_FunctionDef = _check_function
    visit_AsyncFunctionDef = _check_function

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        """Check class naming and docstrings."""
        if not PASCAL_CASE.match(node.name):
            self._add(
                node.lineno,
                Severity.INFO,
                "naming-convention",
                f"Class `{node.name}` is not PascalCase (PEP 8).",
            )

        if ast.get_docstring(node) is None and not node.name.startswith("_"):
            self._add(
                node.lineno,
                Severity.INFO,
                "missing-docstring",
                f"Public class `{node.name}` has no docstring.",
            )

        self.generic_visit(node)

    def visit_ExceptHandler(self, node: ast.ExceptHandler) -> None:
        """Flag bare excepts and handlers that swallow the failure."""
        if node.type is None:
            self._add(
                node.lineno,
                Severity.WARNING,
                "bare-except",
                "Bare `except:` also catches `KeyboardInterrupt` and `SystemExit`. "
                "Catch the exception types you actually expect.",
            )

        body_is_pass = len(node.body) == 1 and isinstance(node.body[0], ast.Pass)
        if body_is_pass:
            self._add(
                node.lineno,
                Severity.WARNING,
                "silent-failure",
                "This except block swallows the error without logging it, "
                "which makes the failure invisible in production.",
            )

        self.generic_visit(node)

    def visit_Compare(self, node: ast.Compare) -> None:
        """Flag equality comparisons against None, True and False."""
        for op, comparator in zip(node.ops, node.comparators):
            is_equality = isinstance(op, (ast.Eq, ast.NotEq))
            is_singleton = isinstance(comparator, ast.Constant) and comparator.value in (
                None,
                True,
                False,
            )
            if is_equality and is_singleton:
                self._add(
                    node.lineno,
                    Severity.INFO,
                    "identity-comparison",
                    f"Compare to `{comparator.value}` with `is` / `is not`, not `==` (PEP 8).",
                )

        self.generic_visit(node)


def analyze_python_source(path: str, source: str) -> list[ReviewComment]:
    """Run every Python rule over the source of one file.

    A syntax error is itself worth reporting: it means the branch does not even
    parse, so we return that as a single blocking finding.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return [
            ReviewComment(
                path=path,
                line=exc.lineno,
                severity=Severity.ERROR,
                rule="syntax-error",
                message=f"This file does not parse: {exc.msg}",
            )
        ]

    visitor = _PythonVisitor(path)
    visitor.visit(tree)
    return visitor.comments
