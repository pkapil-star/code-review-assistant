import hashlib
import hmac

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def _sign(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_webhook_rejects_invalid_signature():
    response = client.post(
        "/webhooks/github",
        content=b'{"action": "opened"}',
        headers={"X-Hub-Signature-256": "sha256=invalid", "X-GitHub-Event": "pull_request"},
    )
    assert response.status_code == 401


def test_webhook_accepts_valid_signature(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "test-secret")
    payload = b'{"action": "opened"}'
    response = client.post(
        "/webhooks/github",
        content=payload,
        headers={"X-Hub-Signature-256": _sign("test-secret", payload), "X-GitHub-Event": "pull_request"},
    )
    assert response.status_code == 200
    assert response.json()["event"] == "pull_request"
