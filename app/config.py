from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables or a local .env file."""

    app_name: str = "Automated Code Review Assistant"
    environment: str = "development"

    # GitHub App credentials.
    github_app_id: str = ""
    github_webhook_secret: str = ""
    github_private_key_path: str = ""
    github_api_url: str = "https://api.github.com"

    # AI review layer.
    ai_provider: str = "anthropic"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    ai_max_tokens: int = 4000

    # Review behaviour.
    max_comments_per_review: int = 20
    max_diff_bytes: int = 100_000
    post_comments: bool = True

    # Queue.
    queue_backend: str = "memory"
    redis_url: str = "redis://localhost:6379/0"
    queue_max_retries: int = 3
    queue_workers: int = 2

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
