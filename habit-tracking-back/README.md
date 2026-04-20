# Habit Tracking Backend (FastAPI)

Backend for the habit tracking app with AI features. This repo implements the foundation: **database schema** (users & habits) and **authentication APIs** (register, login, JWT).

## Features (planned)

- Habit dashboard · Analytics · Habit calendar · Friends · Activity feed · AI coach · AI insights · Gamification · Leaderboard · Notifications

## Setup

```bash
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env: set SECRET_KEY and optionally DATABASE_URL (default: SQLite)
```

## Run

**Локально:**
```bash
uvicorn app.main:app --reload
```

**Docker (API + PostgreSQL):**
```bash
docker compose up --build
# или в фоне: docker compose up -d --build
```
Поднимаются сервисы **api** (порт 8000) и **postgres** (порт 5432). API стартует после готовности БД. Данные PostgreSQL хранятся в volume `postgres_data`. Учёт по умолчанию: `habit` / `habit_secret`, БД `habit_tracking`.

- API: http://localhost:8000  
- Docs: http://localhost:8000/docs  

## Database

- **Users**: `id`, `email`, `hashed_password` (nullable for OAuth), `google_id` (nullable), `full_name`, `is_active`, `created_at`, `updated_at`
- **Habits**: `id`, `user_id`, `name`, `description`, `frequency`, `target_count`, `created_at`, `updated_at`  
  - Index on `(user_id, created_at)` for scalable queries.

Use PostgreSQL for production: set `DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname`.

## Auth API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register (JSON: `email`, `password`, `full_name?`) |
| POST | `/api/auth/login` | Login (form: `username`=email, `password`) → JWT |
| GET | `/api/auth/google` | Redirect to Google OAuth (if configured) |
| GET | `/api/auth/google/callback` | Google OAuth callback → JWT |
| GET | `/api/auth/me` | Current user (Bearer token) |

## Habit Api
GET	/api/habits	Список привычек пользователя (skip, limit).
POST	/api/habits	Создать привычку (body: name, description?, frequency?, target_count?).
GET	/api/habits/{habit_id}	Одна привычка.
PATCH	/api/habits/{habit_id}	Обновить привычку (частично).
DELETE	/api/habits/{habit_id}	Удалить привычку.
GET	/api/habits/{habit_id}/completions	История выполнений (опционально from_date, to_date).
POST	/api/habits/{habit_id}/completions	Записать выполнение на дату (body: completed_date, count?, note?).
POST	/api/habits/{habit_id}/complete-today	Отметить выполнение на сегодня (удобно для дашборда).
DELETE	/api/habits/{habit_id}/completions/{completed_date}	Удалить выполнение на дату.

## Analytics API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/stats` | Мои XP, уровень, стрики (current/longest). |
| POST | `/api/analytics/stats/recompute` | Пересчитать стрики и XP по всем выполнениям. |
| GET | `/api/analytics/summary` | Сводка: stats + completions_today, completions_this_week. |

## Friends API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/friends` | Список друзей (accepted). |
| POST | `/api/friends` | Добавить друга по email (body: `email`). |
| DELETE | `/api/friends/{friend_id}` | Удалить из друзей. |
| GET | `/api/friends/requests` | Входящие заявки (pending). |

## Activity Feed API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/feed` | Лента: мои + друзья события (skip, limit). `friends_only=true` — только друзья. |

События `habit_completed` создаются автоматически при добавлении выполнения привычки.

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 credentials (Web application)
3. Add authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
4. Copy `Client ID` and `Client Secret` to `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
5. Users can now sign in via `/api/auth/google`

## Project layout

```
app/
  main.py           # FastAPI app, lifespan, CORS
  config.py         # Settings from env
  database.py       # Async engine, session, get_db
  models/           # User, Habit (SQLAlchemy 2.0)
  schemas/          # Pydantic (UserCreate, UserResponse, Token)
  core/security.py  # Password hash, JWT
  api/
    auth.py         # register, login
    deps.py         # get_current_user (OAuth2 Bearer)
```
