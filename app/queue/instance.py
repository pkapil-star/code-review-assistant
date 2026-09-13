"""The process-wide review queue.

The webhook endpoint and the application lifespan both need the same queue
object. Keeping it here, rather than in main.py, lets the router import it
without importing the application and creating a circular import.
"""

from __future__ import annotations

from app.pipeline import handle_review_job
from app.queue.jobs import ReviewJob
from app.queue.worker import ReviewQueue, build_queue

_queue: ReviewQueue | None = None


async def _handler(job: ReviewJob) -> None:
    """Adapt the pipeline to the handler signature the queue expects."""
    await handle_review_job(job)


def get_review_queue() -> ReviewQueue:
    """Return the shared queue, building it on first use."""
    global _queue

    if _queue is None:
        _queue = build_queue(_handler)

    return _queue


def set_review_queue(queue: ReviewQueue | None) -> None:
    """Replace the shared queue. Tests use this to install a fake."""
    global _queue
    _queue = queue
