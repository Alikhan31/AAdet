"""Activity feed: create events for feed and motivation."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityEvent


async def create_event(
    user_id: int,
    event_type: str,
    payload: dict | None,
    db: AsyncSession,
) -> ActivityEvent:
    # For habit_completed: one event per habit per day — return existing if already present
    if event_type == "habit_completed" and payload:
        habit_id = payload.get("habit_id")
        completed_date = payload.get("completed_date")
        if habit_id is not None and completed_date is not None:
            result = await db.execute(
                select(ActivityEvent).where(
                    ActivityEvent.user_id == user_id,
                    ActivityEvent.event_type == event_type,
                    ActivityEvent.payload["habit_id"].as_integer() == habit_id,
                    ActivityEvent.payload["completed_date"].as_string() == completed_date,
                )
            )
            existing = result.scalar_one_or_none()
            if existing is not None:
                return existing

    event = ActivityEvent(user_id=user_id, event_type=event_type, payload=payload)
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event
