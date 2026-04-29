# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Adet** — a full-stack social habit tracking app. Monorepo with a Python/FastAPI backend and a Next.js frontend, orchestrated via Docker Compose.

## Commands

### Full Stack (Docker)
```bash
docker compose up --build
# Frontend: http://localhost:3000
# Backend API: http://localhost:8001  (Swagger: /docs)
```

### Backend (local)
```bash
cd habit-tracking-back
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend (local)
```bash
cd habit-tracking-front
npm install
npm run dev      # Next.js with Turbopack
npm run build
npm run lint     # next lint
```

## Architecture

### Backend (`habit-tracking-back/`)

Layered FastAPI app:

- **`app/main.py`** — app factory, CORS, router registration, async lifespan
- **`app/config.py`** — pydantic-settings with `lru_cache`
- **`app/database.py`** — async SQLAlchemy engine; `init_db()` runs `create_all` + manual migrations via `_apply_pending_migrations()` (no Alembic)
- **`app/models/`** — SQLAlchemy ORM models: `User`, `Habit`, `HabitCompletion`, `Friendship`, `ActivityEvent`, `Notification`, `UserStats`
- **`app/schemas/`** — Pydantic v2 request/response schemas per domain
- **`app/api/`** — FastAPI routers (`auth`, `habits`, `analytics`, `friends`, `feed`); `deps.py` has the `get_current_user` Bearer token dependency
- **`app/services/`** — Business logic (XP/streak computation, activity feed)
- **`app/core/security.py`** — bcrypt password hashing, JWT create/verify

Database: SQLite by default (dev), PostgreSQL in Docker. Switching is via `DATABASE_URL` in `.env`.

### Frontend (`habit-tracking-front/`)

Single-page app using Next.js App Router with a tab-navigation shell:

- **`components/app-shell.tsx`** — top-level tab navigator (Home / Friends / Stats / AI Coach / Profile)
- **`components/auth-gate.tsx`** — render-prop wrapper that reads JWT from `localStorage` (`adet_token`), validates via `GET /api/auth/me`, and passes `{ token, user, logout }` to children. No server-side auth or middleware.
- **`lib/api.ts`** — typed `apiFetch` wrapper; all API calls live here under `api.auth.*`, `api.habits.*`, etc.
- **`lib/auth.ts`** — `localStorage` helpers: `getStoredToken`, `setStoredToken`, `clearStoredToken`
- **`components/ui/`** — shadcn/ui components (Radix UI primitives, ~30 components)

**API proxying:** `next.config.mjs` rewrites `/api/*` → `NEXT_PUBLIC_API_BASE_URL`, so all browser calls use relative `/api/...` paths.

**TypeScript:** strict mode enabled, but `ignoreBuildErrors: true` in next.config.mjs — type errors won't block builds.

## Key Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend `.env` | Postgres or SQLite connection string |
| `SECRET_KEY` | backend `.env` | JWT signing key |
| `GOOGLE_CLIENT_ID/SECRET` | backend `.env` | Google OAuth |
| `NEXT_PUBLIC_API_BASE_URL` | frontend `.env` | Backend URL (e.g. `http://localhost:8001`) |
