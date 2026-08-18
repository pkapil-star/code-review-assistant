import hashlib
import hmac

from app.config import settings


def verify_webhook_signature(payload_body: bytes, signature_header: str | None) -> bool:
    """
    Verify a GitHub webhook payload using the X-Hub-Signature-256 header.
    GitHub signs the raw request body with our shared webhook secret (HMAC-SHA256).
    We recompute it ourselves and compare — this proves the request really came
    from GitHub and wasn't forged or tampered with in transit.
    """
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    expected_signature = hmac.new(
        key=settings.github_webhook_secret.encode("utf-8"),
        msg=payload_body,
        digestmod=hashlib.sha256,
    ).hexdigest()

    received_signature = signature_header.removeprefix("sha256=")

    return hmac.compare_digest(expected_signature, received_signature)
