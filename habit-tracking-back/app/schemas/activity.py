from datetime import datetime
from pydantic import BaseModel, Field


class ActivityEventResponse(BaseModel):
    id: int
    user_id: int
    event_type: str
    payload: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReactionCreate(BaseModel):
    type: str = "like"  # like, fire, clap


class ReactionResponse(BaseModel):
    id: int
    event_id: int
    user_id: int
    type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedCommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)


class FeedCommentResponse(BaseModel):
    id: int
    event_id: int
    user_id: int
    user_email: str | None = None
    user_full_name: str | None = None
    text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityFeedItemResponse(BaseModel):
    id: int
    user_id: int
    user_email: str | None
    user_full_name: str | None
    event_type: str
    payload: dict | None
    created_at: datetime
    reactions: list[ReactionResponse] = []
    comments: list[FeedCommentResponse] = []
    comments_count: int = 0
