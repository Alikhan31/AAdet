"""Activity feed: events for "friends' activities" and motivation."""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, String, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ActivityEvent(Base):
    """Single activity event (habit completed, streak, friend joined, etc.)."""

    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # e.g. {"habit_id": 1, "habit_name": "Run"}
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="activity_events")

    __table_args__ = (
        Index("ix_activity_events_user_created", "user_id", "created_at"),
    )
