import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.models.events import UnsupportedEventError, parse_pull_request_event
from app.pipeline import handle_review_job
from app.queue.jobs import ReviewJob
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
    """Receive a GitHub webhook, verify it, and queue a review.

    The handler stays deliberately short. GitHub retries a delivery that does
    not answer quickly, so all real work happens on the queue instead of here.
    """
    payload_body = await request.body()

    if not verify_webhook_signature(payload_body, x_hub_signature_256):
        logger.warning("Rejected webhook with invalid signature. delivery_id=%s", x_github_delivery)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    logger.info(
        "Received GitHub webhook. event=%s delivery_id=%s", x_github_event, x_github_delivery
    )

    if x_github_event == "ping":
        return {"status": "pong"}

    if x_github_event != "pull_request":
        return {"status": "ignored", "event": x_github_event, "reason": "not a pull request event"}

    try:
        event = parse_pull_request_event(await request.json())
    except (UnsupportedEventError, ValueError) as exc:
        logger.warning("Could not parse pull_request payload: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Malformed payload: {exc}"
        ) from exc

    if not event.should_review():
        reason = "draft pull request" if event.draft else f"action {event.action} needs no review"
        logger.info("Skipping %s: %s", event.full_name, reason)
        return {"status": "ignored", "event": x_github_event, "reason": reason}

    # Run the review inline rather than handing it to the background queue.
    # A serverless deployment (Vercel, etc.) recycles the process as soon as
    # this handler returns, which kills an in-flight background task before
    # it finishes. GitHub allows ~10s before it considers the delivery slow,
    # which is enough for the static + mock-AI path this deployment runs.
    try:
        result = await handle_review_job(ReviewJob(event=event))
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller, already recorded for the dashboard
        logger.exception("Review failed for %s#%s", event.full_name, event.pr_number)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return {
        "status": "completed",
        "event": x_github_event,
        "pull_request": f"{event.full_name}#{event.pr_number}",
        "posted": result.posted,
        "comments": len(result.comments),
    }
