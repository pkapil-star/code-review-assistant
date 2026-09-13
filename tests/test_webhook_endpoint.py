"""Tests for the webhook endpoint, from signature check through to queueing."""

import json

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
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
    """A valid opened pull request becomes exactly one queued job."""
    monkeypatch.setattr(settings, "github_webhook_secret", SECRET)

    response = post_event(pull_request_payload())

    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    assert response.json()["pull_request"] == "octocat/hello-world#7"

    assert len(recording_queue.jobs) == 1
    job = recording_queue.jobs[0]
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
