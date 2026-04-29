from datetime import date, datetime
from pydantic import BaseModel


class UserStatsResponse(BaseModel):
    total_xp: int
    level: int
    current_streak_days: int
    longest_streak_days: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class DayCount(BaseModel):
    date: date
    count: int


class BadgeResponse(BaseModel):
    id: str
    title: str
    category: str
    threshold: int
    value: int
    earned: bool


class HabitStreakResponse(BaseModel):
    habit_id: int
    habit_name: str
    current_streak_days: int
    longest_streak_days: int


class LeaderboardEntryResponse(BaseModel):
    user_id: int
    name: str
    initials: str
    total_xp: int
    rank: int
    is_me: bool


class LeaderboardResponse(BaseModel):
    period: str                  # "total" | "month"
    month: str | None = None     # YYYY-MM for month mode
    entries: list[LeaderboardEntryResponse]
    me_rank: int | None
    me_xp: int


class AnalyticsSummaryResponse(BaseModel):
    stats: UserStatsResponse
    completions_today: int
    completions_this_week: int
    possible_this_week: int       # scheduled habit-slots this week (for consistency %)
    total_completions: int        # all-time total habit completions
    habits_count: int             # number of active habits
    last_7_days: list[DayCount]   # per-day completion counts for bar chart
    best_weekday: str | None      # name of weekday with most completions historically
    badges: list[BadgeResponse]
    habit_streaks: list[HabitStreakResponse]


# --- Sentiment ---

class DailySentiment(BaseModel):
    date: date
    avg_score: float   # compound VADER score: -1.0 (negative) … +1.0 (positive)
    notes_count: int


class SentimentTrendResponse(BaseModel):
    daily: list[DailySentiment]
    overall_avg: float
    insight: str        # human-readable pattern detected


# --- Correlations ---

class HabitCorrelationEdge(BaseModel):
    habit_a_id: int
    habit_a_name: str
    habit_b_id: int
    habit_b_name: str
    correlation: float          # Pearson -1 … +1
    co_occurrence_days: int     # days both habits were completed


class CorrelationMatrixResponse(BaseModel):
    habits: list[dict]          # [{id, name}] — all habits included
    edges: list[HabitCorrelationEdge]   # only pairs with |r| >= threshold
    total_days_tracked: int


# --- Heatmap ---

class HeatmapDay(BaseModel):
    date: date
    count: int   # number of habits completed on that day


class HeatmapResponse(BaseModel):
    days: list[HeatmapDay]


# --- Per-habit analytics ---

class HabitDayCount(BaseModel):
    date: str   # ISO string "YYYY-MM-DD"
    count: int  # 0 or 1


class HabitAnalyticsItem(BaseModel):
    habit_id: int
    habit_name: str
    category: str | None
    icon: str | None
    current_streak: int
    longest_streak: int
    total_completions: int
    completion_rate: float      # completions / days in window
    last_30_days: list[HabitDayCount]   # daily 0/1 for mini chart
