"""Tests for the job queue and its workers."""

import asyncio

import pytest

from app.models.events import PullRequestEvent
from app.queue.jobs import JobStatus, ReviewJob
from app.queue.worker import ReviewQueue


def make_job() -> ReviewJob:
    """Build a job for a fictional pull request."""
    event = PullRequestEvent(
        action="opened",
        owner="octocat",
        repo="hello-world",
        pr_number=7,
        head_sha="abc1234",
        installation_id=12345,
    )
    return ReviewJob(event=event)


@pytest.mark.asyncio
async def test_queue_processes_a_job():
    """A queued job reaches the handler and ends up done."""
    handled: list[str] = []

    async def handler(job: ReviewJob) -> None:
        handled.append(job.job_id)

    queue = ReviewQueue(handler, worker_count=1)
    await queue.start()

    job = await queue.enqueue(make_job())
    await queue.join()
    await queue.stop()

    assert handled == [job.job_id]
    assert job.status == JobStatus.DONE
    assert queue.stats.completed == 1


@pytest.mark.asyncio
async def test_queue_handles_concurrent_jobs():
    """A burst of events is buffered, not dropped."""
    handled: list[str] = []

    async def handler(job: ReviewJob) -> None:
        await asyncio.sleep(0)
        handled.append(job.job_id)

    queue = ReviewQueue(handler, worker_count=3)
    await queue.start()

    for _ in range(10):
        await queue.enqueue(make_job())

    await queue.join()
    await queue.stop()

    assert len(handled) == 10
    assert queue.stats.completed == 10


@pytest.mark.asyncio
async def test_queue_retries_then_succeeds():
    """A transient failure is retried instead of being lost."""
    attempts = {"count": 0}

    async def flaky_handler(job: ReviewJob) -> None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise RuntimeError("GitHub returned 502")

    queue = ReviewQueue(flaky_handler, worker_count=1, max_retries=2, backoff_seconds=0)
    await queue.start()

    job = await queue.enqueue(make_job())
    await queue.join()
    await queue.stop()

    assert attempts["count"] == 2
    assert job.status == JobStatus.DONE
    assert queue.stats.retried == 1


@pytest.mark.asyncio
async def test_queue_gives_up_after_max_retries():
    """A permanently broken job fails loudly and stops consuming workers."""

    async def always_fails(job: ReviewJob) -> None:
        raise RuntimeError("repository was deleted")

    queue = ReviewQueue(always_fails, worker_count=1, max_retries=1, backoff_seconds=0)
    await queue.start()

    job = await queue.enqueue(make_job())
    await queue.join()
    await queue.stop()

    assert job.status == JobStatus.FAILED
    assert job.attempts == 2
    assert queue.stats.failed == 1
    assert "repository was deleted" in (job.error or "")


@pytest.mark.asyncio
async def test_worker_survives_a_failing_job():
    """One bad job must not stop the worker from taking the next one."""
    seen: list[int] = []

    async def handler(job: ReviewJob) -> None:
        seen.append(job.event.pr_number)
        if job.event.pr_number == 1:
            raise RuntimeError("boom")

    queue = ReviewQueue(handler, worker_count=1, max_retries=0, backoff_seconds=0)
    await queue.start()

    bad = make_job()
    bad.event.pr_number = 1
    good = make_job()
    good.event.pr_number = 2

    await queue.enqueue(bad)
    await queue.enqueue(good)
    await queue.join()
    await queue.stop()

    assert 2 in seen
    assert good.status == JobStatus.DONE
