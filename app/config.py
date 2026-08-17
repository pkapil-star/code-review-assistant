from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Automated Code Review Assistant"
    environment: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()