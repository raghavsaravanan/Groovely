"""
db.py — Groovely backend persistence layer.

Replaces the fragile JSON file storage (routines.json / tries.json) with
Supabase database rows that survive server restarts and deploys.

Falls back to an in-memory dict when Supabase is unavailable (local dev
without credentials), so local development still works without a database.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Supabase client (shared with main.py — set via init())
# ---------------------------------------------------------------------------
_supabase_client = None
_client_lock = threading.Lock()


def init(client) -> None:
    """Inject the already-initialised Supabase client from main.py."""
    global _supabase_client
    with _client_lock:
        _supabase_client = client


def _client():
    with _client_lock:
        return _supabase_client


# ---------------------------------------------------------------------------
# In-memory fallback (used when Supabase is not configured)
# ---------------------------------------------------------------------------
_mem_routines: Dict[str, Dict] = {}
_mem_tries: Dict[str, Dict] = {}
_mem_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Routines
# ---------------------------------------------------------------------------

def get_routine(routine_id: str) -> Optional[Dict[str, Any]]:
    """Return routine dict or None if not found."""
    sb = _client()
    if sb:
        try:
            res = sb.table("backend_routines").select("*").eq("routine_id", routine_id).maybe_single().execute()
            if res and res.data:
                return dict(res.data)
        except Exception as exc:
            logger.warning(f"[db] get_routine Supabase error (falling back to memory): {exc}")

    # Fallback
    with _mem_lock:
        return dict(_mem_routines[routine_id]) if routine_id in _mem_routines else None


def upsert_routine(routine_id: str, data: Dict[str, Any]) -> None:
    """Insert or update a routine row."""
    row = {
        "routine_id": routine_id,
        "title": data.get("title", "Untitled Routine"),
        "video_supabase_url": data.get("video_supabase_url"),
        "audio_supabase_url": data.get("audio_supabase_url"),
        "processing": data.get("processing", False),
        "status": data.get("status", "completed"),
        "error": data.get("error"),
    }

    sb = _client()
    if sb:
        try:
            sb.table("backend_routines").upsert(row, on_conflict="routine_id").execute()
            logger.debug(f"[db] upsert_routine OK: {routine_id}")
            return
        except Exception as exc:
            logger.warning(f"[db] upsert_routine Supabase error (falling back to memory): {exc}")

    # Fallback
    with _mem_lock:
        existing = _mem_routines.get(routine_id, {})
        existing.update(row)
        existing.setdefault("created_at", _now_iso())
        _mem_routines[routine_id] = existing


def list_routines() -> Dict[str, Dict]:
    """Return all routines as {routine_id: row}. Used by legacy fallback paths."""
    sb = _client()
    if sb:
        try:
            res = sb.table("backend_routines").select("*").execute()
            if res and res.data:
                return {r["routine_id"]: dict(r) for r in res.data}
        except Exception as exc:
            logger.warning(f"[db] list_routines Supabase error: {exc}")

    with _mem_lock:
        return {k: dict(v) for k, v in _mem_routines.items()}


# ---------------------------------------------------------------------------
# Tries
# ---------------------------------------------------------------------------

def get_try(try_id: str) -> Optional[Dict[str, Any]]:
    """Return try dict or None if not found."""
    sb = _client()
    if sb:
        try:
            res = sb.table("backend_tries").select("*").eq("try_id", try_id).maybe_single().execute()
            if res and res.data:
                return dict(res.data)
        except Exception as exc:
            logger.warning(f"[db] get_try Supabase error (falling back to memory): {exc}")

    with _mem_lock:
        return dict(_mem_tries[try_id]) if try_id in _mem_tries else None


def upsert_try(try_id: str, data: Dict[str, Any]) -> None:
    """Insert or update a try row."""
    row = {
        "try_id": try_id,
        "routine_id": data.get("routine_id", ""),
        "score": data.get("score"),
        "user_video_supabase_url": data.get("user_video_supabase_url"),
        "comparison_supabase_url": data.get("comparison_supabase_url"),
        "critique_json_supabase_url": data.get("critique_json_supabase_url"),
        "critique_md_supabase_url": data.get("critique_md_supabase_url"),
        "processing": data.get("processing", False),
        "error": data.get("error"),
    }

    sb = _client()
    if sb:
        try:
            sb.table("backend_tries").upsert(row, on_conflict="try_id").execute()
            logger.debug(f"[db] upsert_try OK: {try_id}")
            return
        except Exception as exc:
            logger.warning(f"[db] upsert_try Supabase error (falling back to memory): {exc}")

    # Fallback
    with _mem_lock:
        existing = _mem_tries.get(try_id, {})
        existing.update(row)
        existing.setdefault("created_at", _now_iso())
        _mem_tries[try_id] = existing
