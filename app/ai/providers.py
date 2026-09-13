"""LLM providers for the AI review layer.

The pipeline only ever sees the LLMProvider interface, so swapping Claude for a
different model, or for the offline mock, changes one setting and nothing else.
"""

from __future__ import annotations

import json
import logging
from typing import Protocol

from app.config import settings

logger = logging.getLogger(__name__)


class LLMProvider(Protocol):
    """Anything that can turn a review prompt into raw model text."""

    name: str

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Send the prompt to the model and return its raw text response."""
        ...


class MockProvider:
    """An offline provider used by tests and by runs with no API key configured.

    It returns a valid, empty review so the rest of the pipeline behaves exactly
    as it would in production, just without any model findings.
    """

    name = "mock"

    def __init__(self, response: str | None = None) -> None:
        self._response = response or json.dumps(
            {"summary": "AI review skipped: no model configured.", "comments": []}
        )

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Return the canned response, ignoring the prompt."""
        return self._response


class AnthropicProvider:
    """Calls Claude through the official Anthropic SDK."""

    name = "anthropic"

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self._api_key = api_key or settings.anthropic_api_key
        self._model = model or settings.anthropic_model

        if not self._api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set.")

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Send one message to Claude and return the text of the reply."""
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self._api_key)

        message = await client.messages.create(
            model=self._model,
            max_tokens=settings.ai_max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )

        return "".join(block.text for block in message.content if block.type == "text")


def get_provider() -> LLMProvider:
    """Build the provider named in settings, falling back to the mock.

    A missing API key must not take the whole service down: the static analysis
    layer still has value on its own, so we degrade instead of failing.
    """
    provider_name = settings.ai_provider.lower().strip()

    if provider_name == "mock":
        return MockProvider()

    if provider_name == "anthropic":
        try:
            return AnthropicProvider()
        except ValueError:
            logger.warning(
                "AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty. "
                "Running with static analysis only."
            )
            return MockProvider()

    logger.warning("Unknown AI_PROVIDER %r. Running with static analysis only.", provider_name)
    return MockProvider()
