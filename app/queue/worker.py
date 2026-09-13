"""An async job queue with background workers.

Bursts happen: a team merges a branch and twenty pull requests get updated at
once. Reviewing inline would make GitHub wait and time the webhook out, so jobs
buffer here and a small pool of workers drains them.

The default backend is an in-process asyncio queue, which needs no extra
service to run. Setting QUEUE_BACKEND=redis swaps in a Redis list so jobs
survive a restart and several instances can share the load.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

from app.config import settings
from app.queue.jobs import JobStatus, QueueStats, ReviewJob

logger = logging.getLogger(__name__)

JobHandler = Callable[[ReviewJob], Awaitable[None]]

REDIS_QUEUE_KEY = "code-review:jobs"

# Wait this long, times the attempt number, before retrying a failed job.
RETRY_BACKOFF_SECONDS = 2.0


class ReviewQueue:
    """An in-process queue plus the workers that drain it."""

    def __init__(
        self,
        handler: JobHandler,
        worker_count: int | None = None,
        max_retries: int | None = None,
        backoff_seconds: float = RETRY_BACKOFF_SECONDS,
    ) -> None:
        self._handler = handler
        self._worker_count = worker_count or settings.queue_workers
        self._max_retries = settings.queue_max_retries if max_retries is None else max_retries
        self._backoff_seconds = backoff_seconds

        self._queue: asyncio.Queue[ReviewJob] = asyncio.Queue()
        self._workers: list[asyncio.Task] = []
        self.stats = QueueStats()

    @property
    def running(self) -> bool:
        """True while worker tasks are alive."""
        return any(not worker.done() for worker in self._workers)

    async def enqueue(self, job: ReviewJob) -> ReviewJob:
        """Add a job to the queue and return it."""
        job.status = JobStatus.QUEUED
        await self._queue.put(job)

        self.stats.enqueued += 1
        self.stats.pending = self._queue.qsize()

        logger.info("Queued review job %s for %s", job.job_id, job.description)
        return job

    async def start(self) -> None:
        """Spin up the worker tasks. Calling it twice is a no-op."""
        if self._workers:
            return

        self._workers = [
            asyncio.create_task(self._worker_loop(index), name=f"review-worker-{index}")
            for index in range(self._worker_count)
        ]
        logger.info("Started %d review worker(s)", self._worker_count)

    async def stop(self) -> None:
        """Cancel the workers and wait for them to finish unwinding."""
        for worker in self._workers:
            worker.cancel()

        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)

        self._workers = []

    async def join(self) -> None:
        """Block until every queued job has been processed. Used by tests."""
        await self._queue.join()

    async def _worker_loop(self, index: int) -> None:
        """Take jobs off the queue forever, one at a time."""
        while True:
            job = await self._queue.get()
            self.stats.pending = self._queue.qsize()
            self.stats.running += 1

            try:
                await self._run_job(job)
            finally:
                self.stats.running -= 1
                self._queue.task_done()

    async def _run_job(self, job: ReviewJob) -> None:
        """Run one job, retrying with backoff when the handler raises.

        Retries matter because the two things most likely to fail here, the
        GitHub API and the model API, both fail transiently.
        """
        job.attempts += 1
        job.status = JobStatus.RUNNING

        try:
            await self._handler(job)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - one bad job must not kill the worker
            job.error = str(exc)
            logger.exception("Review job %s failed on attempt %d", job.job_id, job.attempts)

            if job.attempts <= self._max_retries:
                self.stats.retried += 1
                await asyncio.sleep(self._backoff_seconds * job.attempts)
                await self.enqueue(job)
                return

            job.status = JobStatus.FAILED
            self.stats.failed += 1
            logger.error(
                "Giving up on review job %s for %s after %d attempts",
                job.job_id,
                job.description,
                job.attempts,
            )
            return

        job.status = JobStatus.DONE
        job.error = None
        self.stats.completed += 1
        logger.info("Finished review job %s for %s", job.job_id, job.description)


class RedisReviewQueue(ReviewQueue):
    """A ReviewQueue that buffers jobs in a Redis list instead of in memory.

    Jobs outlive a restart, and several instances of the service can pull from
    the same list. The class falls back to the in-memory behaviour if Redis is
    unreachable, so a missing Redis costs throughput rather than the endpoint.
    """

    def __init__(self, handler: JobHandler, redis_url: str | None = None, **kwargs) -> None:
        super().__init__(handler, **kwargs)
        self._redis_url = redis_url or settings.redis_url
        self._redis = None

    async def _connect(self):
        """Return a Redis connection, or None when the library or server is missing."""
        if self._redis is not None:
            return self._redis

        try:
            import redis.asyncio as redis_asyncio
        except ImportError:
            logger.warning("QUEUE_BACKEND=redis but the redis package is not installed.")
            return None

        try:
            client = redis_asyncio.from_url(self._redis_url, decode_responses=True)
            await client.ping()
        except Exception as exc:  # noqa: BLE001 - any connection problem means fall back
            logger.warning("Cannot reach Redis at %s: %s", self._redis_url, exc)
            return None

        self._redis = client
        return client

    async def enqueue(self, job: ReviewJob) -> ReviewJob:
        """Push the job onto the Redis list, or into memory when Redis is down."""
        client = await self._connect()

        if client is None:
            return await super().enqueue(job)

        job.status = JobStatus.QUEUED
        await client.lpush(REDIS_QUEUE_KEY, job.model_dump_json())

        self.stats.enqueued += 1
        self.stats.pending = await client.llen(REDIS_QUEUE_KEY)

        logger.info("Queued review job %s in Redis for %s", job.job_id, job.description)
        return job

    async def _worker_loop(self, index: int) -> None:
        """Block on the Redis list and run whatever arrives."""
        client = await self._connect()

        if client is None:
            await super()._worker_loop(index)
            return

        while True:
            entry = await client.brpop(REDIS_QUEUE_KEY, timeout=5)

            if entry is None:
                continue

            _, raw = entry
            job = ReviewJob.model_validate_json(raw)

            self.stats.running += 1
            try:
                await self._run_job(job)
            finally:
                self.stats.running -= 1
                self.stats.pending = await client.llen(REDIS_QUEUE_KEY)


def build_queue(handler: JobHandler) -> ReviewQueue:
    """Create the queue named by QUEUE_BACKEND."""
    if settings.queue_backend.lower().strip() == "redis":
        return RedisReviewQueue(handler)

    return ReviewQueue(handler)
