from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.api.auth import router as auth_router
from app.api.habits import router as habits_router
from app.api.analytics import router as analytics_router
from app.api.friends import router as friends_router
from app.api.feed import router as feed_router
from app.api.deps import get_current_user
from app.models import User
from app.schemas.user import UserResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield
    # shutdown (e.g. close pool) if needed


app = FastAPI(
    title="Habit Tracking API",
    description="Backend for habit tracking app with AI features",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(habits_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
app.include_router(friends_router, prefix="/api")
app.include_router(feed_router, prefix="/api")


@app.get("/api/auth/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.get("/health")
async def health():
    return {"status": "ok"}
