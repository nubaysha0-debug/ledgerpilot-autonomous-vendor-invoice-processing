"""Auth router: signup, login, logout, me, invite, accept-invite, team."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Cookie, Request, Response
from pydantic import BaseModel, EmailStr, Field

from .auth_service import (
    accept_invite,
    create_invite,
    google_auth,
    list_team,
    login,
    logout,
    resolve_session,
    signup,
)
from .config import get_settings
from .db import transaction
from .errors import LedgerError

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_COOKIE = "lp_sid"


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=settings.session_max_age,
        httponly=True,
        samesite="lax",
        secure=settings.app_env not in {"local", "test"},
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE, path="/")


# ── Request / response models ─────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class GoogleAuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    full_name: str | None = None
    picture: str | None = None
    credential: str | None = None


class InviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    ledger_role: str = Field(default="accountant")


class AcceptInviteRequest(BaseModel):
    token: str = Field(min_length=10)
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=128)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/signup", status_code=201)
def auth_signup(body: SignupRequest, response: Response) -> dict[str, Any]:
    with transaction() as conn:
        result = signup(conn, body.email, body.password, body.full_name)
    _set_session_cookie(response, result.pop("token"))
    return result


@router.post("/login")
def auth_login(body: LoginRequest, response: Response) -> dict[str, Any]:
    with transaction() as conn:
        result = login(conn, body.email, body.password)
    _set_session_cookie(response, result.pop("token"))
    return result


@router.post("/google")
def auth_google(body: GoogleAuthRequest, response: Response) -> dict[str, Any]:
    with transaction() as conn:
        result = google_auth(conn, body.email, body.full_name or body.email.split("@")[0].capitalize(), body.picture)
    _set_session_cookie(response, result.pop("token"))
    return result


@router.post("/logout")
def auth_logout(
    response: Response,
    lp_sid: str | None = Cookie(default=None),
) -> dict[str, Any]:
    if lp_sid:
        with transaction() as conn:
            logout(conn, lp_sid)
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def auth_me(lp_sid: str | None = Cookie(default=None)) -> dict[str, Any]:
    if not lp_sid:
        raise LedgerError(401, "NOT_AUTHENTICATED", "No active session.")
    with transaction() as conn:
        session = resolve_session(conn, lp_sid)
    if not session:
        raise LedgerError(401, "SESSION_EXPIRED", "Session expired or not found.")
    return {
        "email": session["email"],
        "full_name": session["full_name"],
        "ledger_role": session["ledger_role"],
        "workspace_id": str(session["workspace_id"]),
    }


@router.post("/invite", status_code=201)
def auth_invite(
    body: InviteRequest,
    lp_sid: str | None = Cookie(default=None),
) -> dict[str, Any]:
    if not lp_sid:
        raise LedgerError(401, "NOT_AUTHENTICATED", "Login required.")
    with transaction() as conn:
        session = resolve_session(conn, lp_sid)
        if not session:
            raise LedgerError(401, "SESSION_EXPIRED", "Session expired.")
        if session["ledger_role"] != "owner":
            raise LedgerError(403, "OWNER_ONLY", "Only the workspace owner can invite teammates.")
        result = create_invite(
            conn,
            workspace_id=session["workspace_id"],
            invited_by=session["account_id"],
            email=body.email,
            ledger_role=body.ledger_role,
        )
    return result


@router.post("/accept-invite", status_code=201)
def auth_accept_invite(body: AcceptInviteRequest, response: Response) -> dict[str, Any]:
    with transaction() as conn:
        result = accept_invite(conn, body.token, body.full_name, body.password)
    _set_session_cookie(response, result.pop("token"))
    return result


@router.get("/team")
def auth_team(lp_sid: str | None = Cookie(default=None)) -> dict[str, Any]:
    if not lp_sid:
        raise LedgerError(401, "NOT_AUTHENTICATED", "Login required.")
    with transaction() as conn:
        session = resolve_session(conn, lp_sid)
        if not session:
            raise LedgerError(401, "SESSION_EXPIRED", "Session expired.")
        return list_team(conn, session["workspace_id"])
