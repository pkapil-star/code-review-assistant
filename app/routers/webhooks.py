import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.security.webhook import verify_webhook_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/github")
async def github_webhook(
    request: Request,
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
    x_github_delivery: str | None = Header(default=None),
):
    payload_body = await request.body()

    if not verify_webhook_signature(payload_body, x_hub_signature_256):
        logger.warning("Rejected webhook with invalid signature. delivery_id=%s", x_github_delivery)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    logger.info("Received GitHub webhook. event=%s delivery_id=%s", x_github_event, x_github_delivery)

    # Phase 3 will parse this into a review job. For now, just acknowledge receipt.
    return {"status": "received", "event": x_github_event}
