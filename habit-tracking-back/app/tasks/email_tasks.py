import asyncio

from app.core.celery_app import celery_app


@celery_app.task(name="tasks.send_verification_email", bind=True, max_retries=3, default_retry_delay=60)
def send_verification_email_task(self, to_email: str, token: str) -> None:
    """Send email verification link asynchronously."""
    try:
        from app.services.email import send_verification_email
        asyncio.run(send_verification_email(to_email, token))
    except Exception as exc:
        raise self.retry(exc=exc)
