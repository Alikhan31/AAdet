from collections import defaultdict
from datetime import date, timedelta
from statistics import mean, stdev
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Habit, HabitCompletion
from app.schemas.analytics import (
    UserStatsResponse,
    AnalyticsSummaryResponse,
    SentimentTrendResponse,
    DailySentiment,
    CorrelationMatrixResponse,
    HabitCorrelationEdge,
    HeatmapResponse,
    HeatmapDay,
)
from app.api.deps import get_current_user
from app.services.analytics import get_or_create_user_stats, recompute_streaks_and_xp

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
    stats = await get_or_create_user_stats(current_user.id, db)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # Completions today (distinct dates = 1 or 0; we need count of completion records for today)
    r_today = await db.execute(
        select(func.count(HabitCompletion.id))
        .join(Habit, Habit.id == HabitCompletion.habit_id)
        .where(Habit.user_id == current_user.id, HabitCompletion.completed_date == today)
    )
    completions_today = r_today.scalar_one() or 0

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

    return AnalyticsSummaryResponse(
        stats=UserStatsResponse.model_validate(stats),
        completions_this_week=completions_this_week,
        completions_today=completions_today,
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
            r = _pearson(vectors[hid_a], vectors[hid_b])
            if abs(r) < min_correlation:
                continue
            co = sum(
                1 for d in sorted_dates
                if (hid_a, d) in completed and (hid_b, d) in completed
            )
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
