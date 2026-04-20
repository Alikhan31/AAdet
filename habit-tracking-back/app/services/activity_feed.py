"""Activity feed: create events for feed and motivation."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityEvent


async def create_event(
    user_id: int,
    event_type: str,
    payload: dict | None,
    db: AsyncSession,
) -> ActivityEvent:
    event = ActivityEvent(user_id=user_id, event_type=event_type, payload=payload)
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event
