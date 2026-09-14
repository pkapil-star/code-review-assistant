"""Tests for the webhook endpoint, from signature check through to queueing."""

import json

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from app.models.review import ReviewResult
from app.routers import webhooks
from tests.conftest import pull_request_payload, sign

client = TestClient(app)

SECRET = "test-secret"


def post_event(payload: dict, event: str = "pull_request", secret: str = SECRET):
    """Send a signed webhook the way GitHub would."""
    body = json.dumps(payload).encode("utf-8")
    return client.post(
        "/webhooks/github",
        content=body,
        headers={"X-Hub-Signature-256": sign(secret, body), "X-GitHub-Event": event},
    )


def test_webhook_rejects_invalid_signature():
    """An unsigned or wrongly signed request must never reach the queue."""
    response = client.post(
        "/webhooks/github",
        content=b'{"action": "opened"}',
        headers={"X-Hub-Signature-256": "sha256=invalid", "X-GitHub-Event": "pull_request"},
    )
    assert response.status_code == 401


def test_webhook_queues_pull_request(monkeypatch, recording_queue):
    """A valid opened pull request runs the review pipeline inline and reports the outcome.

    The pipeline itself (GitHub auth, static analysis, AI, posting) is exercised
    by tests/test_pipeline.py; this test only checks the webhook handler wires
    the parsed event through to it and shapes the response.
    """
    monkeypatch.setattr(settings, "github_webhook_secret", SECRET)

    captured_jobs = []

    async def fake_handle_review_job(job):
        captured_jobs.append(job)
        return ReviewResult(owner=job.event.owner, repo=job.event.repo, pr_number=job.event.pr_number)

    monkeypatch.setattr(webhooks, "handle_review_job", fake_handle_review_job)

    response = post_event(pull_request_payload())

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["pull_request"] == "octocat/hello-world#7"

    assert len(captured_jobs) == 1
    job = captured_jobs[0]
    assert job.event.owner == "octocat"
    assert job.event.pr_number == 7
    assert job.event.installation_id == 12345


def test_webhook_answers_ping(monkeypatch, recording_queue):
    """The ping GitHub sends when the app is installed is acknowledged, not queued."""
    monkeypatch.setattr(settings, "github_webhook_secret", SECRET)

    response = post_event({"zen": "Keep it logically awesome."}, event="ping")

    assert response.status_code == 200
    assert response.json()["status"] == "pong"
    assert recording_queue.jobs == []


def test_webhook_ignores_other_events(monkeypatch, recording_queue):
    """Events the app does not review are acknowledged without work."""
    monkeypatch.setattr(settings, "github_webhook_secret", SECRET)

    response = post_event({"ref": "refs/heads/main"}, event="push")

    assert response.status_code == 200
    assert response.json()["status"] == "ignored"
    assert recording_queue.jobs == []


def test_webhook_skips_draft_pull_requests(monkeypatch, recording_queue):
    """A draft is still being written, so reviewing it would just be noise."""
    monkeypatch.setattr(settings, "github_webhook_secret", SECRET)

    payload = pull_request_payload()
    payload["pull_request"]["draft"] = True

    response = post_event(payload)

    assert response.json()["status"] == "ignored"
    assert recording_queue.jobs == []


def test_webhook_skips_closed_action(monkeypatch, recording_queue):
    """Closing a pull request is not a reason to review it."""
    monkeypatch.setattr(settings, "github_webhook_secret", SECRET)

    response = post_event(pull_request_payload(action="closed"))

    assert response.json()["status"] == "ignored"
    assert recording_queue.jobs == []


def test_webhook_rejects_malformed_payload(monkeypatch, recording_queue):
    """A signed but unusable payload is a client error, not a crash."""
    monkeypatch.setattr(settings, "github_webhook_secret", SECRET)

    response = post_event({"action": "opened"})

    assert response.status_code == 400
    assert recording_queue.jobs == []
