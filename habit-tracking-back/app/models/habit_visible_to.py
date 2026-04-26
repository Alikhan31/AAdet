from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HabitVisibleTo(Base):
    """Stores which specific friends can see a habit when visibility == 'selected'."""

    __tablename__ = "habit_visible_to"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    habit_id: Mapped[int] = mapped_column(ForeignKey("habits.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (UniqueConstraint("habit_id", "user_id", name="uq_habit_visible_to"),)
