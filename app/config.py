from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Automated Code Review Assistant"
    environment: str = "development"

    github_app_id: str = ""
    github_webhook_secret: str = ""
    github_private_key_path: str = ""

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()