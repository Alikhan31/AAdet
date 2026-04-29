from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.core.redis import get_redis, close_redis
from app.api.auth import router as auth_router
from app.api.habits import router as habits_router
from app.api.analytics import router as analytics_router
from app.api.friends import router as friends_router
from app.api.feed import router as feed_router
from app.api.ai import router as ai_router
from app.api.user_profile import router as user_profile_router
from app.api.shared_habits import router as shared_habits_router
from app.api.deps import get_current_user
from app.models import User
from app.schemas.user import UserResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await get_redis()  # warm up connection pool if Redis is configured
    yield
    await close_redis()


app = FastAPI(
    title="Habit Tracking API",
    description="Backend for habit tracking app with AI features",
    version="0.1.0",
    lifespan=lifespan,
)

import os
_raw = os.getenv("ALLOWED_ORIGINS", "*")
_origins: list[str] | str = ["*"] if _raw.strip() == "*" else [o.strip() for o in _raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(habits_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(friends_router, prefix="/api")
app.include_router(feed_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(user_profile_router, prefix="/api")
app.include_router(shared_habits_router, prefix="/api")


@app.get("/api/auth/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/health")
async def health():
    return {"status": "ok"}
