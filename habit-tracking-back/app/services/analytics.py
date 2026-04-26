"""Analytics engine: stats, streaks, XP, badges."""

from collections import defaultdict
from datetime import date, timedelta
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserStats, Habit, HabitCompletion

XP_PER_COMPLETION = 10
XP_PER_HABIT_CREATED = 20
LEVEL_XP_STEP = 100
HABITS_CREATED_BADGE_STEPS = (1, 10, 20, 30, 100)
STREAK_BADGE_STEPS = (1, 5, 10, 20, 30, 100)


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


def _compute_streaks_from_dates(dates: set[date]) -> tuple[int, int]:
    """Compute current and longest streak from a set of completion dates."""
    if not dates:
        return 0, 0

    today = date.today()
    current = 0
    if today in dates or (today - timedelta(days=1)) in dates:
        cursor = today if today in dates else today - timedelta(days=1)
        while cursor in dates:
            current += 1
            cursor -= timedelta(days=1)

    longest = 1
    run = 1
    sorted_asc = sorted(dates)
    for i in range(1, len(sorted_asc)):
        if (sorted_asc[i] - sorted_asc[i - 1]).days == 1:
            run += 1
        else:
            longest = max(longest, run)
            run = 1
    longest = max(longest, run)
    return current, longest


async def compute_habit_streaks(user_id: int, db: AsyncSession) -> list[dict]:
    """Return current/longest streak for each habit."""
    habits_result = await db.execute(
        select(Habit.id, Habit.name).where(Habit.user_id == user_id)
    )
    habit_rows = habits_result.all()
    if not habit_rows:
        return []

    habit_ids = [row.id for row in habit_rows]
    completions_result = await db.execute(
        select(HabitCompletion.habit_id, HabitCompletion.completed_date).where(
            HabitCompletion.habit_id.in_(habit_ids)
        )
    )
    dates_by_habit: dict[int, set[date]] = defaultdict(set)
    for habit_id, completed_date in completions_result.all():
        dates_by_habit[habit_id].add(completed_date)

    habit_streaks: list[dict] = []
    for row in habit_rows:
        current, longest = _compute_streaks_from_dates(dates_by_habit.get(row.id, set()))
        habit_streaks.append(
            {
                "habit_id": row.id,
                "habit_name": row.name,
                "current_streak_days": current,
                "longest_streak_days": longest,
            }
        )

    habit_streaks.sort(
        key=lambda item: (item["longest_streak_days"], item["current_streak_days"]),
        reverse=True,
    )
    return habit_streaks


def build_badges(
    habits_created: int,
    overall_longest_streak: int,
    best_habit_longest_streak: int,
) -> list[dict]:
    """Build full badge list with earned/progress state."""
    badges: list[dict] = []

    for step in HABITS_CREATED_BADGE_STEPS:
        badges.append(
            {
                "id": f"created_habit_{step}",
                "title": f"Created {step} habit{'s' if step > 1 else ''}",
                "category": "created_habits",
                "threshold": step,
                "value": habits_created,
                "earned": habits_created >= step,
            }
        )

    for step in STREAK_BADGE_STEPS:
        badges.append(
            {
                "id": f"overall_streak_{step}",
                "title": f"Overall streak {step} day{'s' if step > 1 else ''}",
                "category": "overall_streak",
                "threshold": step,
                "value": overall_longest_streak,
                "earned": overall_longest_streak >= step,
            }
        )
        badges.append(
            {
                "id": f"habit_streak_{step}",
                "title": f"Single habit streak {step} day{'s' if step > 1 else ''}",
                "category": "habit_streak",
                "threshold": step,
                "value": best_habit_longest_streak,
                "earned": best_habit_longest_streak >= step,
            }
        )

    return badges


async def recompute_streaks_and_xp(user_id: int, db: AsyncSession) -> UserStats:
    """Compute current/longest streak from habit_completions and sync UserStats."""
    subq = (
        select(HabitCompletion.completed_date)
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(Habit.user_id == user_id)
        .distinct()
    )
    result = await db.execute(subq)
    unique_dates = {row[0] for row in result.fetchall()}
    current, longest = _compute_streaks_from_dates(unique_dates)

    total_completions_result = await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(Habit.user_id == user_id)
    )
    total_completions = total_completions_result.scalar_one() or 0

    habits_created_result = await db.execute(
        select(func.count(Habit.id)).where(Habit.user_id == user_id)
    )
    habits_created = habits_created_result.scalar_one() or 0

    stats = await get_or_create_user_stats(user_id, db)
    stats.current_streak_days = current
    stats.longest_streak_days = longest
    stats.total_xp = total_completions * XP_PER_COMPLETION + habits_created * XP_PER_HABIT_CREATED
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
