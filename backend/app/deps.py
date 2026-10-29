"""Shared route helpers.

When AUTH_REQUIRED is true the ``workspace_from_request`` dependency reads the
session cookie and injects the workspace_id so ``transaction()`` scopes every
query to the right schema.  The legacy ``X-Actor-Id`` header is honoured only
when AUTH_REQUIRED is false (local dev / acceptance tests).
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Cookie, Header, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from .auth_service import resolve_session
from .config import get_settings
from .db import transaction
from .errors import LedgerError, envelope
from .schemas import actor_from_conn, require_role

SESSION_COOKIE = "lp_sid"


# ── Workspace resolution ─────────────────────────────────────────────────────

def get_workspace(
    request: Request,
    lp_sid: str | None = Cookie(default=None),
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any] | None:
    """Return session dict {workspace_id, ledger_role, ...} or None.

    When AUTH_REQUIRED=false this is a no-op (returns None) and downstream
    code falls back to the old X-Actor-Id header path.
    """
    settings = get_settings()
    if not settings.auth_required:
        return None

    if not lp_sid:
        raise LedgerError(401, "NOT_AUTHENTICATED", "Login required. No session cookie found.")

    # We need a public-schema connection just to resolve the session.
    with transaction() as conn:
        session = resolve_session(conn, lp_sid)

    if not session:
        raise LedgerError(401, "SESSION_EXPIRED", "Your session has expired. Please log in again.")

    return session


# ── Legacy actor helper (used by all existing routers) ───────────────────────

def actor(conn, x_actor_id: str | None, session: dict[str, Any] | None = None) -> dict[str, Any]:
    """Resolve the acting app_users row.

    When a valid session is present the session's ledger_role is used to look
    up the correct app_users row within the workspace schema, closing the
    X-Actor-Id impersonation hole.  Falls back to X-Actor-Id when auth is off.
    """
    settings = get_settings()

    if settings.auth_required and session:
        # Find the app_users row matching the session's ledger_role.
        row = conn.execute(
            "SELECT id, display_name, role FROM app_users WHERE role = %s LIMIT 1",
            (session["ledger_role"],),
        ).fetchone()
        if not row:
            raise LedgerError(
                401,
                "ACTOR_NOT_FOUND",
                f"No app_users row with role '{session['ledger_role']}' found in this workspace.",
            )
        return row

    # AUTH_REQUIRED=false — keep the old behaviour so tests don't break.
    return actor_from_conn(conn, x_actor_id)


def owner(actor_row: dict[str, Any]) -> None:
    require_role(actor_row, {"owner"})


def service_response(status_code: int, payload: Any) -> JSONResponse:
    """Turn a (status, payload) service result into an HTTP response.

    Services return an error-shaped dict for expected conflicts so their audit
    rows are committed.  Those are rendered in the normal error envelope.
    """
    if status_code < 400:
        return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))
    code = payload.get("code", "REQUEST_FAILED") if isinstance(payload, dict) else "REQUEST_FAILED"
    message = (
        payload.get("message", "The request could not be completed.")
        if isinstance(payload, dict)
        else str(payload)
    )
    details = payload.get("details", {}) if isinstance(payload, dict) else {}
    return JSONResponse(
        status_code=status_code,
        content=envelope(code, message, details),
    )
