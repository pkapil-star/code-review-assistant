"""The unit of work the queue carries.

A webhook must answer GitHub within a few seconds, and a full review takes much
longer than that. So the endpoint turns the event into a ReviewJob, drops it on
the queue, and returns immediately.
"""

from __future__ import annotations

import time
import uuid
from enum import Enum

from pydantic import BaseModel, Field

from app.models.events import PullRequestEvent


class JobStatus(str, Enum):
    """Where a job currently sits in its lifecycle."""

    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class ReviewJob(BaseModel):
    """One pull request waiting to be reviewed."""

    job_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    event: PullRequestEvent
    attempts: int = 0
    status: JobStatus = JobStatus.QUEUED
    error: str | None = None
    created_at: float = Field(default_factory=time.time)

    @property
    def description(self) -> str:
        """A short label for logs, in the form owner/repo#number."""
        return f"{self.event.full_name}#{self.event.pr_number}"


class QueueStats(BaseModel):
    """Counters the stats endpoint exposes, so the queue is observable."""

    enqueued: int = 0
    completed: int = 0
    failed: int = 0
    retried: int = 0
    pending: int = 0
    running: int = 0
