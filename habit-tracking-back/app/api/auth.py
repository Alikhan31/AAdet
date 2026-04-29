import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
from urllib.parse import urlencode

from app.database import get_db
from app.models import User, UserStats
from app.schemas.user import UserCreate, UserResponse
from app.schemas.auth import Token
from app.core.security import get_password_hash, verify_password, create_access_token
from app.config import get_settings
from app.api.deps import get_current_user
from app.services.email import send_verification_email as _send_email_sync


async def _dispatch_email(to_email: str, token: str) -> None:
    from app.config import get_settings
    if get_settings().redis_url:
        from app.tasks.email_tasks import send_verification_email_task
        send_verification_email_task.delay(to_email, token)
    else:
        await _send_email_sync(to_email, token)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _make_verification_token() -> tuple[str, datetime]:
    token = str(uuid.uuid4())
    expires = datetime.now(timezone.utc) + timedelta(hours=24)
    return token, expires


@router.post("/register")
async def register(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    token, expires = _make_verification_token()
    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        is_verified=False,
        verification_token=token,
        verification_token_expires=expires,
    )
    db.add(user)
    await db.flush()
    db.add(UserStats(user_id=user.id))
    await db.flush()

    await _dispatch_email(payload.email, token)

    return {"message": f"Verification email sent to {payload.email}"}


@router.post("/resend-verification")
async def resend_verification(
    payload: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    email = payload.get("email", "").strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    # Always return 200 to avoid leaking which emails exist
    if user and not user.is_verified:
        token, expires = _make_verification_token()
        user.verification_token = token
        user.verification_token_expires = expires
        await db.flush()
        await _dispatch_email(email, token)
    return {"message": "If your email is registered and unverified, a new link has been sent."}


@router.get("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(User).where(User.verification_token == token))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification link")
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified")
    now = datetime.now(timezone.utc)
    expires = user.verification_token_expires
    if expires is not None:
        # Make expires timezone-aware if it's naive (SQLite stores naive datetimes)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if now > expires:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification link has expired")
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    await db.flush()

    access_token = create_access_token(subject=user.id)
    return {"access_token": access_token, "token_type": "bearer", "message": "Email verified successfully"}


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Token:
    # OAuth2 spec uses "username" — we use it for email
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    # Check if user has password (not OAuth-only user)
    if user.hashed_password is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google sign-in. Please use Google OAuth.",
        )
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before signing in",
        )
    access_token = create_access_token(subject=user.id)
    return Token(access_token=access_token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/forgot-password")
async def forgot_password(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Initiates a password reset flow. Always returns 200 to avoid leaking
    which emails are registered. Email delivery is a TODO (no SMTP configured).
    """
    from pydantic import EmailStr, TypeAdapter
    email = payload.get("email", "").strip()
    try:
        TypeAdapter(EmailStr).validate_python(email)
    except Exception:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email")

    # Look up user silently — don't reveal whether account exists
    await db.execute(select(User).where(User.email == email))

    return {"message": "If an account with this email exists, a reset link has been sent."}


@router.get("/google")
async def google_oauth_authorize():
    """Redirect to Google OAuth consent screen."""
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth not configured",
        )
    
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@router.get("/google/callback")
async def google_oauth_callback(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback and create/login user."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth not configured",
        )

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to exchange code for token",
            )
        token_data = token_response.json()
        access_token = token_data["access_token"]

        # Get user info from Google
        user_info_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if user_info_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to fetch user info",
            )
        google_user = user_info_response.json()
        google_id = google_user["id"]
        email = google_user["email"]
        full_name = google_user.get("name")

    # Find or create user
    result = await db.execute(
        select(User).where(
            (User.email == email) | (User.google_id == google_id)
        )
    )
    user = result.scalar_one_or_none()

    if user:
        # Update existing user if needed
        if not user.google_id:
            user.google_id = google_id
        if not user.full_name and full_name:
            user.full_name = full_name
        # Google already verified the email
        if not user.is_verified:
            user.is_verified = True
        await db.flush()
    else:
        # Create new user — Google email is already verified
        user = User(
            email=email,
            google_id=google_id,
            full_name=full_name,
            hashed_password=None,
            is_verified=True,
        )
        db.add(user)
        await db.flush()
        db.add(UserStats(user_id=user.id))

    await db.refresh(user)

    # Generate JWT token
    jwt_token = create_access_token(subject=user.id)

    # Redirect to frontend with token (or return JSON)
    # For now, return JSON. Frontend can handle redirect
    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user),
    }
