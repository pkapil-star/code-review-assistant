import hashlib
import hmac

from app.config import settings
from app.security.webhook import verify_webhook_signature


def _sign(secret: str, body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_valid_signature_passes(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "test-secret")
    body = b'{"action": "opened"}'
    assert verify_webhook_signature(body, _sign("test-secret", body)) is True


def test_invalid_signature_fails(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "test-secret")
    body = b'{"action": "opened"}'
    assert verify_webhook_signature(body, "sha256=deadbeef") is False


def test_missing_signature_fails(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "test-secret")
    body = b'{"action": "opened"}'
    assert verify_webhook_signature(body, None) is False
