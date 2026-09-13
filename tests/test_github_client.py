"""Tests for the GitHub client, driven by a fake transport.

No network here: httpx.MockTransport answers each request, which lets us assert
on the exact payload the client sends and on how it handles a rejection.
"""

import base64
import json

import httpx
import pytest

from app.github.client import GitHubClient
from tests.conftest import SAMPLE_PATCH, files_payload


def transport_for(handler) -> httpx.AsyncClient:
    """Wrap a request handler in an AsyncClient the GitHubClient can use."""
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_list_pull_request_files_parses_patches():
    """The file list comes back as ChangedFile objects with parsed diffs."""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/repos/octocat/hello-world/pulls/7/files"
        return httpx.Response(200, json=files_payload())

    async with transport_for(handler) as http:
        client = GitHubClient("token", client=http)
        files = await client.list_pull_request_files("octocat", "hello-world", 7)

    assert len(files) == 1
    assert files[0].path == "app/service.py"
    assert files[0].added_line_numbers == {3, 4, 5, 6}


@pytest.mark.asyncio
async def test_get_file_content_decodes_base64():
    """The contents endpoint returns base64, which we hand back as text."""
    source = "def process(a):\n    return a\n"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "encoding": "base64",
                "size": len(source),
                "content": base64.b64encode(source.encode()).decode(),
            },
        )

    async with transport_for(handler) as http:
        client = GitHubClient("token", client=http)
        content = await client.get_file_content("octocat", "hello-world", "app/service.py", "abc")

    assert content == source


@pytest.mark.asyncio
async def test_get_file_content_returns_none_when_missing():
    """A deleted or unreadable file must not break the rest of the review."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "Not Found"})

    async with transport_for(handler) as http:
        client = GitHubClient("token", client=http)
        content = await client.get_file_content("octocat", "hello-world", "gone.py", "abc")

    assert content is None


@pytest.mark.asyncio
async def test_create_review_posts_inline_comments():
    """The review is sent as one request carrying every inline comment."""
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["body"] = json.loads(request.content)
        return httpx.Response(201, json={"id": 1})

    comments = [{"path": "app/service.py", "line": 4, "side": "RIGHT", "body": "careful"}]

    async with transport_for(handler) as http:
        client = GitHubClient("token", client=http)
        await client.create_review(
            "octocat", "hello-world", 7, "summary", comments, commit_sha="abc1234"
        )

    assert captured["path"] == "/repos/octocat/hello-world/pulls/7/reviews"
    assert captured["body"]["event"] == "COMMENT"
    assert captured["body"]["comments"] == comments
    assert captured["body"]["commit_id"] == "abc1234"


@pytest.mark.asyncio
async def test_create_review_falls_back_to_a_plain_comment():
    """When GitHub rejects the inline review, the author still gets the findings."""
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("/reviews"):
            return httpx.Response(422, json={"message": "line must be part of the diff"})
        return httpx.Response(201, json={"id": 2})

    async with transport_for(handler) as http:
        client = GitHubClient("token", client=http)
        result = await client.create_review(
            "octocat",
            "hello-world",
            7,
            "summary",
            [{"path": "app/service.py", "line": 900, "side": "RIGHT", "body": "x"}],
        )

    assert result["id"] == 2
    assert calls[-1] == "/repos/octocat/hello-world/issues/7/comments"


@pytest.mark.asyncio
async def test_list_pull_request_files_raises_on_error():
    """An unexpected status is an error the queue should retry, not swallow."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="server error")

    async with transport_for(handler) as http:
        client = GitHubClient("token", client=http)

        with pytest.raises(Exception):
            await client.list_pull_request_files("octocat", "hello-world", 7)


def test_sample_patch_is_parseable():
    """Guard the fixture itself, since every other test leans on it."""
    assert SAMPLE_PATCH.startswith("@@")
