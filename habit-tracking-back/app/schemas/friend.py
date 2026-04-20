from datetime import datetime
from pydantic import BaseModel, EmailStr


class FriendCreate(BaseModel):
    email: EmailStr


class FriendSearchResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    friendship_status: str | None  # None = no relation, "pending", "accepted"


class FriendResponse(BaseModel):
    id: int
    email: str
    full_name: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FriendRequestResponse(BaseModel):
    id: int
    user_id: int
    email: str
    full_name: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
