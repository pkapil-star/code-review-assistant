"""A thin async client for the GitHub REST API.

Only the endpoints this project needs: read the files of a pull request, read a
file at a commit, and write the review back.
"""

from __future__ import annotations

import base64
import logging

import httpx

from app.analysis.diff import ChangedFile, build_changed_files
from app.config import settings
from app.github.auth import get_installation_token

logger = logging.getLogger(__name__)

# Files bigger than this are usually generated, vendored, or binary.
MAX_FILE_BYTES = 200_000


class GitHubAPIError(RuntimeError):
    """Raised when GitHub answers a request with an unexpected status."""


class GitHubClient:
    """Talks to one repository on behalf of one app installation."""

    def __init__(self, token: str, client: httpx.AsyncClient | None = None) -> None:
        self._token = token
        self._client = client or httpx.AsyncClient(timeout=30.0)
        self._owns_client = client is None

    @classmethod
    async def for_installation(
        cls, installation_id: int, client: httpx.AsyncClient | None = None
    ) -> "GitHubClient":
        """Build a client authenticated as the given installation."""
        token = await get_installation_token(installation_id, client=client)
        return cls(token, client=client)

    async def aclose(self) -> None:
        """Close the underlying HTTP connection pool when we own it."""
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> "GitHubClient":
        return self

    async def __aexit__(self, *exc_info) -> None:
        await self.aclose()

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _url(self, path: str) -> str:
        return f"{settings.github_api_url}{path}"

    async def list_pull_request_files(
        self, owner: str, repo: str, pr_number: int
    ) -> list[ChangedFile]:
        """Return every file the pull request touches, with its diff parsed.

        The endpoint pages at 100 files, so we follow pages until one comes back short.
        """
        files: list[dict] = []
        page = 1

        while True:
            response = await self._client.get(
                self._url(f"/repos/{owner}/{repo}/pulls/{pr_number}/files"),
                headers=self._headers,
                params={"per_page": 100, "page": page},
            )

            if response.status_code != 200:
                raise GitHubAPIError(
                    f"Could not list pull request files (HTTP {response.status_code}): "
                    f"{response.text}"
                )

            batch = response.json()
            files.extend(batch)

            if len(batch) < 100:
                break

            page += 1

        return build_changed_files(files)

    async def get_file_content(self, owner: str, repo: str, path: str, ref: str) -> str | None:
        """Read one file at a specific commit.

        Returns None when the file is missing, too large, or not decodable text,
        because none of those cases should stop the rest of the review.
        """
        response = await self._client.get(
            self._url(f"/repos/{owner}/{repo}/contents/{path}"),
            headers=self._headers,
            params={"ref": ref},
        )

        if response.status_code != 200:
            logger.info("Skipping %s: contents API returned %s", path, response.status_code)
            return None

        payload = response.json()

        if payload.get("encoding") != "base64" or payload.get("size", 0) > MAX_FILE_BYTES:
            return None

        try:
            return base64.b64decode(payload["content"]).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            logger.info("Skipping %s: content is not UTF-8 text", path)
            return None

    async def create_review(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        body: str,
        comments: list[dict],
        commit_sha: str | None = None,
    ) -> dict:
        """Post a single review carrying every inline comment.

        One review keeps the pull request timeline readable: the author gets one
        notification instead of one per finding.
        """
        payload: dict = {"body": body, "event": "COMMENT"}

        if comments:
            payload["comments"] = comments
        if commit_sha:
            payload["commit_id"] = commit_sha

        response = await self._client.post(
            self._url(f"/repos/{owner}/{repo}/pulls/{pr_number}/reviews"),
            headers=self._headers,
            json=payload,
        )

        if response.status_code in (200, 201):
            return response.json()

        # GitHub rejects the whole review when one comment points at a line that
        # is not part of the diff. Falling back to a plain comment means the
        # author still sees the findings instead of silently getting nothing.
        logger.warning(
            "Inline review rejected (HTTP %s): %s. Falling back to a summary comment.",
            response.status_code,
            response.text[:300],
        )
        return await self.create_issue_comment(owner, repo, pr_number, body)

    async def create_issue_comment(self, owner: str, repo: str, pr_number: int, body: str) -> dict:
        """Post a normal comment on the pull request conversation tab."""
        response = await self._client.post(
            self._url(f"/repos/{owner}/{repo}/issues/{pr_number}/comments"),
            headers=self._headers,
            json={"body": body},
        )

        if response.status_code not in (200, 201):
            raise GitHubAPIError(
                f"Could not post comment (HTTP {response.status_code}): {response.text}"
            )

        return response.json()
