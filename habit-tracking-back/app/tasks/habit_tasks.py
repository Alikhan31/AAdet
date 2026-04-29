import asyncio

from app.core.celery_app import celery_app


def _make_session():
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.config import get_settings
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    return engine, async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@celery_app.task(name="tasks.recompute_streaks_xp", bind=True, max_retries=3, default_retry_delay=30)
def recompute_streaks_xp_task(self, user_id: int) -> None:
    """Recompute XP and streaks for a user in the background."""
    async def run():
        from app.services.analytics import recompute_streaks_and_xp
        engine, session_factory = _make_session()
        try:
            async with session_factory() as session:
                async with session.begin():
                    await recompute_streaks_and_xp(user_id, session)
        finally:
            await engine.dispose()

    try:
        asyncio.run(run())
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="tasks.create_activity_event", bind=True, max_retries=3, default_retry_delay=30)
def create_activity_event_task(self, user_id: int, event_type: str, payload: dict) -> None:
    """Write an activity feed event in the background."""
    async def run():
        from app.services.activity_feed import create_event
        engine, session_factory = _make_session()
        try:
            async with session_factory() as session:
                async with session.begin():
                    await create_event(user_id, event_type, payload, session)
        finally:
            await engine.dispose()

    try:
        asyncio.run(run())
    except Exception as exc:
        raise self.retry(exc=exc)


@celery_app.task(name="tasks.invalidate_user_cache")
def invalidate_user_cache_task(user_id: int) -> None:
    """Delete all cached analytics entries for a user."""
    async def run():
        from app.core.redis import cache_delete
        await cache_delete(
            f"cache:analytics:summary:{user_id}",
            f"cache:analytics:leaderboard:{user_id}",
        )

    asyncio.run(run())
