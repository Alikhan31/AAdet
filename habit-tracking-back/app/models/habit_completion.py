"""Habit completion records for calendar view and analytics."""

from datetime import date, datetime
from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HabitCompletion(Base):
    """Single completion of a habit on a given date."""

    __tablename__ = "habit_completions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    habit_id: Mapped[int] = mapped_column(
        ForeignKey("habits.id", ondelete="CASCADE"), index=True, nullable=False
    )
    completed_date: Mapped[date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)  # for target_count > 1
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    habit: Mapped["Habit"] = relationship("Habit", back_populates="completions")

    __table_args__ = (
        Index("ix_habit_completions_habit_date", "habit_id", "completed_date", unique=True),
    )

    def __repr__(self) -> str:
        return f"<HabitCompletion(habit_id={self.habit_id}, date={self.completed_date})>"
