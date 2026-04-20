from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def _pre_create_cleanup(conn):
    """Drop orphaned indexes/objects that would conflict with create_all. PostgreSQL only."""
    if conn.dialect.name != "postgresql":
        return
    from sqlalchemy import text
    # Orphaned from a previous failed startup — drop so create_all can recreate cleanly
    conn.execute(text("DROP INDEX IF EXISTS ix_reactions_event_id"))
    conn.execute(text("DROP INDEX IF EXISTS ix_reactions_event_id_2"))  # safety
    conn.execute(text("DROP INDEX IF EXISTS ix_feed_comments_event_id"))  # recreated by create_all
    # Add new columns to existing tables (IF NOT EXISTS is safe to repeat)
    conn.execute(text(
        "ALTER TABLE habits ADD COLUMN IF NOT EXISTS days_of_week JSONB DEFAULT '[0,1,2,3,4,5,6]'"
    ))


def _apply_pending_migrations(conn):
    """Add missing columns / fix indexes on existing databases."""
    from sqlalchemy import text
    if conn.dialect.name == "sqlite":
        cursor = conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in cursor.fetchall()]
        if "google_id" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR(255)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"))
        # Drop old unique friendship index; now using directional (non-unique) storage
        conn.execute(text("DROP INDEX IF EXISTS ix_friendships_user_friend"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friendships_user_friend ON friendships (user_id, friend_id)"))
        # Add days_of_week to habits if missing
        cursor2 = conn.execute(text("PRAGMA table_info(habits)"))
        habit_cols = [row[1] for row in cursor2.fetchall()]
        if "days_of_week" not in habit_cols:
            conn.execute(text("ALTER TABLE habits ADD COLUMN days_of_week TEXT DEFAULT '[0,1,2,3,4,5,6]'"))


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(_pre_create_cleanup)
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_apply_pending_migrations)
