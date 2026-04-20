from datetime import date, datetime
from pydantic import BaseModel


class UserStatsResponse(BaseModel):
    total_xp: int
    level: int
    current_streak_days: int
    longest_streak_days: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class AnalyticsSummaryResponse(BaseModel):
    stats: UserStatsResponse
    completions_this_week: int
    completions_today: int


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
