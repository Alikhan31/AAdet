from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from pydantic import BaseModel

from app.database import get_db
from app.models import User, Habit, Friendship
from app.models.shared_habit import SharedHabitGroup, SharedHabitMember
from app.api.deps import get_current_user
from app.services.analytics import recompute_streaks_and_xp

router = APIRouter(tags=["shared-habits"])


class InvitePayload(BaseModel):
    user_id: int


class MemberStat(BaseModel):
    user_id: int
    full_name: str | None
    email: str
    status: str
    streak: int
    completion_rate: float
    is_owner: bool
    habit_id: int | None


class InvitationResponse(BaseModel):
    group_id: int
    habit_id: int
    habit_name: str
    owner_name: str | None
    owner_email: str
    invited_at: datetime


# ─── invite a friend ────────────────────────────────────────────────────────

@router.post("/habits/{habit_id}/share", status_code=status.HTTP_201_CREATED)
async def invite_to_habit(
    habit_id: int,
    payload: InvitePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Verify habit ownership
    habit = await db.get(Habit, habit_id)
    if not habit or habit.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Habit not found")

    # Verify friendship
    fs = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.user_id == current_user.id, Friendship.friend_id == payload.user_id),
                and_(Friendship.user_id == payload.user_id, Friendship.friend_id == current_user.id),
            ),
            Friendship.status == "accepted",
        )
    )
    if not fs.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You can only invite friends")

    # Verify invitee exists
    invitee = await db.get(User, payload.user_id)
    if not invitee:
        raise HTTPException(status_code=404, detail="User not found")

    # Find or create group
    grp_result = await db.execute(
        select(SharedHabitGroup).where(SharedHabitGroup.original_habit_id == habit_id)
    )
    group = grp_result.scalar_one_or_none()
    if not group:
        group = SharedHabitGroup(original_habit_id=habit_id, owner_id=current_user.id)
        db.add(group)
        await db.flush()

    # Check for duplicate invite
    existing = await db.execute(
        select(SharedHabitMember).where(
            SharedHabitMember.group_id == group.id,
            SharedHabitMember.invitee_id == payload.user_id,
        )
    )
    existing_member = existing.scalar_one_or_none()
    if existing_member:
        if existing_member.status == "accepted":
            raise HTTPException(status_code=400, detail="User already in this shared habit")
        if existing_member.status == "pending":
            raise HTTPException(status_code=400, detail="Invitation already sent")
        # declined — re-invite
        existing_member.status = "pending"
        existing_member.invited_at = datetime.now(timezone.utc)
        existing_member.responded_at = None
    else:
        member = SharedHabitMember(group_id=group.id, invitee_id=payload.user_id)
        db.add(member)

    return {"message": "Invitation sent", "group_id": group.id}


# ─── list pending invitations ────────────────────────────────────────────────

@router.get("/shared-habits/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[InvitationResponse]:
    result = await db.execute(
        select(SharedHabitMember).where(
            SharedHabitMember.invitee_id == current_user.id,
            SharedHabitMember.status == "pending",
        )
    )
    members = result.scalars().all()

    out: list[InvitationResponse] = []
    for m in members:
        group = await db.get(SharedHabitGroup, m.group_id)
        if not group:
            continue
        habit = await db.get(Habit, group.original_habit_id)
        if not habit:
            continue
        owner = await db.get(User, group.owner_id)
        out.append(InvitationResponse(
            group_id=group.id,
            habit_id=habit.id,
            habit_name=habit.name,
            owner_name=owner.full_name if owner else None,
            owner_email=owner.email if owner else "",
            invited_at=m.invited_at,
        ))
    return out


# ─── accept invitation ───────────────────────────────────────────────────────

@router.post("/shared-habits/invitations/{group_id}/accept")
async def accept_invitation(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    member = await _get_pending_member(group_id, current_user.id, db)
    group = await db.get(SharedHabitGroup, group_id)
    original = await db.get(Habit, group.original_habit_id)
    if not original:
        raise HTTPException(status_code=404, detail="Original habit no longer exists")

    # Create a copy of the habit for the invitee
    new_habit = Habit(
        user_id=current_user.id,
        name=original.name,
        description=original.description,
        frequency=original.frequency,
        target_count=original.target_count,
        days_of_week=original.days_of_week,
        visibility=original.visibility,
        category=original.category,
        icon=original.icon,
    )
    db.add(new_habit)
    await db.flush()

    member.status = "accepted"
    member.member_habit_id = new_habit.id
    member.responded_at = datetime.now(timezone.utc)

    return {"message": "Accepted", "habit_id": new_habit.id}


# ─── decline invitation ──────────────────────────────────────────────────────

@router.post("/shared-habits/invitations/{group_id}/decline")
async def decline_invitation(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    member = await _get_pending_member(group_id, current_user.id, db)
    member.status = "declined"
    member.responded_at = datetime.now(timezone.utc)
    return {"message": "Declined"}


# ─── leave shared habit ──────────────────────────────────────────────────────

@router.delete("/shared-habits/{group_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_shared_habit(
    group_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    group = await db.get(SharedHabitGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Shared habit group not found")

    if group.owner_id == current_user.id:
        # Owner dissolves the whole group; member habits are not deleted
        # (members keep their habit copies, they just lose the shared link)
        await db.delete(group)
        return

    # Member leaves
    result = await db.execute(
        select(SharedHabitMember).where(
            SharedHabitMember.group_id == group_id,
            SharedHabitMember.invitee_id == current_user.id,
            SharedHabitMember.status == "accepted",
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Membership not found")

    # Delete their habit copy
    if member.member_habit_id:
        habit = await db.get(Habit, member.member_habit_id)
        if habit:
            await db.delete(habit)

    await db.delete(member)


# ─── member stats ────────────────────────────────────────────────────────────

@router.get("/habits/{habit_id}/members", response_model=list[MemberStat])
async def get_habit_members(
    habit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MemberStat]:
    # Find group where this habit is the original
    grp_result = await db.execute(
        select(SharedHabitGroup).where(SharedHabitGroup.original_habit_id == habit_id)
    )
    group = grp_result.scalar_one_or_none()

    # Or find group where this habit is a member habit
    if not group:
        mem_result = await db.execute(
            select(SharedHabitMember).where(
                SharedHabitMember.member_habit_id == habit_id,
                SharedHabitMember.status == "accepted",
            )
        )
        mem = mem_result.scalar_one_or_none()
        if mem:
            group = await db.get(SharedHabitGroup, mem.group_id)

    if not group:
        raise HTTPException(status_code=404, detail="This habit is not part of a shared group")

    # Verify current user is in this group (owner or accepted member)
    is_owner = group.owner_id == current_user.id
    if not is_owner:
        chk = await db.execute(
            select(SharedHabitMember).where(
                SharedHabitMember.group_id == group.id,
                SharedHabitMember.invitee_id == current_user.id,
                SharedHabitMember.status == "accepted",
            )
        )
        if not chk.scalar_one_or_none():
            raise HTTPException(status_code=403, detail="Not a member of this group")

    stats: list[MemberStat] = []

    # Owner stats
    owner = await db.get(User, group.owner_id)
    original_habit = await db.get(Habit, group.original_habit_id)
    if owner and original_habit:
        streak, rate = await _compute_stats(db, original_habit)
        stats.append(MemberStat(
            user_id=owner.id,
            full_name=owner.full_name,
            email=owner.email,
            status="owner",
            streak=streak,
            completion_rate=rate,
            is_owner=True,
            habit_id=original_habit.id,
        ))

    # Member stats
    mem_result = await db.execute(
        select(SharedHabitMember).where(
            SharedHabitMember.group_id == group.id,
            SharedHabitMember.status == "accepted",
        )
    )
    for m in mem_result.scalars().all():
        user = await db.get(User, m.invitee_id)
        habit = await db.get(Habit, m.member_habit_id) if m.member_habit_id else None
        if not user:
            continue
        streak, rate = (await _compute_stats(db, habit)) if habit else (0, 0.0)
        stats.append(MemberStat(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            status="member",
            streak=streak,
            completion_rate=rate,
            is_owner=False,
            habit_id=habit.id if habit else None,
        ))

    return stats


# ─── group info for a habit ──────────────────────────────────────────────────

@router.get("/habits/{habit_id}/share-info")
async def get_share_info(
    habit_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Returns group_id if the habit is part of a shared group, else null."""
    grp = await db.execute(
        select(SharedHabitGroup).where(SharedHabitGroup.original_habit_id == habit_id)
    )
    group = grp.scalar_one_or_none()
    if group:
        return {"group_id": group.id, "is_owner": group.owner_id == current_user.id}

    mem = await db.execute(
        select(SharedHabitMember).where(
            SharedHabitMember.member_habit_id == habit_id,
            SharedHabitMember.status == "accepted",
        )
    )
    m = mem.scalar_one_or_none()
    if m:
        return {"group_id": m.group_id, "is_owner": False}

    return {"group_id": None, "is_owner": False}


# ─── helpers ─────────────────────────────────────────────────────────────────

async def _get_pending_member(group_id: int, user_id: int, db: AsyncSession) -> SharedHabitMember:
    result = await db.execute(
        select(SharedHabitMember).where(
            SharedHabitMember.group_id == group_id,
            SharedHabitMember.invitee_id == user_id,
            SharedHabitMember.status == "pending",
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Pending invitation not found")
    return member


async def _compute_stats(db: AsyncSession, habit: Habit) -> tuple[int, float]:
    """Return (streak, completion_rate_last_30_days)."""
    from datetime import date, timedelta
    from sqlalchemy import func as sqlfunc
    from app.models import HabitCompletion

    today = date.today()
    thirty_ago = today - timedelta(days=30)

    result = await db.execute(
        select(HabitCompletion.completed_date).where(
            HabitCompletion.habit_id == habit.id,
            HabitCompletion.completed_date >= thirty_ago,
        )
    )
    completion_dates = {row[0] for row in result.fetchall()}

    # Simple streak: count backwards from today
    streak = 0
    d = today
    while True:
        if str(d) in {str(x) for x in completion_dates} or d in completion_dates:
            streak += 1
            d -= timedelta(days=1)
        else:
            break

    # Completion rate: completed days / scheduled days in last 30 days
    all_days = habit.days_of_week if habit.days_of_week else list(range(7))
    scheduled = 0
    completed = 0
    for i in range(30):
        day = today - timedelta(days=i)
        weekday = (day.weekday()) % 7  # Mon=0
        if weekday in all_days:
            scheduled += 1
            if day in completion_dates or str(day) in {str(x) for x in completion_dates}:
                completed += 1

    rate = round(completed / scheduled * 100, 1) if scheduled > 0 else 0.0
    return streak, rate
