from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Literal
from statistics import mean, stdev
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Habit, HabitCompletion, UserStats, Friendship
from app.schemas.analytics import (
    UserStatsResponse,
    AnalyticsSummaryResponse,
    DayCount,
    LeaderboardEntryResponse,
    LeaderboardResponse,
    SentimentTrendResponse,
    DailySentiment,
    CorrelationMatrixResponse,
    HabitCorrelationEdge,
    HeatmapResponse,
    HeatmapDay,
)
from app.api.deps import get_current_user
from app.services.analytics import get_or_create_user_stats, recompute_streaks_and_xp
from app.services.analytics import compute_habit_streaks, build_badges

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/stats", response_model=UserStatsResponse)
async def get_my_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stats = await get_or_create_user_stats(current_user.id, db)
    return stats


@router.post("/stats/recompute", response_model=UserStatsResponse)
async def recompute_my_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recompute streaks and XP from all habit completions."""
    stats = await recompute_streaks_and_xp(current_user.id, db)
    return stats


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def get_analytics_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stats = await recompute_streaks_and_xp(current_user.id, db)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday

    # --- Completions today ---
    r_today = await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(Habit.user_id == current_user.id, HabitCompletion.completed_date == today)
    )
    completions_today = r_today.scalar_one() or 0

    # --- Completions this week ---
    r_week = await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(
            Habit.user_id == current_user.id,
            HabitCompletion.completed_date >= week_start,
            HabitCompletion.completed_date <= today,
        )
    )
    completions_this_week = r_week.scalar_one() or 0

    # --- All habits (for possible slots calculation) ---
    habits_result = await db.execute(
        select(Habit).where(Habit.user_id == current_user.id)
    )
    habits = habits_result.scalars().all()
    habits_count = len(habits)

    # Possible completions this week: for each habit, count how many of its scheduled
    # weekdays have already passed (Mon=0 … today's weekday)
    days_elapsed = today.weekday() + 1  # 1 on Mon, 7 on Sun
    possible_this_week = 0
    for h in habits:
        days_of_week = h.days_of_week or list(range(7))
        possible_this_week += sum(1 for d in days_of_week if d < days_elapsed)
    possible_this_week = max(possible_this_week, 1)  # avoid division by zero

    # --- Last 7 days per-day counts (for bar chart) ---
    since_7 = today - timedelta(days=6)
    r_7 = await db.execute(
        select(HabitCompletion.completed_date, func.count(HabitCompletion.id).label("cnt"))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(
            Habit.user_id == current_user.id,
            HabitCompletion.completed_date >= since_7,
            HabitCompletion.completed_date <= today,
        )
        .group_by(HabitCompletion.completed_date)
    )
    day_map = {row.completed_date: row.cnt for row in r_7.all()}
    last_7_days = [
        DayCount(date=since_7 + timedelta(days=i), count=day_map.get(since_7 + timedelta(days=i), 0))
        for i in range(7)
    ]

    # --- Total all-time completions ---
    r_total = await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(Habit.user_id == current_user.id)
    )
    total_completions = r_total.scalar_one() or 0

    # --- Best weekday (most completions historically) ---
    WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    r_wd = await db.execute(
        select(HabitCompletion.completed_date, func.count(HabitCompletion.id).label("cnt"))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(Habit.user_id == current_user.id)
        .group_by(HabitCompletion.completed_date)
    )
    weekday_totals: dict[int, int] = defaultdict(int)
    for row in r_wd.all():
        weekday_totals[row.completed_date.weekday()] += row.cnt
    best_weekday = WEEKDAY_NAMES[max(weekday_totals, key=weekday_totals.get)] if weekday_totals else None

    habit_streaks = await compute_habit_streaks(current_user.id, db)
    best_habit_longest_streak = max(
        (item["longest_streak_days"] for item in habit_streaks),
        default=0,
    )
    badges = build_badges(
        habits_created=habits_count,
        overall_longest_streak=stats.longest_streak_days,
        best_habit_longest_streak=best_habit_longest_streak,
    )

    return AnalyticsSummaryResponse(
        stats=UserStatsResponse.model_validate(stats),
        completions_today=completions_today,
        completions_this_week=completions_this_week,
        possible_this_week=possible_this_week,
        total_completions=total_completions,
        habits_count=habits_count,
        last_7_days=last_7_days,
        best_weekday=best_weekday,
        badges=badges,
        habit_streaks=habit_streaks,
    )


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
    friends_only: bool = Query(False),
    period: Literal["total", "month"] = Query("total"),
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
):
    """Leaderboard with total XP or month XP. Global mode is capped to top 10."""
    if not friends_only:
        limit = min(limit, 10)

    month_value = month
    month_start_date: date | None = None
    month_end_date: date | None = None
    month_start_dt: datetime | None = None
    next_month_start_dt: datetime | None = None
    if period == "month":
        if not month_value:
            month_value = date.today().strftime("%Y-%m")
        month_start_date = datetime.strptime(f"{month_value}-01", "%Y-%m-%d").date()
        if month_start_date.month == 12:
            month_end_date = date(month_start_date.year + 1, 1, 1) - timedelta(days=1)
            next_month_start_dt = datetime(month_start_date.year + 1, 1, 1)
        else:
            month_end_date = date(month_start_date.year, month_start_date.month + 1, 1) - timedelta(days=1)
            next_month_start_dt = datetime(month_start_date.year, month_start_date.month + 1, 1)
        month_start_dt = datetime(month_start_date.year, month_start_date.month, 1)

    friend_ids: set[int] | None = None
    if friends_only:
        fs = await db.execute(
            select(Friendship).where(
                Friendship.status == "accepted",
                (Friendship.user_id == current_user.id) | (Friendship.friend_id == current_user.id),
            )
        )
        friend_ids = {current_user.id}
        for row in fs.scalars().all():
            friend_ids.add(row.friend_id if row.user_id == current_user.id else row.user_id)

    users_result = await db.execute(
        select(User.id, User.full_name, User.email).order_by(User.id.asc())
    )
    all_users = users_result.all()
    if friend_ids is not None:
        all_users = [u for u in all_users if u.id in friend_ids]

    xp_by_user: dict[int, int] = {u.id: 0 for u in all_users}
    if period == "total":
        stats_query = select(UserStats.user_id, UserStats.total_xp)
        if friend_ids is not None:
            stats_query = stats_query.where(UserStats.user_id.in_(friend_ids))
        stats_result = await db.execute(stats_query)
        for row in stats_result.all():
            if row.user_id in xp_by_user:
                xp_by_user[row.user_id] = row.total_xp or 0
    else:
        completions_query = (
            select(Habit.user_id, func.count(HabitCompletion.id).label("cnt"))
            .join(HabitCompletion, HabitCompletion.habit_id == Habit.id)
            .where(
                HabitCompletion.completed_date >= month_start_date,
                HabitCompletion.completed_date <= month_end_date,
            )
            .group_by(Habit.user_id)
        )
        habits_query = (
            select(Habit.user_id, func.count(Habit.id).label("cnt"))
            .where(
                Habit.created_at >= month_start_dt,
                Habit.created_at < next_month_start_dt,
            )
            .group_by(Habit.user_id)
        )
        if friend_ids is not None:
            completions_query = completions_query.where(Habit.user_id.in_(friend_ids))
            habits_query = habits_query.where(Habit.user_id.in_(friend_ids))

        comp_result = await db.execute(completions_query)
        for row in comp_result.all():
            if row.user_id in xp_by_user:
                xp_by_user[row.user_id] += (row.cnt or 0) * 10

        habit_created_result = await db.execute(habits_query)
        for row in habit_created_result.all():
            if row.user_id in xp_by_user:
                xp_by_user[row.user_id] += (row.cnt or 0) * 20

    ranked_rows = sorted(
        all_users,
        key=lambda r: (xp_by_user.get(r.id, 0), -r.id),
        reverse=True,
    )

    def _initials(name: str) -> str:
        parts = [p for p in name.split(" ") if p]
        return "".join(p[0].upper() for p in parts[:2]) or "U"

    me_rank: int | None = None
    me_xp = xp_by_user.get(current_user.id, 0)
    for idx, row in enumerate(ranked_rows, start=1):
        if row.id == current_user.id:
            me_rank = idx
            break

    out: list[LeaderboardEntryResponse] = []
    for idx, row in enumerate(ranked_rows[:limit], start=1):
        display_name = (row.full_name or row.email or "User").strip()
        out.append(
            LeaderboardEntryResponse(
                user_id=row.id,
                name=display_name,
                initials=_initials(display_name),
                total_xp=xp_by_user.get(row.id, 0),
                rank=idx,
                is_me=row.id == current_user.id,
            )
        )
    return LeaderboardResponse(
        period=period,
        month=month_value if period == "month" else None,
        entries=out,
        me_rank=me_rank,
        me_xp=me_xp,
    )


# ---------------------------------------------------------------------------
# Sentiment analysis
# ---------------------------------------------------------------------------

def _build_sentiment_insight(daily: list[DailySentiment], overall_avg: float) -> str:
    if not daily:
        return "Not enough notes to detect patterns yet."

    # Find weekday with worst average sentiment
    weekday_scores: dict[int, list[float]] = defaultdict(list)
    for d in daily:
        weekday_scores[d.date.weekday()].append(d.avg_score)

    weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    worst_day, worst_score = min(
        ((wd, mean(scores)) for wd, scores in weekday_scores.items()),
        key=lambda x: x[1],
    )

    if overall_avg >= 0.05:
        base = "Your notes are mostly positive overall."
    elif overall_avg <= -0.05:
        base = "Your notes show recurring stress. Consider lighter habits on tough days."
    else:
        base = "Your mood in notes is fairly neutral."

    if worst_score < -0.1:
        base += f" {weekday_names[worst_day]}s tend to show the most negative sentiment — watch your streak on those days."

    return base


@router.get("/sentiment", response_model=SentimentTrendResponse)
async def get_sentiment_trend(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(90, ge=7, le=365, description="How many past days to analyse"),
):
    """
    Analyses the sentiment of habit notes using VADER (offline NLP).
    Returns daily average sentiment scores and a pattern insight.
    """
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer  # lazy import

    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(HabitCompletion.completed_date, HabitCompletion.note)
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(
            Habit.user_id == current_user.id,
            HabitCompletion.note.isnot(None),
            HabitCompletion.completed_date >= since,
        )
        .order_by(HabitCompletion.completed_date)
    )
    rows = result.all()

    if not rows:
        return SentimentTrendResponse(
            daily=[],
            overall_avg=0.0,
            insight="No notes found in the selected period. Start adding notes when completing habits!",
        )

    analyzer = SentimentIntensityAnalyzer()
    daily_scores: dict[date, list[float]] = defaultdict(list)
    for completed_date, note in rows:
        if note and note.strip():
            score = analyzer.polarity_scores(note)["compound"]
            daily_scores[completed_date].append(score)

    daily = [
        DailySentiment(date=d, avg_score=round(mean(scores), 4), notes_count=len(scores))
        for d, scores in sorted(daily_scores.items())
    ]
    all_scores = [s for d in daily for s in [d.avg_score]]
    overall_avg = round(mean(all_scores), 4) if all_scores else 0.0

    return SentimentTrendResponse(
        daily=daily,
        overall_avg=overall_avg,
        insight=_build_sentiment_insight(daily, overall_avg),
    )


# ---------------------------------------------------------------------------
# Habit correlation matrix
# ---------------------------------------------------------------------------

def _pearson(a: list[float], b: list[float]) -> float:
    """Pearson correlation; returns 0.0 if undefined (< 5 points or zero variance)."""
    n = len(a)
    if n < 5:
        return 0.0
    ma, mb = mean(a), mean(b)
    try:
        sa, sb = stdev(a), stdev(b)
    except Exception:
        return 0.0
    if sa == 0 or sb == 0:
        return 0.0
    return sum((ai - ma) * (bi - mb) for ai, bi in zip(a, b)) / ((n - 1) * sa * sb)


@router.get("/correlations", response_model=CorrelationMatrixResponse)
async def get_habit_correlations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(90, ge=14, le=365, description="Lookback window in days"),
    min_correlation: float = Query(0.3, ge=0.0, le=1.0, description="Minimum |r| to include an edge"),
    min_co_occurrence_days: int = Query(7, ge=1, le=365, description="Minimum days both habits were completed"),
):
    """
    Returns a Pearson correlation matrix between all the user's habits.
    A high positive correlation means the two habits tend to be completed on the same days.
    A high negative correlation means completing one predicts NOT completing the other.
    """
    since = date.today() - timedelta(days=days)

    # Fetch all habits for this user
    habits_result = await db.execute(
        select(Habit).where(Habit.user_id == current_user.id)
    )
    habits = habits_result.scalars().all()
    if len(habits) < 2:
        return CorrelationMatrixResponse(
            habits=[{"id": h.id, "name": h.name} for h in habits],
            edges=[],
            total_days_tracked=0,
        )

    habit_ids = [h.id for h in habits]
    habit_by_id = {h.id: h for h in habits}

    # Fetch all completions in the window
    comp_result = await db.execute(
        select(HabitCompletion.habit_id, HabitCompletion.completed_date)
        .where(
            HabitCompletion.habit_id.in_(habit_ids),
            HabitCompletion.completed_date >= since,
        )
    )
    # Build a set of (habit_id, date) that were completed
    completed: set[tuple[int, date]] = set()
    all_dates: set[date] = set()
    for habit_id, completed_date in comp_result.all():
        completed.add((habit_id, completed_date))
        all_dates.add(completed_date)

    if not all_dates:
        return CorrelationMatrixResponse(
            habits=[{"id": h.id, "name": h.name} for h in habits],
            edges=[],
            total_days_tracked=0,
        )

    sorted_dates = sorted(all_dates)
    total_days = len(sorted_dates)

    # Build binary vectors per habit over the tracked dates
    vectors: dict[int, list[float]] = {
        hid: [1.0 if (hid, d) in completed else 0.0 for d in sorted_dates]
        for hid in habit_ids
    }

    # Compute Pearson for every pair
    edges: list[HabitCorrelationEdge] = []
    for i, hid_a in enumerate(habit_ids):
        for hid_b in habit_ids[i + 1:]:
            co = sum(
                1 for d in sorted_dates
                if (hid_a, d) in completed and (hid_b, d) in completed
            )
            if co < min_co_occurrence_days:
                continue
            r = _pearson(vectors[hid_a], vectors[hid_b])
            if abs(r) < min_correlation:
                continue
            edges.append(
                HabitCorrelationEdge(
                    habit_a_id=hid_a,
                    habit_a_name=habit_by_id[hid_a].name,
                    habit_b_id=hid_b,
                    habit_b_name=habit_by_id[hid_b].name,
                    correlation=round(r, 4),
                    co_occurrence_days=co,
                )
            )

    # Sort strongest correlations first
    edges.sort(key=lambda e: abs(e.correlation), reverse=True)

    return CorrelationMatrixResponse(
        habits=[{"id": h.id, "name": h.name} for h in habits],
        edges=edges,
        total_days_tracked=total_days,
    )


# ---------------------------------------------------------------------------
# Contribution heatmap (GitHub-style)
# ---------------------------------------------------------------------------

@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(365, ge=30, le=730, description="Number of past days to include"),
):
    """Returns daily habit completion counts for the GitHub-style heatmap."""
    since = date.today() - timedelta(days=days)

    result = await db.execute(
        select(HabitCompletion.completed_date, func.count(HabitCompletion.id).label("cnt"))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(
            Habit.user_id == current_user.id,
            HabitCompletion.completed_date >= since,
        )
        .group_by(HabitCompletion.completed_date)
        .order_by(HabitCompletion.completed_date)
    )
    rows = result.all()
    return HeatmapResponse(
        days=[HeatmapDay(date=row.completed_date, count=row.cnt) for row in rows]
    )
