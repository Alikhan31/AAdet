from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, Habit, HabitCompletion
from app.schemas.habit import (
    HabitCreate,
    HabitUpdate,
    HabitResponse,
    HabitCompletionCreate,
    HabitCompletionUpdate,
    HabitCompletionResponse,
)
from app.api.deps import get_current_user
from app.services.activity_feed import create_event as create_activity_event
from app.services.analytics import recompute_streaks_and_xp

router = APIRouter(prefix="/habits", tags=["habits"])


@router.get("", response_model=list[HabitResponse])
async def list_habits(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    day: int | None = Query(None, ge=0, le=6, description="Filter by weekday: 0=Mon … 6=Sun"),
) -> list[Habit]:
    result = await db.execute(
        select(Habit).where(Habit.user_id == current_user.id).offset(skip).limit(limit)
    )
    habits = list(result.scalars().all())
    if day is not None:
        # days_of_week may be None on old rows — treat as all days
        habits = [h for h in habits if h.days_of_week is None or day in (h.days_of_week or [])]
    return habits


@router.post("", response_model=HabitResponse, status_code=status.HTTP_201_CREATED)
async def create_habit(
    payload: HabitCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Habit:
    habit = Habit(
        user_id=current_user.id,
        name=payload.name,
        description=payload.description,
        frequency=payload.frequency,
        target_count=payload.target_count,
        days_of_week=payload.days_of_week,
    )
    db.add(habit)
    await db.flush()
    await db.refresh(habit)
    return habit


@router.get("/{habit_id}", response_model=HabitResponse)
async def get_habit(
    habit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Habit:
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    return habit


@router.patch("/{habit_id}", response_model=HabitResponse)
async def update_habit(
    habit_id: int,
    payload: HabitUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Habit:
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(habit, key, value)
    await db.flush()
    await db.refresh(habit)
    return habit


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_habit(
    habit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    await db.delete(habit)
    return None


# --- Habit completions (for dashboard check-in and calendar) ---

@router.get("/{habit_id}/completions", response_model=list[HabitCompletionResponse])
async def list_completions(
    habit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
) -> list[HabitCompletion]:
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    q = select(HabitCompletion).where(HabitCompletion.habit_id == habit_id)
    if from_date is not None:
        q = q.where(HabitCompletion.completed_date >= from_date)
    if to_date is not None:
        q = q.where(HabitCompletion.completed_date <= to_date)
    q = q.order_by(HabitCompletion.completed_date.desc())
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("/{habit_id}/completions", response_model=HabitCompletionResponse, status_code=status.HTTP_201_CREATED)
async def add_completion(
    habit_id: int,
    payload: HabitCompletionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HabitCompletion:
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    existing = await db.execute(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.completed_date == payload.completed_date,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completion already recorded for this date",
        )
    completion = HabitCompletion(
        habit_id=habit_id,
        completed_date=payload.completed_date,
        count=payload.count,
        note=payload.note,
    )
    db.add(completion)
    await db.flush()
    await db.refresh(completion)
    await create_activity_event(
        current_user.id, "habit_completed",
        {"habit_id": habit_id, "habit_name": habit.name, "completed_date": str(payload.completed_date)},
        db,
    )
    await recompute_streaks_and_xp(current_user.id, db)
    return completion


@router.post("/{habit_id}/complete-today", response_model=HabitCompletionResponse, status_code=status.HTTP_201_CREATED)
async def complete_today(
    habit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HabitCompletion:
    """Record one completion for today (convenience for dashboard). Idempotent: returns existing if already completed."""
    today = date.today()
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    habit = result.scalar_one_or_none()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    existing = await db.execute(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.completed_date == today,
        )
    )
    comp = existing.scalar_one_or_none()
    if comp is not None:
        return comp
    completion = HabitCompletion(
        habit_id=habit_id,
        completed_date=today,
        count=1,
        note=None,
    )
    db.add(completion)
    await db.flush()
    await db.refresh(completion)
    await create_activity_event(
        current_user.id, "habit_completed",
        {"habit_id": habit_id, "habit_name": habit.name, "completed_date": str(today)},
        db,
    )
    await recompute_streaks_and_xp(current_user.id, db)
    return completion


@router.patch("/{habit_id}/completions/{completed_date}", response_model=HabitCompletionResponse)
async def update_completion(
    habit_id: int,
    completed_date: date,
    payload: HabitCompletionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HabitCompletion:
    """Update the note on an existing completion."""
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    result = await db.execute(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.completed_date == completed_date,
        )
    )
    completion = result.scalar_one_or_none()
    if completion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Completion not found")
    completion.note = payload.note
    await db.flush()
    await db.refresh(completion)
    return completion


@router.delete("/{habit_id}/completions/{completed_date}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_completion(
    habit_id: int,
    completed_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(Habit).where(Habit.id == habit_id, Habit.user_id == current_user.id)
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    result = await db.execute(
        select(HabitCompletion).where(
            HabitCompletion.habit_id == habit_id,
            HabitCompletion.completed_date == completed_date,
        )
    )
    completion = result.scalar_one_or_none()
    if completion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Completion not found")
    await db.delete(completion)
    return None
