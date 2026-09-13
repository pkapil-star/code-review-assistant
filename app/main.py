"""Application entry point.

Wires the webhook router to the review queue and starts the background workers
that drain it for as long as the service is up.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.queue.instance import get_review_queue
from app.routers import webhooks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the review workers on boot and shut them down cleanly on exit."""
    queue = get_review_queue()
    await queue.start()
    logger.info("%s is ready (environment=%s)", settings.app_name, settings.environment)

    try:
        yield
    finally:
        await queue.stop()
        logger.info("Review workers stopped.")


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.include_router(webhooks.router)


@app.get("/")
def root():
    """Service identity, useful for a quick check that the right build is live."""
    return {
        "status": "ok",
        "service": "code-review-assistant",
        "environment": settings.environment,
    }


@app.get("/health")
def health():
    """Liveness probe for the platform that runs this service."""
    return {"status": "healthy"}


@app.get("/stats")
def stats():
    """Queue counters, so an operator can see the pipeline working."""
    queue = get_review_queue()

    return {
        "queue_backend": settings.queue_backend,
        "workers_running": queue.running,
        "ai_provider": settings.ai_provider,
        "stats": queue.stats.model_dump(),
    }
