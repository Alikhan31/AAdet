"""Reactions on activity feed events (likes, fire, etc.)."""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Reaction(Base):
    """One reaction per user per event (type can be: like, fire, clap)."""

    __tablename__ = "reactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("activity_events.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False, default="like")  # like, fire, clap
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    event: Mapped["ActivityEvent"] = relationship("ActivityEvent")
    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        # One reaction type per user per event
        UniqueConstraint("event_id", "user_id", "type", name="uq_reactions_event_user_type"),
    )
