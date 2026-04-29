from datetime import datetime
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """User model for authentication and profile."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # None for OAuth users
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    verification_token_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    habits: Mapped[list["Habit"]] = relationship(
        "Habit", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    user_stats: Mapped["UserStats | None"] = relationship(
        "UserStats", back_populates="user", cascade="all, delete-orphan", uselist=False, lazy="selectin"
    )
    activity_events: Mapped[list["ActivityEvent"]] = relationship(
        "ActivityEvent", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email})>"
