from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SharedHabitGroup(Base):
    __tablename__ = "shared_habit_groups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    original_habit_id: Mapped[int] = mapped_column(
        ForeignKey("habits.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    members: Mapped[list["SharedHabitMember"]] = relationship(
        "SharedHabitMember", back_populates="group", cascade="all, delete-orphan", lazy="selectin"
    )


class SharedHabitMember(Base):
    __tablename__ = "shared_habit_members"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("shared_habit_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    invitee_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # pending | accepted | declined
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False)
    # set once the invitee accepts and a copy of the habit is created for them
    member_habit_id: Mapped[int | None] = mapped_column(
        ForeignKey("habits.id", ondelete="SET NULL"), nullable=True
    )
    invited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    group: Mapped["SharedHabitGroup"] = relationship("SharedHabitGroup", back_populates="members")

    __table_args__ = (
        Index("ix_shared_habit_members_group_invitee", "group_id", "invitee_id", unique=True),
    )
