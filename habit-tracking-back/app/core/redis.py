import json
from typing import Any

import redis.asyncio as aioredis

from app.config import get_settings

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis | None:
    global _redis
    settings = get_settings()
    if not settings.redis_url:
        return None
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None


async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    if r is None:
        return None
    try:
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl: int = 300) -> None:
    r = await get_redis()
    if r is None:
        return
    try:
        await r.setex(key, ttl, json.dumps(value))
    except Exception:
        pass


async def cache_delete(*keys: str) -> None:
    r = await get_redis()
    if r is None:
        return
    try:
        await r.delete(*keys)
    except Exception:
        pass
