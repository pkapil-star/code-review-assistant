"""Application entry point.

Wires the webhook router to the review queue, exposes the dashboard read API,
starts the background workers that drain the queue, and serves the built
frontend when one is present.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.queue.instance import get_review_queue
from app.routers import api, webhooks
from app.store.memory import get_store

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

    if settings.demo_data:
        from app.store.demo import seed

        await seed(get_store())
        logger.info("Seeded the review store with demo data (DEMO_DATA is on).")

    logger.info("%s is ready (environment=%s)", settings.app_name, settings.environment)

    try:
        yield
    finally:
        await queue.stop()
        logger.info("Review workers stopped.")


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhooks.router)
app.include_router(api.router)


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


def mount_frontend(app: FastAPI) -> None:
    """Serve the built dashboard from the same origin as the API.

    The frontend is a single-page app, so any path the API does not claim has to
    return index.html and let the router in the browser decide what it means.
    Without a build present the service still runs headless, which is what a
    webhook-only deployment wants.
    """
    dist = Path(settings.frontend_dist)

    if not (dist / "index.html").exists():
        logger.info(
            "No frontend build at %s. Serving the API only. "
            "Run `npm install && npm run build` in frontend/ to include the dashboard.",
            dist.resolve(),
        )

        @app.get("/")
        def root():
            """Service identity, useful for a quick check that the right build is live."""
            return {
                "status": "ok",
                "service": "code-review-assistant",
                "environment": settings.environment,
                "dashboard": "not built",
            }

        return

    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    index = dist / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        """Return a static file when one matches, otherwise the app shell."""
        candidate = dist / full_path

        if full_path and candidate.is_file():
            return FileResponse(candidate)

        return FileResponse(index)

    logger.info("Serving the dashboard from %s", dist.resolve())


mount_frontend(app)
