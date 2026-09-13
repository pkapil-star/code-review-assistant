"""End-to-end tests for the review pipeline, with GitHub and the model faked."""

import base64
import json

import httpx
import pytest

from app.ai.providers import MockProvider
from app.config import settings
from app.github.client import GitHubClient
from app.models.events import parse_pull_request_event
from app.models.review import ReviewComment, ReviewResult, Severity
from app.pipeline import cap_comments, render_summary, review_pull_request, to_github_comments
from tests.conftest import files_payload, pull_request_payload

BUGGY_SOURCE = (
    "import os\n"
    "\n"
    "def process(a, b, c, d, e, f):\n"
    "    try:\n"
    "        return a / b\n"
    "    except:\n"
    "        pass\n"
)

BUGGY_PATCH = (
    "@@ -1,2 +1,7 @@\n"
    " import os\n"
    " \n"
    "+def process(a, b, c, d, e, f):\n"
    "+    try:\n"
    "+        return a / b\n"
    "+    except:\n"
    "+        pass\n"
)


def github_handler(captured: dict):
    """Answer the three endpoints the pipeline calls."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path

        if path.endswith("/files"):
            return httpx.Response(200, json=files_payload(BUGGY_PATCH))

        if "/contents/" in path:
            return httpx.Response(
                200,
                json={
                    "encoding": "base64",
                    "size": len(BUGGY_SOURCE),
                    "content": base64.b64encode(BUGGY_SOURCE.encode()).decode(),
                },
            )

        if path.endswith("/reviews"):
            captured["review"] = json.loads(request.content)
            return httpx.Response(201, json={"id": 1})

        return httpx.Response(404, json={"message": "unexpected call"})

    return handler


@pytest.fixture
def event():
    """A parsed pull_request event for the fake repository."""
    return parse_pull_request_event(pull_request_payload())


@pytest.mark.asyncio
async def test_pipeline_posts_a_review_with_findings(event, monkeypatch):
    """A pull request with real problems produces inline comments."""
    monkeypatch.setattr(settings, "post_comments", True)
    captured: dict = {}

    ai_answer = json.dumps(
        {
            "summary": "Division without a zero check.",
            "comments": [
                {
                    "path": "app/service.py",
                    "line": 5,
                    "severity": "error",
                    "rule": "division-by-zero",
                    "message": "b can be zero here.",
                }
            ],
        }
    )

    async with httpx.AsyncClient(transport=httpx.MockTransport(github_handler(captured))) as http:
        client = GitHubClient("token", client=http)
        result = await review_pull_request(event, client, provider=MockProvider(ai_answer))

    assert result.posted is True
    assert result.ai_used is True
    assert result.files_reviewed == 1

    rules = {c.rule for c in result.comments}
    assert "bare-except" in rules  # from static analysis
    assert "division-by-zero" in rules  # from the AI layer
    assert "missing-tests" in rules

    body = captured["review"]["body"]
    assert "Automated code review" in body
    assert captured["review"]["comments"]


@pytest.mark.asyncio
async def test_pipeline_respects_post_comments_switch(event, monkeypatch):
    """With posting off, the review is computed but never sent."""
    monkeypatch.setattr(settings, "post_comments", False)
    captured: dict = {}

    async with httpx.AsyncClient(transport=httpx.MockTransport(github_handler(captured))) as http:
        client = GitHubClient("token", client=http)
        result = await review_pull_request(event, client, provider=MockProvider())

    assert result.posted is False
    assert "review" not in captured
    assert result.comments


@pytest.mark.asyncio
async def test_pipeline_handles_pull_request_with_no_files(event, monkeypatch):
    """An empty pull request is a no-op, not an error."""
    monkeypatch.setattr(settings, "post_comments", True)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        client = GitHubClient("token", client=http)
        result = await review_pull_request(event, client, provider=MockProvider())

    assert result.files_reviewed == 0
    assert result.comments == []
    assert result.posted is False


def test_to_github_comments_skips_unanchored_findings():
    """A finding with no line cannot become an inline comment."""
    comments = [
        ReviewComment(path="a.py", line=3, rule="x", message="anchored"),
        ReviewComment(path="a.py", line=None, rule="y", message="floating"),
    ]

    payload = to_github_comments(comments)

    assert len(payload) == 1
    assert payload[0]["line"] == 3
    assert payload[0]["side"] == "RIGHT"


def test_render_summary_lists_unanchored_findings():
    """Findings without a line still reach the author through the body."""
    result = ReviewResult(files_reviewed=2)
    floating = ReviewComment(
        path="app/service.py", line=None, rule="missing-tests", message="add tests"
    )
    result.comments = [floating]

    body = render_summary(result, [floating])

    assert "missing-tests" in body
    assert "app/service.py" in body


def test_render_summary_reports_a_clean_pull_request():
    """A clean review says so instead of posting an empty comment."""
    body = render_summary(ReviewResult(files_reviewed=3), [])

    assert "No issues found" in body


def test_cap_comments_keeps_the_worst():
    """Over the limit, the most serious findings are the ones that survive."""
    comments = [
        ReviewComment(path="a.py", line=i, rule=f"r{i}", message="m", severity=Severity.ERROR)
        for i in range(30)
    ]

    assert len(cap_comments(comments, 20)) == 20
