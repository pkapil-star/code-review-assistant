"""GitHub App authentication.

A GitHub App never uses a personal token. It signs a short-lived JWT with its
private key, exchanges that JWT for an installation access token, and uses the
installation token to act inside one repository. Installation tokens expire
after an hour, so we cache them and refresh a minute early.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

import httpx
import jwt

from app.config import settings

# GitHub rejects a JWT that lives longer than 10 minutes.
JWT_LIFETIME_SECONDS = 9 * 60

# Refresh a little before real expiry so an in-flight request cannot use a dead token.
TOKEN_REFRESH_MARGIN_SECONDS = 60


class GitHubAuthError(RuntimeError):
    """Raised when the app cannot authenticate against GitHub."""


@dataclass
class InstallationToken:
    """An installation access token and the moment it stops working."""

    token: str
    expires_at: float

    def is_valid(self, now: float | None = None) -> bool:
        """Return True while the token still has more than the refresh margin left."""
        now = time.time() if now is None else now
        return now < self.expires_at - TOKEN_REFRESH_MARGIN_SECONDS


def read_private_key(path: str | None = None) -> str:
    """Load the PEM private key that GitHub generated for this app."""
    key_path = Path(path or settings.github_private_key_path)

    if not key_path.is_file():
        raise GitHubAuthError(
            f"GitHub App private key not found at {key_path}. "
            "Download it from the app settings page and set GITHUB_PRIVATE_KEY_PATH."
        )

    return key_path.read_text(encoding="utf-8")


def build_app_jwt(now: int | None = None) -> str:
    """Create the JWT that proves we are the app itself, not an installation."""
    if not settings.github_app_id:
        raise GitHubAuthError("GITHUB_APP_ID is not set.")

    issued_at = int(time.time()) if now is None else now

    payload = {
        # Backdate by 60s so a small clock skew on our side is not fatal.
        "iat": issued_at - 60,
        "exp": issued_at + JWT_LIFETIME_SECONDS,
        "iss": settings.github_app_id.strip(),
    }

    return jwt.encode(payload, read_private_key(), algorithm="RS256")


class InstallationTokenCache:
    """Keeps one live installation token per installation id."""

    def __init__(self) -> None:
        self._tokens: dict[int, InstallationToken] = {}

    def get(self, installation_id: int) -> InstallationToken | None:
        """Return the cached token when it is still usable, otherwise None."""
        token = self._tokens.get(installation_id)
        if token and token.is_valid():
            return token
        return None

    def set(self, installation_id: int, token: InstallationToken) -> None:
        """Store a freshly issued token."""
        self._tokens[installation_id] = token

    def clear(self) -> None:
        """Forget every cached token. Used by tests and on auth failures."""
        self._tokens.clear()


token_cache = InstallationTokenCache()


async def get_installation_token(
    installation_id: int, client: httpx.AsyncClient | None = None
) -> str:
    """Return a valid installation access token, fetching a new one when needed."""
    cached = token_cache.get(installation_id)
    if cached:
        return cached.token

    url = f"{settings.github_api_url}/app/installations/{installation_id}/access_tokens"
    headers = {
        "Authorization": f"Bearer {build_app_jwt()}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=20.0)

    try:
        response = await client.post(url, headers=headers)
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code != 201:
        raise GitHubAuthError(
            f"Could not create an installation token (HTTP {response.status_code}): {response.text}"
        )

    payload = response.json()
    token = InstallationToken(
        token=payload["token"],
        # The response carries an ISO timestamp, but a local deadline is enough
        # and avoids trusting the clock difference between us and the API.
        expires_at=time.time() + 3600,
    )
    token_cache.set(installation_id, token)

    return token.token
