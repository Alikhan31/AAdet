from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Friendship, ActivityEvent, Reaction, FeedComment, Habit, HabitVisibleTo
from app.schemas.activity import (
    ActivityFeedItemResponse,
    ReactionCreate,
    ReactionResponse,
    FeedCommentCreate,
    FeedCommentResponse,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/feed", tags=["feed"])

ALLOWED_REACTION_TYPES = {"like", "fire", "clap"}


@router.get("", response_model=list[ActivityFeedItemResponse])
async def get_activity_feed(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    friends_only: bool = Query(False, description="If true, only friends' activities; else mine + friends"),
):
    fr_result = await db.execute(
        select(Friendship).where(
            or_(Friendship.user_id == current_user.id, Friendship.friend_id == current_user.id),
            Friendship.status == "accepted",
        )
    )
    friend_ids = set()
    for fs in fr_result.scalars().all():
        other = fs.friend_id if fs.user_id == current_user.id else fs.user_id
        friend_ids.add(other)

    if friends_only:
        author_ids = list(friend_ids)
    else:
        author_ids = [current_user.id] + list(friend_ids)

    if not author_ids:
        return []

    result = await db.execute(
        select(ActivityEvent, User)
        .join(User, User.id == ActivityEvent.user_id)
        .where(ActivityEvent.user_id.in_(author_ids))
        .order_by(ActivityEvent.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    events_with_users = result.all()
    if not events_with_users:
        return []

    # --- Visibility filter ---
    # Collect habit_ids from habit_completed events
    habit_id_by_event: dict[int, int] = {}
    for event, _ in events_with_users:
        if event.event_type == "habit_completed" and event.payload:
            hid = event.payload.get("habit_id")
            if isinstance(hid, int):
                habit_id_by_event[event.id] = hid

    unique_habit_ids = list(set(habit_id_by_event.values()))
    habits_visibility: dict[int, str] = {}
    if unique_habit_ids:
        h_result = await db.execute(select(Habit).where(Habit.id.in_(unique_habit_ids)))
        for h in h_result.scalars().all():
            habits_visibility[h.id] = h.visibility

    # For "selected" habits, load which users are allowed to see them
    selected_habit_ids = [hid for hid, vis in habits_visibility.items() if vis == "selected"]
    allowed_viewer: set[int] = set()  # habit_ids where current_user is in the visible-to list
    if selected_habit_ids:
        vt_result = await db.execute(
            select(HabitVisibleTo).where(
                HabitVisibleTo.habit_id.in_(selected_habit_ids),
                HabitVisibleTo.user_id == current_user.id,
            )
        )
        allowed_viewer = {row.habit_id for row in vt_result.scalars().all()}

    def _visible(event: "ActivityEvent") -> bool:
        if event.user_id == current_user.id:
            return True  # always show your own events to yourself
        hid = habit_id_by_event.get(event.id)
        if hid is None:
            return True
        vis = habits_visibility.get(hid, "friends")
        if vis == "private":
            return False
        if vis == "selected":
            return hid in allowed_viewer
        return True  # "friends"

    events_with_users = [(e, u) for e, u in events_with_users if _visible(e)]
    if not events_with_users:
        return []

    event_ids = [event.id for event, _ in events_with_users]

    # Bulk-fetch reactions
    rx_result = await db.execute(
        select(Reaction).where(Reaction.event_id.in_(event_ids))
    )
    reactions_by_event: dict[int, list[Reaction]] = {}
    for rx in rx_result.scalars().all():
        reactions_by_event.setdefault(rx.event_id, []).append(rx)

    # Bulk-fetch comments (with author info)
    cm_result = await db.execute(
        select(FeedComment, User)
        .join(User, User.id == FeedComment.user_id)
        .where(FeedComment.event_id.in_(event_ids))
        .order_by(FeedComment.created_at)
    )
    comments_by_event: dict[int, list[FeedCommentResponse]] = {}
    for cm, cm_user in cm_result.all():
        comments_by_event.setdefault(cm.event_id, []).append(
            FeedCommentResponse(
                id=cm.id,
                event_id=cm.event_id,
                user_id=cm.user_id,
                user_email=cm_user.email,
                user_full_name=cm_user.full_name,
                text=cm.text,
                created_at=cm.created_at,
            )
        )

    out = []
    for event, user in events_with_users:
        rxs = reactions_by_event.get(event.id, [])
        cms = comments_by_event.get(event.id, [])
        out.append(
            ActivityFeedItemResponse(
                id=event.id,
                user_id=event.user_id,
                user_email=user.email,
                user_full_name=user.full_name,
                event_type=event.event_type,
                payload=event.payload,
                created_at=event.created_at,
                reactions=[
                    ReactionResponse(
                        id=rx.id,
                        event_id=rx.event_id,
                        user_id=rx.user_id,
                        type=rx.type,
                        created_at=rx.created_at,
                    )
                    for rx in rxs
                ],
                comments=cms,
                comments_count=len(cms),
            )
        )
    return out


@router.post("/{event_id}/react", response_model=ReactionResponse, status_code=status.HTTP_201_CREATED)
async def react_to_event(
    event_id: int,
    payload: ReactionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.type not in ALLOWED_REACTION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid reaction type. Allowed: {sorted(ALLOWED_REACTION_TYPES)}",
        )
    event_result = await db.execute(select(ActivityEvent).where(ActivityEvent.id == event_id))
    if event_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    existing = await db.execute(
        select(Reaction).where(
            Reaction.event_id == event_id,
            Reaction.user_id == current_user.id,
            Reaction.type == payload.type,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already reacted with this type")

    rx = Reaction(event_id=event_id, user_id=current_user.id, type=payload.type)
    db.add(rx)
    await db.flush()
    await db.refresh(rx)
    return ReactionResponse(id=rx.id, event_id=rx.event_id, user_id=rx.user_id, type=rx.type, created_at=rx.created_at)


@router.delete("/{event_id}/react", status_code=status.HTTP_204_NO_CONTENT)
async def remove_reaction(
    event_id: int,
    reaction_type: str = Query("like"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reaction).where(
            Reaction.event_id == event_id,
            Reaction.user_id == current_user.id,
            Reaction.type == reaction_type,
        )
    )
    rx = result.scalar_one_or_none()
    if rx is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reaction not found")
    await db.delete(rx)
    return None


@router.post("/{event_id}/comments", response_model=FeedCommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    event_id: int,
    payload: FeedCommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event_result = await db.execute(select(ActivityEvent).where(ActivityEvent.id == event_id))
    if event_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    cm = FeedComment(event_id=event_id, user_id=current_user.id, text=payload.text.strip())
    db.add(cm)
    await db.flush()
    await db.refresh(cm)
    return FeedCommentResponse(
        id=cm.id,
        event_id=cm.event_id,
        user_id=cm.user_id,
        user_email=current_user.email,
        user_full_name=current_user.full_name,
        text=cm.text,
        created_at=cm.created_at,
    )


@router.delete("/{event_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    event_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FeedComment).where(
            FeedComment.id == comment_id,
            FeedComment.event_id == event_id,
            FeedComment.user_id == current_user.id,
        )
    )
    cm = result.scalar_one_or_none()
    if cm is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    await db.delete(cm)
    return None
