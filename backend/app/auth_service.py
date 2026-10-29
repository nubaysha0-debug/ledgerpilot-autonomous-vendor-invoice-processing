"""Authentication, workspace provisioning, and invite logic."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg

from .config import get_settings
from .db import connect, transaction
from .errors import LedgerError
from .util import stable_uuid

BACKEND_DIR = Path(__file__).resolve().parents[1]
PYTHON = sys.executable
MIGRATIONS_DIR = BACKEND_DIR / "migrations"

# ── Password hashing (scrypt via hashlib) ────────────────────────────────────
# Parameters tuned for ~100 ms on a modern laptop — fast enough for a demo.
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DK_LEN = 32


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.scrypt(
        password.encode(),
        salt=salt.encode(),
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DK_LEN,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt}${dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        _, n_str, r_str, p_str, salt, dk_hex = stored.split("$")
        n, r, p = int(n_str), int(r_str), int(p_str)
        dk = hashlib.scrypt(
            password.encode(),
            salt=salt.encode(),
            n=n,
            r=r,
            p=p,
            dklen=_SCRYPT_DK_LEN,
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# ── Session tokens ────────────────────────────────────────────────────────────

def _new_token() -> str:
    return secrets.token_urlsafe(32)


# ── Workspace schema provisioning ─────────────────────────────────────────────

def _schema_for(workspace_id: uuid.UUID) -> str:
    return f"ws_{workspace_id.hex}"


def _provision_workspace_schema(conn: psycopg.Connection, workspace_id: uuid.UUID) -> None:
    """Create a new Postgres schema and apply all per-workspace migrations."""
    schema = _schema_for(workspace_id)
    conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
    conn.execute(f'SET search_path TO "{schema}", public')

    # Apply the first 6 migrations inside the new schema.
    for i in range(1, 7):
        migration = sorted(MIGRATIONS_DIR.glob(f"00{i}_*.sql"))
        if not migration:
            continue
        sql = migration[0].read_text(encoding="utf-8")
        conn.execute(sql)

    conn.execute("SET search_path TO public")


def _seed_workspace(conn: psycopg.Connection, workspace_id: uuid.UUID) -> None:
    """Seed demo data into the workspace schema."""
    from .seed import seed_demo  # local import to avoid circular dep
    schema = _schema_for(workspace_id)
    conn.execute(f'SET search_path TO "{schema}", public')
    seed_demo(conn)
    conn.execute("SET search_path TO public")


# ── Auth service API ──────────────────────────────────────────────────────────

def signup(conn: psycopg.Connection, email: str, password: str, full_name: str) -> dict[str, Any]:
    """Create a new account + workspace, return session token."""
    email = email.strip().lower()
    if len(password) < 8:
        raise LedgerError(422, "PASSWORD_TOO_SHORT", "Password must be at least 8 characters.")

    existing = conn.execute(
        "SELECT id FROM accounts WHERE lower(email) = %s", (email,)
    ).fetchone()
    if existing:
        raise LedgerError(409, "EMAIL_TAKEN", "An account with that email already exists.")

    account_id = uuid.uuid4()
    pw_hash = _hash_password(password)
    conn.execute(
        "INSERT INTO accounts (id, email, password_hash, full_name) VALUES (%s, %s, %s, %s)",
        (account_id, email, pw_hash, full_name.strip()),
    )

    # Create workspace + schema
    workspace_id = uuid.uuid4()
    schema_name = _schema_for(workspace_id)
    conn.execute(
        "INSERT INTO workspaces (id, schema_name, owner_id) VALUES (%s, %s, %s)",
        (workspace_id, schema_name, account_id),
    )
    conn.execute(
        "INSERT INTO workspace_members (workspace_id, account_id, ledger_role) "
        "VALUES (%s, %s, 'owner')",
        (workspace_id, account_id),
    )

    # Provision the schema with migrations + demo seed
    _provision_workspace_schema(conn, workspace_id)
    _seed_workspace(conn, workspace_id)

    token = _create_session(conn, account_id, workspace_id)

    return {
        "account_id": str(account_id),
        "workspace_id": str(workspace_id),
        "email": email,
        "full_name": full_name.strip(),
        "ledger_role": "owner",
        "token": token,
    }


def login(conn: psycopg.Connection, email: str, password: str) -> dict[str, Any]:
    """Verify credentials and return a new session token."""
    email = email.strip().lower()
    row = conn.execute(
        "SELECT a.id, a.full_name, a.password_hash, wm.workspace_id, wm.ledger_role "
        "FROM accounts a "
        "JOIN workspace_members wm ON wm.account_id = a.id "
        "WHERE lower(a.email) = %s "
        "ORDER BY wm.joined_at "
        "LIMIT 1",
        (email,),
    ).fetchone()

    if not row or not row["password_hash"]:
        raise LedgerError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    if not _verify_password(password, row["password_hash"]):
        raise LedgerError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")

    token = _create_session(conn, row["id"], row["workspace_id"])
    return {
        "account_id": str(row["id"]),
        "workspace_id": str(row["workspace_id"]),
        "email": email,
        "full_name": row["full_name"],
        "ledger_role": row["ledger_role"],
        "token": token,
    }


def _create_session(
    conn: psycopg.Connection,
    account_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> str:
    settings = get_settings()
    token = _new_token()
    expires = datetime.now(tz=timezone.utc) + timedelta(seconds=settings.session_max_age)
    conn.execute(
        "INSERT INTO sessions (token, account_id, workspace_id, expires_at) "
        "VALUES (%s, %s, %s, %s)",
        (token, account_id, workspace_id, expires),
    )
    return token


def resolve_session(conn: psycopg.Connection, token: str | None) -> dict[str, Any] | None:
    """Return session info dict or None if token is absent/expired."""
    if not token:
        return None
    row = conn.execute(
        "SELECT s.account_id, s.workspace_id, a.full_name, a.email, wm.ledger_role "
        "FROM sessions s "
        "JOIN accounts a ON a.id = s.account_id "
        "JOIN workspace_members wm ON wm.account_id = s.account_id "
        "  AND wm.workspace_id = s.workspace_id "
        "WHERE s.token = %s AND s.expires_at > now()",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def logout(conn: psycopg.Connection, token: str) -> None:
    conn.execute("DELETE FROM sessions WHERE token = %s", (token,))


def google_auth(
    conn: psycopg.Connection,
    email: str,
    full_name: str,
    picture: str | None = None,
) -> dict[str, Any]:
    """Authenticate or register a user via Google OAuth/profile."""
    email = email.strip().lower()
    full_name = full_name.strip() or email.split("@")[0].capitalize()

    existing = conn.execute(
        "SELECT a.id, a.full_name, wm.workspace_id, wm.ledger_role "
        "FROM accounts a "
        "LEFT JOIN workspace_members wm ON wm.account_id = a.id "
        "WHERE lower(a.email) = %s "
        "ORDER BY wm.joined_at "
        "LIMIT 1",
        (email,),
    ).fetchone()

    if existing and existing["workspace_id"]:
        token = _create_session(conn, existing["id"], existing["workspace_id"])
        return {
            "account_id": str(existing["id"]),
            "workspace_id": str(existing["workspace_id"]),
            "email": email,
            "full_name": existing["full_name"],
            "ledger_role": existing["ledger_role"],
            "token": token,
        }

    account_id = existing["id"] if existing else uuid.uuid4()
    if not existing:
        conn.execute(
            "INSERT INTO accounts (id, email, password_hash, full_name) VALUES (%s, %s, NULL, %s)",
            (account_id, email, full_name),
        )

    workspace_id = uuid.uuid4()
    schema_name = _schema_for(workspace_id)
    conn.execute(
        "INSERT INTO workspaces (id, schema_name, owner_id) VALUES (%s, %s, %s)",
        (workspace_id, schema_name, account_id),
    )
    conn.execute(
        "INSERT INTO workspace_members (workspace_id, account_id, ledger_role) "
        "VALUES (%s, %s, 'owner')",
        (workspace_id, account_id),
    )

    _provision_workspace_schema(conn, workspace_id)
    _seed_workspace(conn, workspace_id)

    token = _create_session(conn, account_id, workspace_id)
    return {
        "account_id": str(account_id),
        "workspace_id": str(workspace_id),
        "email": email,
        "full_name": full_name,
        "ledger_role": "owner",
        "token": token,
    }


def create_invite(
    conn: psycopg.Connection,
    workspace_id: uuid.UUID,
    invited_by: uuid.UUID,
    email: str,
    ledger_role: str,
) -> dict[str, Any]:
    email = email.strip().lower()
    if ledger_role not in {"accountant", "staff"}:
        raise LedgerError(422, "INVALID_ROLE", "Role must be 'accountant' or 'staff'.")

    # Check if this person is already a member
    existing = conn.execute(
        "SELECT wm.id FROM workspace_members wm "
        "JOIN accounts a ON a.id = wm.account_id "
        "WHERE wm.workspace_id = %s AND lower(a.email) = %s",
        (workspace_id, email),
    ).fetchone()
    if existing:
        raise LedgerError(409, "ALREADY_MEMBER", "That person is already in your workspace.")

    row = conn.execute(
        "INSERT INTO invites (workspace_id, invited_by, email, ledger_role, token) "
        "VALUES (%s, %s, %s, %s, %s) "
        "RETURNING id, token, expires_at",
        (workspace_id, invited_by, email, ledger_role, secrets.token_hex(24)),
    ).fetchone()
    return {
        "invite_id": str(row["id"]),
        "token": row["token"],
        "email": email,
        "ledger_role": ledger_role,
        "expires_at": row["expires_at"].isoformat(),
        # In production you'd email this URL; for the demo we return it directly
        "invite_url": f"/invite/{row['token']}",
    }


def accept_invite(
    conn: psycopg.Connection,
    token: str,
    full_name: str,
    password: str,
) -> dict[str, Any]:
    """Accept an invite: create account (or link existing), join workspace."""
    if len(password) < 8:
        raise LedgerError(422, "PASSWORD_TOO_SHORT", "Password must be at least 8 characters.")

    invite = conn.execute(
        "SELECT id, workspace_id, email, ledger_role, accepted, expires_at "
        "FROM invites WHERE token = %s",
        (token,),
    ).fetchone()
    if not invite:
        raise LedgerError(404, "INVITE_NOT_FOUND", "This invite link is invalid.")
    if invite["accepted"]:
        raise LedgerError(409, "INVITE_USED", "This invite has already been accepted.")
    if invite["expires_at"] < datetime.now(tz=timezone.utc):
        raise LedgerError(410, "INVITE_EXPIRED", "This invite link has expired.")

    email = invite["email"]
    workspace_id = invite["workspace_id"]
    ledger_role = invite["ledger_role"]

    # Find or create account
    existing_account = conn.execute(
        "SELECT id FROM accounts WHERE lower(email) = %s", (email,)
    ).fetchone()

    if existing_account:
        account_id = existing_account["id"]
    else:
        account_id = uuid.uuid4()
        pw_hash = _hash_password(password)
        conn.execute(
            "INSERT INTO accounts (id, email, password_hash, full_name) VALUES (%s, %s, %s, %s)",
            (account_id, email, pw_hash, full_name.strip()),
        )

    # Add to workspace
    conn.execute(
        "INSERT INTO workspace_members (workspace_id, account_id, ledger_role) "
        "VALUES (%s, %s, %s) ON CONFLICT (workspace_id, account_id) DO NOTHING",
        (workspace_id, account_id, ledger_role),
    )

    # Mark invite as accepted
    conn.execute("UPDATE invites SET accepted = true WHERE token = %s", (token,))

    # Also add user to the workspace's app_users table so the existing
    # ledger code can find them by role
    schema = _schema_for(workspace_id)
    conn.execute(f'SET search_path TO "{schema}", public')
    app_user_id = uuid.uuid4()
    initials = "".join(w[0].upper() for w in full_name.strip().split()[:2])
    conn.execute(
        "INSERT INTO app_users (id, display_name, role, email, initials) "
        "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
        (app_user_id, full_name.strip(), ledger_role, email, initials),
    )
    conn.execute("SET search_path TO public")

    session_token = _create_session(conn, account_id, workspace_id)

    return {
        "account_id": str(account_id),
        "workspace_id": str(workspace_id),
        "email": email,
        "full_name": full_name.strip(),
        "ledger_role": ledger_role,
        "token": session_token,
    }


def list_team(conn: psycopg.Connection, workspace_id: uuid.UUID) -> list[dict[str, Any]]:
    """Return all members and pending invites for a workspace."""
    members = conn.execute(
        "SELECT a.email, a.full_name, wm.ledger_role, wm.joined_at "
        "FROM workspace_members wm "
        "JOIN accounts a ON a.id = wm.account_id "
        "WHERE wm.workspace_id = %s "
        "ORDER BY wm.joined_at",
        (workspace_id,),
    ).fetchall()

    pending = conn.execute(
        "SELECT email, ledger_role, invite_url, expires_at, token "
        "FROM invites WHERE workspace_id = %s AND NOT accepted AND expires_at > now() "
        "ORDER BY created_at",
        (workspace_id,),
    ).fetchall()

    return {
        "members": [dict(m) for m in members],
        "pending_invites": [
            {
                **dict(p),
                "invite_url": f"/invite/{p['token']}",
            }
            for p in pending
        ],
    }
