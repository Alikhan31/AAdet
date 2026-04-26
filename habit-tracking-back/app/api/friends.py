from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Friendship
from app.schemas.friend import FriendCreate, FriendResponse, FriendRequestResponse, FriendSearchResponse
from app.api.deps import get_current_user

router = APIRouter(prefix="/friends", tags=["friends"])


def _existing_friendship_filter(uid: int, fid: int):
    """Match a friendship row in either direction."""
    return or_(
        and_(Friendship.user_id == uid, Friendship.friend_id == fid),
        and_(Friendship.user_id == fid, Friendship.friend_id == uid),
    )


@router.get("/search", response_model=list[FriendSearchResponse])
async def search_users(
    q: str = Query(..., min_length=1, description="Search by name or email"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=50),
):
    """Search users by name or email. Returns their friendship status if any."""
    pattern = f"%{q}%"
    result = await db.execute(
        select(User)
        .where(
            User.id != current_user.id,
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
            ),
        )
        .limit(limit)
    )
    users = result.scalars().all()

    # Look up friendship statuses for found users in one query
    if not users:
        return []
    user_ids = [u.id for u in users]
    fs_result = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.user_id == current_user.id, Friendship.friend_id.in_(user_ids)),
                and_(Friendship.friend_id == current_user.id, Friendship.user_id.in_(user_ids)),
            )
        )
    )
    friendships = fs_result.scalars().all()
    # Map other_user_id → friendship status
    status_map: dict[int, str] = {}
    for fs in friendships:
        other_id = fs.friend_id if fs.user_id == current_user.id else fs.user_id
        status_map[other_id] = fs.status

    return [
        FriendSearchResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            friendship_status=status_map.get(u.id),
        )
        for u in users
    ]


@router.get("/requests", response_model=list[FriendRequestResponse])
async def list_pending_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Incoming pending requests where someone asked to be my friend (friend_id = me)."""
    result = await db.execute(
        select(Friendship, User)
        .join(User, User.id == Friendship.user_id)
        .where(Friendship.friend_id == current_user.id, Friendship.status == "pending")
    )
    out = []
    for fs, requester in result.all():
        out.append(
            FriendRequestResponse(
                id=fs.id,
                user_id=requester.id,
                email=requester.email,
                full_name=requester.full_name,
                status=fs.status,
                created_at=fs.created_at,
            )
        )
    return out





@router.get("", response_model=list[FriendResponse])
async def list_friends(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    result = await db.execute(
        select(Friendship)
        .options(selectinload(Friendship.user), selectinload(Friendship.friend))
        .where(
            or_(Friendship.user_id == current_user.id, Friendship.friend_id == current_user.id),
            Friendship.status == "accepted",
        )
        .offset(skip)
        .limit(limit)
    )
    rows = result.scalars().all()
    out = []
    for fs in rows:
        other = fs.friend if fs.user_id == current_user.id else fs.user
        out.append(
            FriendResponse(
                id=other.id,
                email=other.email,
                full_name=other.full_name,
                status=fs.status,
                created_at=fs.created_at,
            )
        )
    return out


@router.post("", response_model=FriendRequestResponse, status_code=status.HTTP_201_CREATED)
async def add_friend(
    payload: FriendCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a friend request (creates a pending friendship row)."""
    if payload.email == current_user.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot add yourself")

    result = await db.execute(select(User).where(User.email == payload.email))
    friend_user = result.scalar_one_or_none()
    if friend_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(Friendship).where(_existing_friendship_filter(current_user.id, friend_user.id))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already friends or request pending")

    # Directional: user_id = requester, friend_id = recipient
    fs = Friendship(user_id=current_user.id, friend_id=friend_user.id, status="pending")
    db.add(fs)
    await db.flush()
    await db.refresh(fs)
    return FriendRequestResponse(
        id=fs.id,
        user_id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        status=fs.status,
        created_at=fs.created_at,
    )


@router.patch("/{friendship_id}/accept", response_model=FriendResponse)
async def accept_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept an incoming friend request. Only the recipient can accept."""
    result = await db.execute(
        select(Friendship, User)
        .join(User, User.id == Friendship.user_id)
        .where(
            Friendship.id == friendship_id,
            Friendship.friend_id == current_user.id,
            Friendship.status == "pending",
        )
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending request not found")

    fs, requester = row
    fs.status = "accepted"
    await db.flush()
    return FriendResponse(
        id=requester.id,
        email=requester.email,
        full_name=requester.full_name,
        status="accepted",
        created_at=fs.created_at,
    )


@router.patch("/{friendship_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject (delete) an incoming friend request. Only the recipient can reject."""
    result = await db.execute(
        select(Friendship).where(
            Friendship.id == friendship_id,
            Friendship.friend_id == current_user.id,
            Friendship.status == "pending",
        )
    )
    fs = result.scalar_one_or_none()
    if fs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pending request not found")

    await db.delete(fs)
    return None


@router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an accepted friendship."""
    if current_user.id == friend_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid friend id")
    result = await db.execute(
        select(Friendship).where(
            _existing_friendship_filter(current_user.id, friend_id),
            Friendship.status == "accepted",
        )
    )
    fs = result.scalar_one_or_none()
    if fs is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friendship not found")
    await db.delete(fs)
    return None
