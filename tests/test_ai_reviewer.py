"""Tests for the AI review layer.

The model is mocked everywhere here. These tests are about what the code does
with a model response, including the responses a model gets wrong.
"""

import json

import pytest

from app.ai.providers import MockProvider, get_provider
from app.ai.reviewer import build_user_prompt, extract_json, parse_comments, review_with_ai
from app.config import settings
from app.models.review import Severity


class FailingProvider:
    """A provider that always raises, standing in for an API outage."""

    name = "failing"

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Fail the way a timed-out API call would."""
        raise RuntimeError("model API is down")


def ai_response(**overrides) -> str:
    """Build a well-formed model response with one finding."""
    payload = {
        "summary": "Adds a null guard to the process helper.",
        "comments": [
            {
                "path": "app/service.py",
                "line": 4,
                "severity": "warning",
                "rule": "unchecked-input",
                "message": "This branch never validates the type of a.",
            }
        ],
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_extract_json_reads_plain_json():
    """The happy path: the model answered with JSON and nothing else."""
    assert extract_json('{"summary": "ok", "comments": []}')["summary"] == "ok"


def test_extract_json_reads_fenced_json():
    """Models often wrap the answer in a markdown code fence anyway."""
    raw = 'Here you go:\n```json\n{"summary": "ok", "comments": []}\n```'

    assert extract_json(raw)["summary"] == "ok"


def test_extract_json_returns_empty_on_garbage():
    """Unparseable output costs the AI findings, not the whole review."""
    assert extract_json("I could not review this pull request.") == {}
    assert extract_json("") == {}


def test_parse_comments_keeps_valid_findings(changed_files):
    """A finding on a real added line survives intact and is tagged as AI."""
    comments = parse_comments(json.loads(ai_response()), changed_files)

    assert len(comments) == 1
    assert comments[0].source == "ai"
    assert comments[0].severity == Severity.WARNING
    assert comments[0].line == 4


def test_parse_comments_drops_invented_files(changed_files):
    """A model that comments on a file it never saw gets ignored."""
    payload = json.loads(ai_response())
    payload["comments"][0]["path"] = "app/never_sent.py"

    assert parse_comments(payload, changed_files) == []


def test_parse_comments_unanchors_lines_outside_the_diff(changed_files):
    """A line the diff never added cannot carry an inline comment."""
    payload = json.loads(ai_response())
    payload["comments"][0]["line"] = 999

    comments = parse_comments(payload, changed_files)

    assert len(comments) == 1
    assert comments[0].line is None


def test_parse_comments_defaults_unknown_severity(changed_files):
    """An invented severity falls back to info rather than raising."""
    payload = json.loads(ai_response())
    payload["comments"][0]["severity"] = "catastrophic"

    assert parse_comments(payload, changed_files)[0].severity == Severity.INFO


def test_build_user_prompt_includes_diff_and_title(changed_files):
    """The prompt has to carry the title, the file list and the diff."""
    prompt = build_user_prompt("Add the process helper", changed_files)

    assert "Add the process helper" in prompt
    assert "app/service.py" in prompt
    assert "def process(a):" in prompt


@pytest.mark.asyncio
async def test_review_with_ai_returns_findings(changed_files):
    """End to end through a mock provider that answers correctly."""
    comments, summary = await review_with_ai(
        "title", changed_files, provider=MockProvider(ai_response())
    )

    assert len(comments) == 1
    assert summary.startswith("Adds a null guard")


@pytest.mark.asyncio
async def test_review_with_ai_survives_provider_failure(changed_files):
    """An API outage must not take the static findings down with it."""
    comments, summary = await review_with_ai("title", changed_files, provider=FailingProvider())

    assert comments == []
    assert summary == ""


def test_get_provider_falls_back_to_mock_without_key(monkeypatch):
    """No API key means static analysis only, not a crash on startup."""
    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    monkeypatch.setattr(settings, "anthropic_api_key", "")

    assert get_provider().name == "mock"
