"""Analytics engine: stats, streaks, XP."""

from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserStats, Habit, HabitCompletion

XP_PER_COMPLETION = 10
LEVEL_XP_STEP = 100


async def get_or_create_user_stats(user_id: int, db: AsyncSession) -> UserStats:
    result = await db.execute(select(UserStats).where(UserStats.user_id == user_id))
    stats = result.scalar_one_or_none()
    if stats is None:
        stats = UserStats(user_id=user_id)
        db.add(stats)
        await db.flush()
        await db.refresh(stats)
    return stats


def _level_from_xp(total_xp: int) -> int:
    return max(1, 1 + total_xp // LEVEL_XP_STEP)


async def recompute_streaks_and_xp(user_id: int, db: AsyncSession) -> UserStats:
    """Compute current/longest streak from habit_completions and sync UserStats."""
    subq = (
        select(HabitCompletion.completed_date)
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(Habit.user_id == user_id)
        .distinct()
    )
    result = await db.execute(subq)
    dates = sorted({row[0] for row in result.fetchall()}, reverse=True)
    if not dates:
        stats = await get_or_create_user_stats(user_id, db)
        stats.current_streak_days = 0
        return stats

    today = date.today()
    current = 0
    if today in dates or (today - timedelta(days=1)) in dates:
        d = today if today in dates else today - timedelta(days=1)
        seen = set(dates)
        while d in seen:
            current += 1
            d -= timedelta(days=1)

    longest = 1
    run = 1
    for i in range(1, len(dates)):
        if (dates[i - 1] - dates[i]).days == 1:
            run += 1
        else:
            longest = max(longest, run)
            run = 1
    longest = max(longest, run)

    stats = await get_or_create_user_stats(user_id, db)
    stats.current_streak_days = current
    stats.longest_streak_days = max(stats.longest_streak_days, longest)
    total_completions = len(dates)
    stats.total_xp = total_completions * XP_PER_COMPLETION
    stats.level = _level_from_xp(stats.total_xp)
    await db.flush()
    await db.refresh(stats)
    return stats


async def add_xp(user_id: int, amount: int, db: AsyncSession) -> UserStats:
    stats = await get_or_create_user_stats(user_id, db)
    stats.total_xp += amount
    stats.level = _level_from_xp(stats.total_xp)
    await db.flush()
    await db.refresh(stats)
    return stats
