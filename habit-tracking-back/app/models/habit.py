from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, JSON, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Habit(Base):
    """Habit model: user-defined habits with frequency and target."""

    __tablename__ = "habits"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # frequency: daily, weekly, custom
    frequency: Mapped[str] = mapped_column(String(64), default="daily", nullable=False)
    # target_count: e.g. 1 for "once per day"
    target_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # days_of_week: list of ints 0=Mon … 6=Sun. Empty list means every day.
    days_of_week: Mapped[list] = mapped_column(
        JSON, default=lambda: list(range(7)), nullable=False
    )
    # visibility: "friends" = all friends can see it, "private" = only owner
    visibility: Mapped[str] = mapped_column(String(16), default="friends", nullable=False)
    # category: e.g. "health", "mind", "work", "lifestyle", "other"
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # icon: lucide icon key, e.g. "heart", "brain", "dumbbell"
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="habits")
    completions: Mapped[list["HabitCompletion"]] = relationship(
        "HabitCompletion", back_populates="habit", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_habits_user_id_created_at", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Habit(id={self.id}, name={self.name}, user_id={self.user_id})>"
