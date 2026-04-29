from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import datetime

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User
from app.models.user_profile import UserProfile

router = APIRouter(prefix="/user", tags=["user"])


class ProfileResponse(BaseModel):
    data: dict
    updated_at: str | None = None


class ProfilePatch(BaseModel):
    data: dict  # key-value pairs to merge into profile


@router.get("/profile", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        return ProfileResponse(data={})
    return ProfileResponse(
        data=profile.data or {},
        updated_at=profile.updated_at.isoformat() if profile.updated_at else None,
    )


@router.patch("/profile", response_model=ProfileResponse)
async def patch_profile(
    body: ProfilePatch,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(user_id=current_user.id, data={})
        db.add(profile)
    merged = {**(profile.data or {}), **body.data}
    profile.data = merged
    profile.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(profile)
    return ProfileResponse(
        data=profile.data,
        updated_at=profile.updated_at.isoformat() if profile.updated_at else None,
    )
