from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

import httpx
import json
from datetime import date, timedelta
from collections import defaultdict

from app.api.deps import get_current_user
from app.database import get_db
from app.models import User, Habit, HabitCompletion
from app.models.user_profile import UserProfile
from app.config import get_settings

router = APIRouter(prefix="/ai", tags=["ai"])

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

GROK_API_URL = "https://api.x.ai/v1/chat/completions"
GROK_CHAT_MODEL = "grok-3-mini-latest"
GROK_ANALYZE_MODEL = "grok-3-latest"


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str


async def _build_user_context(user: User, db: AsyncSession) -> str:
    habits_result = await db.execute(select(Habit).where(Habit.user_id == user.id))
    habits = habits_result.scalars().all()

    today = date.today()
    thirty_ago = today - timedelta(days=30)

    completions_result = await db.execute(
        select(HabitCompletion)
        .join(Habit, HabitCompletion.habit_id == Habit.id)
        .where(Habit.user_id == user.id, HabitCompletion.completed_date >= thirty_ago, HabitCompletion.count > 0)
    )
    completions = completions_result.scalars().all()

    completion_by_habit: dict[int, int] = {}
    for c in completions:
        completion_by_habit[c.habit_id] = completion_by_habit.get(c.habit_id, 0) + 1

    habits_info = []
    for h in habits:
        count = completion_by_habit.get(h.id, 0)
        created = h.created_at.date() if hasattr(h.created_at, "date") else date.fromisoformat(str(h.created_at)[:10])
        days_active = max((today - created).days, 1)
        relevant_days = min(days_active, 30)
        rate = round(count / relevant_days * 100) if relevant_days > 0 else 0
        category = h.category or "general"
        desc = f" — {h.description}" if h.description else ""
        habits_info.append(
            f"- [{h.id}] {h.name} ({category}){desc}: {count} completions / last 30 days ({rate}% rate)"
        )

    # User profile data
    profile_result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = profile_result.scalar_one_or_none()
    profile_data = profile.data if profile and profile.data else {}

    name = user.full_name or user.email.split("@")[0]
    habits_block = "\n".join(habits_info) if habits_info else "No habits tracked yet."
    profile_block = (
        "\n".join(f"  {k}: {v}" for k, v in profile_data.items())
        if profile_data else "  (not set)"
    )

    return (
        f"User name: {name}\n"
        f"Total habits: {len(habits)}\n"
        f"Habit performance (last 30 days):\n{habits_block}\n\n"
        f"User profile:\n{profile_block}"
    )


async def _chat_via_claude(settings, system_prompt: str, messages: list[dict]) -> str:
    payload = {
        "model": CLAUDE_MODEL,
        "max_tokens": 512,
        "system": system_prompt,
        "messages": messages,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            CLAUDE_API_URL,
            json=payload,
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI service error")
    return resp.json()["content"][0]["text"]


async def _call_gemini(settings, system_prompt: str, messages: list[dict], max_tokens: int = 512) -> str:
    contents = []
    for m in messages:
        role = "user" if m["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m["content"]}]})
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.7},
    }
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={settings.gemini_api_key}"
    )
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=payload)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI service error")
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


# Keep old name as alias for backward compat
async def _chat_via_gemini(settings, system_prompt: str, messages: list[dict]) -> str:
    return await _call_gemini(settings, system_prompt, messages, max_tokens=512)


async def _analyze_via_gemini(settings, system_prompt: str, messages: list[dict], user_id: int, db: AsyncSession) -> tuple[str, list[dict]]:
    """Gemini analyze: fetch all tool data first, then ask for one-shot JSON analysis."""
    # Eagerly call all relevant tools to build context
    collected: list[dict] = []
    habit_list = await _execute_tool("list_habits", {}, user_id, db)
    collected.append({"tool": "list_habits", "result": habit_list})
    for tool_name, args in [
        ("get_weekday_breakdown", {}),
        ("get_completions_trend", {}),
        ("get_category_breakdown", {}),
    ]:
        result = await _execute_tool(tool_name, args, user_id, db)
        collected.append({"tool": tool_name, "result": result})

    # Append fetched data to the user message
    data_block = json.dumps(collected, default=str)
    augmented_messages = list(messages)
    augmented_messages[-1] = {
        "role": "user",
        "content": augmented_messages[-1]["content"] + f"\n\n=== FETCHED HABIT DATA ===\n{data_block}",
    }
    raw = await _call_gemini(settings, system_prompt, augmented_messages, max_tokens=1200)
    return raw, collected


async def _chat_via_grok(settings, system_prompt: str, messages: list[dict], model: str = GROK_CHAT_MODEL) -> str:
    msgs = [{"role": "system", "content": system_prompt}] + messages
    payload = {"model": model, "max_tokens": 512, "messages": msgs}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GROK_API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {settings.grok_api_key}", "content-type": "application/json"},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI service error")
    return resp.json()["choices"][0]["message"]["content"]


async def _analyze_via_grok(
    settings, system_prompt: str, messages: list[dict], user_id: int, db: AsyncSession
) -> tuple[str, list[dict]]:
    """Run tool-use loop with Grok (OpenAI-compatible format). Returns (raw_text, collected_tool_data)."""
    tools_oai = [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in ANALYZE_TOOLS
    ]
    msgs: list[dict] = [{"role": "system", "content": system_prompt}] + messages
    collected: list[dict] = []

    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(8):
            payload = {
                "model": GROK_ANALYZE_MODEL,
                "max_tokens": 1200,
                "messages": msgs,
                "tools": tools_oai,
                "tool_choice": "auto",
            }
            resp = await client.post(
                GROK_API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.grok_api_key}", "content-type": "application/json"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail="AI service error")

            choice = resp.json()["choices"][0]
            finish_reason = choice.get("finish_reason", "stop")
            message = choice["message"]

            if finish_reason == "tool_calls":
                msgs.append(message)
                for tc in message.get("tool_calls", []):
                    fn = tc["function"]
                    args = json.loads(fn["arguments"] or "{}")
                    result = await _execute_tool(fn["name"], args, user_id, db)
                    collected.append({"tool": fn["name"], "input": args, "result": result})
                    msgs.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": json.dumps(result, default=str),
                    })
                continue

            return message.get("content", ""), collected

    raise HTTPException(status_code=502, detail="AI analysis did not complete")


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    provider = settings.ai_chat_provider
    if provider == "grok" and not settings.grok_api_key:
        provider = "claude"  # fallback
    if provider == "gemini" and not settings.gemini_api_key:
        provider = "claude"
    if provider == "claude" and not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI coach is not configured")

    user_context = await _build_user_context(current_user, db)

    system_prompt = (
        "You are an encouraging, insightful AI habit coach embedded in a habit-tracking app. "
        "You have access to the user's real habit data shown below. "
        "Be warm, specific, and data-driven. Keep responses concise (2-4 short paragraphs max). "
        "Use the user's actual habit names and statistics in your replies when relevant. "
        "Never make up statistics not present in the data.\n\n"
        f"=== User Context ===\n{user_context}\n=== End Context ==="
    )

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    if provider == "grok":
        reply = await _chat_via_grok(settings, system_prompt, messages)
    elif provider == "gemini":
        reply = await _chat_via_gemini(settings, system_prompt, messages)
    else:
        reply = await _chat_via_claude(settings, system_prompt, messages)

    return ChatResponse(reply=reply)


# ── Analyze endpoint with tool_use agentic loop ───────────────────────────────

class AnalyzeRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    profile_answers: dict = {}  # answers to profile questions, merged before analysis


class ChartSpec(BaseModel):
    type: str        # "bar" | "line" | "pie"
    title: str
    x_key: str
    y_key: str
    data: list[dict]
    color: str | None = None


class QuestionField(BaseModel):
    id: str
    label: str
    type: str  # "number" | "text" | "chips" | "slider"
    options: list[str] | None = None
    placeholder: str | None = None
    min: int | None = None
    max: int | None = None


class ProposedHabit(BaseModel):
    name: str
    description: str | None = None
    category: str | None = None
    icon: str | None = None
    days_of_week: list[int] = []
    target_count: int = 1
    reason: str | None = None
    existing_habit_id: int | None = None


class AnalyzeResponse(BaseModel):
    mode: str = "analysis"          # "questions" | "analysis"
    # questions mode
    intro: str | None = None
    questions: list[QuestionField] = []
    # analysis mode
    text: str = ""
    key_insights: list[str] = []
    charts: list[ChartSpec] = []
    proposed_habits: list[ProposedHabit] = []


ANALYZE_TOOLS = [
    {
        "name": "list_habits",
        "description": "List all the user's habits with id, name, category, icon.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_weekday_breakdown",
        "description": "Get completion rate and count by day of week (Mon–Sun). Filter by habit_id or category.",
        "input_schema": {
            "type": "object",
            "properties": {
                "habit_id": {"type": "integer", "description": "Filter to one habit"},
                "category": {"type": "string", "description": "Filter to one category"},
                "days": {"type": "integer", "description": "Past days window (default 90)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_completions_trend",
        "description": "Weekly completion totals over time. Filter by habit_id or category.",
        "input_schema": {
            "type": "object",
            "properties": {
                "habit_id": {"type": "integer"},
                "category": {"type": "string"},
                "days": {"type": "integer", "description": "Past days window (default 90)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_habit_stats",
        "description": "Detailed stats for a specific habit: completion_rate, streaks, total_completions, daily breakdown.",
        "input_schema": {
            "type": "object",
            "properties": {
                "habit_id": {"type": "integer"},
                "days": {"type": "integer", "description": "Past days window (default 90)"},
            },
            "required": ["habit_id"],
        },
    },
    {
        "name": "get_category_breakdown",
        "description": "Completion stats grouped by category: total completions, average rate, habit count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Past days window (default 90)"},
            },
            "required": [],
        },
    },
]

WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


async def _execute_tool(name: str, args: dict, user_id: int, db: AsyncSession) -> dict:
    days = int(args.get("days", 90))
    since = date.today() - timedelta(days=days)

    habits_q = await db.execute(select(Habit).where(Habit.user_id == user_id))
    habits = habits_q.scalars().all()
    habit_map = {h.id: h for h in habits}

    if name == "list_habits":
        return {"habits": [{"id": h.id, "name": h.name, "category": h.category, "icon": h.icon} for h in habits]}

    # fetch relevant completions
    q = (
        select(HabitCompletion)
        .join(Habit, HabitCompletion.habit_id == Habit.id)
        .where(Habit.user_id == user_id, HabitCompletion.completed_date >= since)
    )
    if "habit_id" in args and args["habit_id"]:
        q = q.where(HabitCompletion.habit_id == args["habit_id"])
    if "category" in args and args["category"]:
        q = q.where(Habit.category == args["category"])
    comps_q = await db.execute(q)
    completions = comps_q.scalars().all()

    def _to_date(v) -> date:
        return v if isinstance(v, date) else date.fromisoformat(str(v))

    if name == "get_weekday_breakdown":
        counts: dict[int, int] = defaultdict(int)
        for c in completions:
            wd = _to_date(c.completed_date).weekday()  # 0=Mon
            counts[wd] += 1
        total_weeks = max(days // 7, 1)
        return {
            "data": [
                {"day": WEEKDAY_NAMES[i], "count": counts[i], "rate": round(counts[i] / total_weeks * 100)}
                for i in range(7)
            ]
        }

    if name == "get_completions_trend":
        week_counts: dict[str, int] = defaultdict(int)
        for c in completions:
            d = _to_date(c.completed_date)
            week_start = d - timedelta(days=d.weekday())
            week_counts[week_start.isoformat()] += 1
        sorted_weeks = sorted(week_counts.items())
        return {
            "data": [
                {"week": w, "count": cnt}
                for w, cnt in sorted_weeks
            ]
        }

    if name == "get_habit_stats":
        habit_id = args.get("habit_id")
        if not habit_id or habit_id not in habit_map:
            return {"error": "habit not found"}
        h = habit_map[habit_id]
        day_counts: dict[date, int] = defaultdict(int)
        for c in completions:
            day_counts[_to_date(c.completed_date)] += c.count
        total = sum(day_counts.values())
        rate = round(total / days * 100)
        # streaks
        sorted_dates = sorted(day_counts.keys())
        current = longest = streak = 0
        prev: date | None = None
        for d in sorted_dates:
            if prev and (d - prev).days == 1:
                streak += 1
            else:
                streak = 1
            longest = max(longest, streak)
            prev = d
        current = streak if sorted_dates and (date.today() - sorted_dates[-1]).days <= 1 else 0
        daily = [{"date": (date.today() - timedelta(days=i)).isoformat(), "count": day_counts.get(date.today() - timedelta(days=i), 0)} for i in range(29, -1, -1)]
        return {
            "habit": {"id": h.id, "name": h.name, "category": h.category},
            "total_completions": total,
            "completion_rate": rate,
            "current_streak": current,
            "longest_streak": longest,
            "daily_last_30": daily,
        }

    if name == "get_category_breakdown":
        cat_data: dict[str, dict] = defaultdict(lambda: {"count": 0, "habits": set()})
        for c in completions:
            h = habit_map.get(c.habit_id)
            cat = (h.category if h else None) or "other"
            cat_data[cat]["count"] += c.count
            cat_data[cat]["habits"].add(c.habit_id)
        return {
            "data": [
                {"category": cat, "total_completions": v["count"], "habit_count": len(v["habits"])}
                for cat, v in sorted(cat_data.items(), key=lambda x: -x[1]["count"])
            ]
        }

    return {"error": f"unknown tool {name}"}


ANALYZE_SYSTEM = """You are an AI habit coach and data analyst. You have tools to fetch the user's habit data.

CRITICAL OUTPUT RULE: Your ENTIRE response must be ONE valid JSON object. No text before it. No text after it. No explanation. No markdown. No code fences. Just the raw JSON object starting with { and ending with }.

IMPORTANT — before doing analysis, check the User profile section in the context. If the user asks about a topic (fitness, reading, sleep, diet, etc.) and the profile is missing relevant personal info (age, fitness level, current books, preferred sports, region, etc.), return MODE QUESTIONS first.

Decide which mode to respond in, then return ONLY a valid JSON object.

=== MODE: questions ===
Use when you need 1-4 personal details to give truly personalized advice.
{
  "mode": "questions",
  "intro": "One sentence explaining why you're asking",
  "questions": [
    {"id": "age", "label": "How old are you?", "type": "number", "placeholder": "25", "min": 10, "max": 100},
    {"id": "fitness_level", "label": "Fitness level", "type": "chips", "options": ["Beginner", "Intermediate", "Advanced"]},
    {"id": "preferred_sport", "label": "Favorite sport or exercise", "type": "text", "placeholder": "Running, cycling..."},
    {"id": "current_book", "label": "Book you're reading now", "type": "text", "placeholder": "Title or author"}
  ]
}
Only ask for fields that are genuinely needed. Never ask for the same thing twice (check profile data first).

=== MODE: analysis ===
Use when you have enough context. Always use tools to fetch real data first.
{
  "mode": "analysis",
  "text": "2-4 paragraph analysis, warm and specific with real numbers from the data",
  "key_insights": ["Insight 1 with number", "Insight 2", "Insight 3"],
  "proposed_habits": [
    {
      "name": "Habit name",
      "description": "Clear description with specifics (e.g. '3km morning run' or 'Chapter 1 of Clean Code')",
      "category": "fitness|health|mind|learning|social|work|finance|lifestyle|other",
      "icon": "activity|heart|brain|book-open|dumbbell|target|star|zap|sun|moon|leaf|droplets|clock|flame",
      "days_of_week": [0,1,2,3,4],
      "target_count": 1,
      "reason": "Why this habit suits the user specifically",
      "existing_habit_id": null
    }
  ]
}

For proposed_habits: always suggest at least 1 when the user asks about starting/improving a habit. Use existing_habit_id (from the habit list in context) if suggesting an update to an existing one. Make descriptions specific and actionable. Suggest realistic days_of_week (0=Mon..6=Sun).
Return ONLY the JSON, no markdown fences, no extra text."""

CHART_SYSTEM = """You are a data visualization specialist. Given habit data, generate 2-3 charts that best visualize it.

Output ONLY a valid JSON array (no text, no markdown):
[
  {
    "type": "bar",
    "title": "Chart title",
    "x_key": "field name for x axis",
    "y_key": "field name for y axis",
    "data": [{"label": "Mon", "value": 5}],
    "color": "#hex or null"
  }
]

Rules:
- x_key and y_key must exactly match field names in the data objects
- type: "bar" | "line" | "pie"
- 2-3 charts max, each showing something different (daily trend, weekday breakdown, category comparison, etc.)
- Output ONLY the JSON array, nothing else."""


def _extract_json_with_mode(raw: str) -> dict | None:
    parsed = None
    search = raw
    while search:
        start = search.find("{")
        if start == -1:
            break
        end = start + 1
        depth = 1
        while end < len(search) and depth > 0:
            if search[end] == "{":
                depth += 1
            elif search[end] == "}":
                depth -= 1
            end += 1
        try:
            candidate = json.loads(search[start:end])
            if "mode" in candidate:
                parsed = candidate
        except Exception:
            pass
        search = search[end:]
    return parsed


@router.post("/analyze", response_model=AnalyzeResponse)
async def ai_analyze(
    req: AnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    provider = settings.ai_chat_provider
    if provider == "grok" and not settings.grok_api_key:
        provider = "claude"
    if provider == "gemini" and not settings.gemini_api_key:
        provider = "claude"
    use_grok = provider == "grok"
    use_gemini = provider == "gemini"
    if not use_grok and not use_gemini and not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="AI coach is not configured")

    # Save any profile answers provided with this request
    if req.profile_answers:
        prof_result = await db.execute(select(UserProfile).where(UserProfile.user_id == current_user.id))
        prof = prof_result.scalar_one_or_none()
        if not prof:
            prof = UserProfile(user_id=current_user.id, data={})
            db.add(prof)
        prof.data = {**(prof.data or {}), **req.profile_answers}
        await db.flush()

    user_context = await _build_user_context(current_user, db)
    system = ANALYZE_SYSTEM + f"\n\n=== CURRENT USER CONTEXT ===\n{user_context}"
    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    if use_grok:
        raw, collected_tool_data = await _analyze_via_grok(settings, system, messages, current_user.id, db)
        parsed = _extract_json_with_mode(raw)
        if parsed is None:
            return AnalyzeResponse(mode="analysis", text=raw)
    elif use_gemini:
        raw, collected_tool_data = await _analyze_via_gemini(settings, system, messages, current_user.id, db)
        parsed = _extract_json_with_mode(raw)
        if parsed is None:
            return AnalyzeResponse(mode="analysis", text=raw)
    else:
        # ── Claude agentic tool loop ──
        headers = {
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        collected_tool_data: list[dict] = []
        parsed = None
        raw = ""
        async with httpx.AsyncClient(timeout=60) as client:
            for _ in range(8):
                payload = {
                    "model": CLAUDE_MODEL,
                    "max_tokens": 1200,
                    "system": system,
                    "tools": ANALYZE_TOOLS,
                    "messages": messages,
                }
                resp = await client.post(CLAUDE_API_URL, json=payload, headers=headers)
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail="AI service error")
                data = resp.json()
                stop_reason = data.get("stop_reason")
                if stop_reason == "end_turn":
                    raw = next((b["text"] for b in data["content"] if b["type"] == "text"), "{}")
                    parsed = _extract_json_with_mode(raw)
                    break
                if stop_reason == "tool_use":
                    messages.append({"role": "assistant", "content": data["content"]})
                    tool_results = []
                    for block in data["content"]:
                        if block["type"] == "tool_use":
                            result = await _execute_tool(block["name"], block["input"], current_user.id, db)
                            collected_tool_data.append({"tool": block["name"], "input": block["input"], "result": result})
                            tool_results.append({"type": "tool_result", "tool_use_id": block["id"], "content": json.dumps(result)})
                    messages.append({"role": "user", "content": tool_results})
                    continue
                break
        if parsed is None:
            return AnalyzeResponse(mode="analysis", text=raw)

    mode = parsed.get("mode", "analysis")
    if mode == "questions":
        return AnalyzeResponse(
            mode="questions",
            intro=parsed.get("intro"),
            questions=[QuestionField(**q) for q in parsed.get("questions", [])],
        )

    # ── Chart agent ──
    charts: list[ChartSpec] = []
    if collected_tool_data:
        chart_prompt = (
            f"User query: {req.message}\n\n"
            f"Fetched data:\n{json.dumps(collected_tool_data, default=str)}"
        )
        try:
            if use_grok:
                chart_raw = await _chat_via_grok(settings, CHART_SYSTEM, [{"role": "user", "content": chart_prompt}], model=GROK_CHAT_MODEL)
            elif use_gemini:
                chart_raw = await _call_gemini(settings, CHART_SYSTEM, [{"role": "user", "content": chart_prompt}], max_tokens=600)
            else:
                async with httpx.AsyncClient(timeout=30) as client:
                    chart_resp = await client.post(
                        CLAUDE_API_URL,
                        json={"model": CLAUDE_MODEL, "max_tokens": 600, "system": CHART_SYSTEM, "messages": [{"role": "user", "content": chart_prompt}]},
                        headers=headers,
                    )
                    chart_raw = next((b["text"] for b in chart_resp.json().get("content", []) if b["type"] == "text"), "[]")
            arr_start = chart_raw.find("[")
            arr_end = chart_raw.rfind("]") + 1
            chart_list = json.loads(chart_raw[arr_start:arr_end])
            charts = [ChartSpec(**c) for c in chart_list if isinstance(c, dict)]
        except Exception:
            pass

    return AnalyzeResponse(
        mode="analysis",
        text=parsed.get("text", ""),
        key_insights=parsed.get("key_insights", []),
        charts=charts,
        proposed_habits=[ProposedHabit(**h) for h in parsed.get("proposed_habits", [])],
    )


# ── Daily insight ─────────────────────────────────────────────────────────────

class DailyInsightResponse(BaseModel):
    insight: str
    date: str


@router.get("/daily-insight", response_model=DailyInsightResponse)
async def daily_insight(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    provider = settings.ai_chat_provider
    if provider == "grok" and not settings.grok_api_key:
        provider = "claude"
    if provider == "gemini" and not settings.gemini_api_key:
        provider = "claude"
    if provider == "claude" and not settings.anthropic_api_key:
        return DailyInsightResponse(
            insight="Keep building your habits — every streak starts with a single day.",
            date=date.today().isoformat(),
        )

    today_str = date.today().isoformat()
    cache_key = f"cache:ai:insight:{current_user.id}:{today_str}"

    from app.core.redis import cache_get, cache_set
    cached = await cache_get(cache_key)
    if cached:
        return DailyInsightResponse(insight=cached, date=today_str)

    user_context = await _build_user_context(current_user, db)
    system_prompt = (
        "You are a brief, motivating AI habit coach. "
        "Generate a single personalized insight (2-3 sentences max) for the user based on their actual habit data. "
        "Reference specific habits or numbers. Be warm and encouraging. "
        "No greetings, no sign-offs — just the insight itself."
    )
    message = f"Today is {today_str}. Here is my habit data:\n\n{user_context}\n\nGive me my daily insight."

    try:
        if provider == "grok":
            insight = await _chat_via_grok(settings, system_prompt, [{"role": "user", "content": message}])
        elif provider == "gemini":
            insight = await _call_gemini(settings, system_prompt, [{"role": "user", "content": message}], max_tokens=200)
        else:
            insight = await _chat_via_claude(settings, system_prompt, [{"role": "user", "content": message}])
    except Exception:
        insight = "Stay consistent — small daily actions compound into remarkable results over time."

    await cache_set(cache_key, insight, ttl=86400)  # 24 hours
    return DailyInsightResponse(insight=insight, date=today_str)
