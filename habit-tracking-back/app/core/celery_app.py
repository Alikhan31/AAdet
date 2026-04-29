from celery import Celery

from app.config import get_settings

settings = get_settings()

# If Redis is not configured, use a dummy in-memory broker so imports don't crash.
# Tasks will still be called synchronously as fallback in that case.
_broker = settings.redis_url or "memory://"
_backend = settings.redis_url or "cache+memory://"

celery_app = Celery(
    "adet",
    broker=_broker,
    backend=_backend,
    include=["app.tasks.email_tasks", "app.tasks.habit_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
