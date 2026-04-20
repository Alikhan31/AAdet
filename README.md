# HabitFlow (monorepo)

This repo contains:
- `habit-tracking-back` — FastAPI backend (JWT auth, habits, analytics, friends, feed)
- `habit-tracking-front` — Next.js frontend

## Run with Docker (recommended)

1. Create backend env file:

```bash
cp habit-tracking-back/.env.example habit-tracking-back/.env
```

2. Start everything:

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8001` (docs: `/docs`)

## Local dev (without Docker)

### Backend

```bash
cd habit-tracking-back
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd habit-tracking-front
cp .env.example .env.local
npm install
npm run dev
```

Frontend will proxy `/api/*` to the backend using `NEXT_PUBLIC_API_BASE_URL`.

