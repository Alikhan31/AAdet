# HabitFlow Backend — Remaining Work

## Status Key
- [ ] Not started
- [x] Done
- [~] In progress

---

## 1. Fix Friends System (~1–2 hours) [~]
- [x] Fix `add_friend` to create as `pending` instead of `accepted`
- [x] Add `PATCH /api/friends/{id}/accept` endpoint
- [x] Add `PATCH /api/friends/{id}/reject` endpoint
- [x] Add `GET /api/friends/search?q=` — search users by username/name (not just exact email)

## 2. Activity Feed Reactions (~2–3 hours) [~]
- [x] Add `Reaction` model (`event_id`, `user_id`, `type`)
- [x] Add `POST /api/feed/{id}/react` endpoint
- [x] Add `DELETE /api/feed/{id}/react` endpoint

## 3. Notifications API (~2–3 hours)
- [ ] `GET /api/notifications` — list unread notifications
- [ ] `POST /api/notifications/{id}/read` — mark as read
- [ ] `POST /api/notifications` — create notification (internal use)

## 4. Leaderboard Endpoint (~1 hour)
- [ ] `GET /api/leaderboard` — rank users by `total_xp` from `UserStats`

## 5. Badges System (~3–4 hours)
- [ ] Add `Badge` model (`name`, `description`, `icon`, `xp_threshold` or condition)
- [ ] Award logic: on habit completion check streak milestones and XP thresholds
- [ ] `GET /api/badges/me` endpoint

## 6. AI Integration (~4–6 hours)
- [ ] Connect to OpenAI or Anthropic API
- [ ] `POST /api/ai/chat` — AI coach (takes message history, returns reply)
- [ ] `GET /api/ai/insights` — personalized habit insights from user's stats

## 7. Real-time / WebSocket (~4–5 hours)
- [ ] Add FastAPI WebSocket or SSE endpoint for live feed/notification updates
- [ ] Frontend can wire it up once the endpoint exists

## 8. Analytics Gaps (~2 hours)
- [ ] Per-habit breakdown endpoint (completion rate, best streak per habit)
- [ ] Weekly/monthly time-series endpoint for frontend charts

---

## Critical Path for Team
1. You (backend): finish items 3–8
2. Teammates (frontend): wire hardcoded UI to real endpoints from 1–4

Suggested order: **Leaderboard → Notifications → Badges → AI → Analytics → WebSocket**
