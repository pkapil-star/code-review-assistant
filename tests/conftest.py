"""Shared fixtures and helpers for the test suite."""

from __future__ import annotations

import hashlib
import hmac

import pytest

from app.analysis.diff import build_changed_files
from app.queue.instance import set_review_queue
from app.queue.jobs import ReviewJob
from app.queue.worker import ReviewQueue

SAMPLE_PATCH = (
    "@@ -1,4 +1,8 @@\n"
    " import os\n"
    " \n"
    "-def old_name(a):\n"
    "+def process(a):\n"
    "+    if a is None:\n"
    "+        return None\n"
    "+    return a * 2\n"
    " \n"
    " print(os.getcwd())\n"
)


def sign(secret: str, body: bytes) -> str:
    """Build the X-Hub-Signature-256 header value GitHub would send."""
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def pull_request_payload(**overrides) -> dict:
    """A pull_request webhook payload trimmed to the fields the app reads."""
    payload = {
        "action": "opened",
        "installation": {"id": 12345},
        "repository": {"full_name": "octocat/hello-world"},
        "pull_request": {
            "number": 7,
            "title": "Add the process helper",
            "draft": False,
            "head": {"sha": "abc1234"},
        },
    }
    payload.update(overrides)
    return payload


def files_payload(patch: str = SAMPLE_PATCH, filename: str = "app/service.py") -> list[dict]:
    """A response shaped like the GitHub list pull request files endpoint."""
    return [{"filename": filename, "status": "modified", "patch": patch}]


@pytest.fixture
def changed_files():
    """One parsed changed file built from the sample patch."""
    return build_changed_files(files_payload())


class RecordingQueue(ReviewQueue):
    """A queue that records jobs instead of running them, for endpoint tests."""

    def __init__(self) -> None:
        super().__init__(handler=self._noop)
        self.jobs: list[ReviewJob] = []

    async def _noop(self, job: ReviewJob) -> None:
        """Do nothing. The endpoint test only cares that the job was queued."""

    async def enqueue(self, job: ReviewJob) -> ReviewJob:
        """Record the job and skip the worker machinery entirely."""
        self.jobs.append(job)
        self.stats.enqueued += 1
        return job


@pytest.fixture
def recording_queue():
    """Install a recording queue for the duration of one test."""
    queue = RecordingQueue()
    set_review_queue(queue)
    yield queue
    set_review_queue(None)
