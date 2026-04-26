from datetime import date, datetime
from pydantic import BaseModel, Field


VISIBILITY_OPTIONS = {"friends", "private"}

class HabitBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    frequency: str = Field(default="daily", max_length=64)
    target_count: int = Field(default=1, ge=1, le=100)
    # 0=Mon … 6=Sun. Default = every day.
    days_of_week: list[int] = Field(default_factory=lambda: list(range(7)))
    visibility: str = Field(default="friends")
    category: str | None = Field(None, max_length=64)
    icon: str | None = Field(None, max_length=64)

    @classmethod
    def __get_validators__(cls):
        yield cls._validate_days

    @staticmethod
    def _validate_days(v):
        if not all(0 <= d <= 6 for d in v):
            raise ValueError("days_of_week values must be 0–6")
        return v


class HabitCreate(HabitBase):
    pass


class HabitUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    frequency: str | None = Field(None, max_length=64)
    target_count: int | None = Field(None, ge=1, le=100)
    days_of_week: list[int] | None = None
    visibility: str | None = None
    category: str | None = Field(None, max_length=64)
    icon: str | None = Field(None, max_length=64)


class HabitResponse(HabitBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class HabitCompletionCreate(BaseModel):
    completed_date: date
    count: int = Field(default=1, ge=1, le=100)
    note: str | None = None


class HabitCompletionUpdate(BaseModel):
    note: str | None = None


class HabitCompletionResponse(BaseModel):
    id: int
    habit_id: int
    completed_date: date
    count: int
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
