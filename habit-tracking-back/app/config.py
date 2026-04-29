from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Database
    database_url: str = "sqlite+aiosqlite:///./habit_tracking.db"

    # JWT
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # App
    app_env: str = "development"

    # Google OAuth
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    # AI
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    grok_api_key: str | None = None
    ai_chat_provider: str = "grok"  # "grok" | "claude" | "gemini"

    # Email / SMTP
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "noreply@adet.app"

    # Frontend URL for building verification links
    frontend_url: str = "http://localhost:3000"

    # Redis (optional — if not set, caching and Celery are disabled)
    redis_url: str | None = None

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
