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
    # Only alter existing tables — skip if table doesn't exist yet (fresh DB)
    habits_exists = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='habits')"
    )).scalar()
    if habits_exists:
        conn.execute(text(
            "ALTER TABLE habits ADD COLUMN IF NOT EXISTS days_of_week JSONB DEFAULT '[0,1,2,3,4,5,6]'"
        ))
        conn.execute(text(
            "ALTER TABLE habits ADD COLUMN IF NOT EXISTS visibility VARCHAR(16) DEFAULT 'friends' NOT NULL"
        ))
        conn.execute(text("ALTER TABLE habits ADD COLUMN IF NOT EXISTS category VARCHAR(64)"))
        conn.execute(text("ALTER TABLE habits ADD COLUMN IF NOT EXISTS icon VARCHAR(64)"))

    users_exists = conn.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users')"
    )).scalar()
    if users_exists:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE"
        ))
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255)"
        ))
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP WITH TIME ZONE"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_verification_token ON users (verification_token)"
        ))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Shared habits tables
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shared_habit_groups (
                id SERIAL PRIMARY KEY,
                original_habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shg_original_habit_id ON shared_habit_groups (original_habit_id)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shared_habit_members (
                id SERIAL PRIMARY KEY,
                group_id INTEGER NOT NULL REFERENCES shared_habit_groups(id) ON DELETE CASCADE,
                invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                member_habit_id INTEGER REFERENCES habits(id) ON DELETE SET NULL,
                invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                responded_at TIMESTAMP WITH TIME ZONE,
                UNIQUE(group_id, invitee_id)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shm_invitee_id ON shared_habit_members (invitee_id)"))


def _apply_pending_migrations(conn):
    """Add missing columns / fix indexes on existing databases."""
    from sqlalchemy import text
    if conn.dialect.name == "sqlite":
        cursor = conn.execute(text("PRAGMA table_info(users)"))
        columns = [row[1] for row in cursor.fetchall()]
        if "google_id" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN google_id VARCHAR(255)"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"))
        if "is_verified" not in columns:
            # Existing users get verified=true so they don't lose access
            conn.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT 1"))
        if "verification_token" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN verification_token VARCHAR(255)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_verification_token ON users (verification_token)"))
        if "verification_token_expires" not in columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN verification_token_expires DATETIME"))
        # Drop old unique friendship index; now using directional (non-unique) storage
        conn.execute(text("DROP INDEX IF EXISTS ix_friendships_user_friend"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_friendships_user_friend ON friendships (user_id, friend_id)"))
        # Add days_of_week to habits if missing
        cursor2 = conn.execute(text("PRAGMA table_info(habits)"))
        habit_cols = [row[1] for row in cursor2.fetchall()]
        if "days_of_week" not in habit_cols:
            conn.execute(text("ALTER TABLE habits ADD COLUMN days_of_week TEXT DEFAULT '[0,1,2,3,4,5,6]'"))
        cursor3 = conn.execute(text("PRAGMA table_info(habits)"))
        habit_cols2 = [row[1] for row in cursor3.fetchall()]
        if "visibility" not in habit_cols2:
            conn.execute(text("ALTER TABLE habits ADD COLUMN visibility VARCHAR(16) DEFAULT 'friends' NOT NULL"))
        # habit_visible_to table (created via create_all, but ensure it exists for old DBs)
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS habit_visible_to (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(habit_id, user_id)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_habit_visible_to_habit_id ON habit_visible_to (habit_id)"))
        # category + icon columns
        cursor4 = conn.execute(text("PRAGMA table_info(habits)"))
        habit_cols3 = [row[1] for row in cursor4.fetchall()]
        if "category" not in habit_cols3:
            conn.execute(text("ALTER TABLE habits ADD COLUMN category VARCHAR(64)"))
        if "icon" not in habit_cols3:
            conn.execute(text("ALTER TABLE habits ADD COLUMN icon VARCHAR(64)"))
        # user_profiles table
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                data TEXT NOT NULL DEFAULT '{}',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # Shared habits tables for SQLite
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shared_habit_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shg_original_habit_id ON shared_habit_groups (original_habit_id)"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS shared_habit_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL REFERENCES shared_habit_groups(id) ON DELETE CASCADE,
                invitee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(16) NOT NULL DEFAULT 'pending',
                member_habit_id INTEGER REFERENCES habits(id) ON DELETE SET NULL,
                invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                responded_at DATETIME,
                UNIQUE(group_id, invitee_id)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_shm_invitee_id ON shared_habit_members (invitee_id)"))


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(_pre_create_cleanup)
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_apply_pending_migrations)
