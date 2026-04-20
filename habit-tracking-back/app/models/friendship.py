"""Friends system: add friends for accountability."""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Friendship(Base):
    """Friendship between two users. One row per pair (ordered by id for uniqueness)."""

    __tablename__ = "friendships"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    friend_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)  # pending, accepted, blocked
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    friend: Mapped["User"] = relationship("User", foreign_keys=[friend_id])

    __table_args__ = (
        # Non-unique: directional storage (user_id=requester, friend_id=recipient).
        # Uniqueness enforced in application code by checking both directions.
        Index("ix_friendships_user_friend", "user_id", "friend_id"),
    )
