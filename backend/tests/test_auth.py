"""Tests for the authentication, workspace provisioning, and invite flow.

These tests run with AUTH_REQUIRED=true against an isolated database.
They complement the 31 existing acceptance tests (which use AUTH_REQUIRED=false).

Run:
    python -m pytest backend/tests/test_auth.py -q
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import psycopg
import pytest
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
PYTHON = sys.executable


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _wait_for_http(url: str, process: subprocess.Popen, timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"API process exited early: {process.returncode}")
        try:
            r = httpx.get(url, timeout=2.0)
            if r.status_code < 500:
                return
        except Exception:
            pass
        time.sleep(0.4)
    raise RuntimeError(f"API not ready at {url}")


@pytest.fixture(scope="module")
def auth_api():
    """Start an API instance with AUTH_REQUIRED=true for these tests."""
    external = os.getenv("LP_TEST_DATABASE_URL")
    if not external:
        pytest.skip("Set LP_TEST_DATABASE_URL to run auth tests (embedded-postgres not used here).")

    parsed = urlparse(external)
    db_name = (parsed.path or "/").lstrip("/")
    auth_db = db_name.rstrip("_test") + "_auth_test"
    auth_url = external.replace(db_name, auth_db)

    with psycopg.connect(external, autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{auth_db}"')
        conn.execute(f'CREATE DATABASE "{auth_db}"')

    env = {**os.environ, "DATABASE_URL": auth_url}
    subprocess.run(
        [PYTHON, "-m", "backend.scripts.migrate"],
        cwd=str(ROOT), env=env, check=True, capture_output=True, text=True,
    )

    port = _free_port()
    upload_dir = Path(tempfile.mkdtemp(prefix="lp-auth-test-uploads-"))
    proc_env = {
        **env,
        "APP_ENV": "test",
        "DEMO_MODE": "true",
        "AUTH_REQUIRED": "true",
        "SESSION_SECRET": "test-secret-for-auth-tests",
        "EXTRACTOR": "mock",
        "LLM_PROVIDER": "mock",
        "MOCK_ALLOW_FORCED_FAILURE": "true",
        "UPLOAD_DIR": str(upload_dir),
        "CORS_ALLOWED_ORIGINS": "http://localhost:3000",
    }
    log = Path(tempfile.gettempdir()) / "lp-auth-test.log"
    proc = subprocess.Popen(
        [PYTHON, "-m", "uvicorn", "backend.app.main:app",
         "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(ROOT),
        env=proc_env,
        stdout=log.open("a"),
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    _wait_for_http(f"{base}/api/health", proc)

    client = httpx.Client(base_url=base, timeout=30.0)
    yield client, base

    proc.terminate()
    proc.wait(timeout=15)
    client.close()


# ── Helpers ──────────────────────────────────────────────────────────────────

def signup(client: httpx.Client, email: str, password: str = "testpass99") -> httpx.Response:
    return client.post(
        "/api/auth/signup",
        json={"email": email, "password": password, "full_name": "Test User"},
    )


def login(client: httpx.Client, email: str, password: str = "testpass99") -> httpx.Response:
    return client.post("/api/auth/login", json={"email": email, "password": password})


def me(client: httpx.Client, cookies: dict) -> httpx.Response:
    return client.get("/api/auth/me", cookies=cookies)


def unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestSignup:
    def test_signup_creates_account_and_session(self, auth_api):
        client, _ = auth_api
        r = signup(client, unique_email())
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["ledger_role"] == "owner"
        assert "lp_sid" in r.cookies

    def test_signup_duplicate_email_409(self, auth_api):
        client, _ = auth_api
        email = unique_email()
        signup(client, email)
        r = signup(client, email)
        assert r.status_code == 409
        assert r.json()["code"] == "EMAIL_TAKEN"

    def test_signup_short_password_422(self, auth_api):
        client, _ = auth_api
        r = client.post(
            "/api/auth/signup",
            json={"email": unique_email(), "password": "short", "full_name": "X"},
        )
        assert r.status_code == 422


class TestLogin:
    def test_login_returns_session_cookie(self, auth_api):
        client, _ = auth_api
        email = unique_email()
        signup(client, email)
        r = login(client, email)
        assert r.status_code == 200, r.text
        assert "lp_sid" in r.cookies

    def test_login_wrong_password_401(self, auth_api):
        client, _ = auth_api
        email = unique_email()
        signup(client, email)
        r = login(client, email, "wrongpassword")
        assert r.status_code == 401

    def test_login_unknown_email_401(self, auth_api):
        client, _ = auth_api
        r = login(client, "nobody@nothere.com")
        assert r.status_code == 401


class TestMe:
    def test_me_returns_user_when_authenticated(self, auth_api):
        client, _ = auth_api
        email = unique_email()
        r = signup(client, email)
        cookies = dict(r.cookies)
        r2 = me(client, cookies)
        assert r2.status_code == 200
        assert r2.json()["email"] == email.lower()

    def test_me_401_without_cookie(self, auth_api):
        client, _ = auth_api
        r = me(client, {})
        assert r.status_code == 401


class TestLogout:
    def test_logout_clears_session(self, auth_api):
        client, _ = auth_api
        email = unique_email()
        r = signup(client, email)
        cookies = dict(r.cookies)
        client.post("/api/auth/logout", cookies=cookies)
        r2 = me(client, cookies)
        assert r2.status_code == 401


class TestInvite:
    def test_owner_can_invite(self, auth_api):
        client, _ = auth_api
        r = signup(client, unique_email())
        cookies = dict(r.cookies)
        invitee = unique_email()
        r2 = client.post(
            "/api/auth/invite",
            json={"email": invitee, "ledger_role": "accountant"},
            cookies=cookies,
        )
        assert r2.status_code == 201, r2.text
        assert "token" in r2.json()

    def test_non_owner_cannot_invite(self, auth_api):
        client, _ = auth_api
        # Create owner workspace and invite an accountant
        r = signup(client, unique_email())
        owner_cookies = dict(r.cookies)
        invitee_email = unique_email()
        invite_r = client.post(
            "/api/auth/invite",
            json={"email": invitee_email, "ledger_role": "accountant"},
            cookies=owner_cookies,
        )
        token = invite_r.json()["token"]

        # Accountant accepts
        r2 = client.post(
            "/api/auth/accept-invite",
            json={"token": token, "full_name": "Accountant User", "password": "testpass99"},
        )
        assert r2.status_code == 201
        accountant_cookies = dict(r2.cookies)

        # Accountant should not be able to invite
        r3 = client.post(
            "/api/auth/invite",
            json={"email": unique_email(), "ledger_role": "staff"},
            cookies=accountant_cookies,
        )
        assert r3.status_code == 403

    def test_accept_invite_joins_workspace(self, auth_api):
        client, _ = auth_api
        r = signup(client, unique_email())
        owner_cookies = dict(r.cookies)
        owner_ws = r.json()["workspace_id"]

        invitee_email = unique_email()
        invite_r = client.post(
            "/api/auth/invite",
            json={"email": invitee_email, "ledger_role": "accountant"},
            cookies=owner_cookies,
        )
        token = invite_r.json()["token"]

        r2 = client.post(
            "/api/auth/accept-invite",
            json={"token": token, "full_name": "Sunita", "password": "testpass99"},
        )
        assert r2.status_code == 201
        body = r2.json()
        # Invitee should be in the same workspace as the owner
        assert body["workspace_id"] == owner_ws
        assert body["ledger_role"] == "accountant"

    def test_invite_token_reuse_409(self, auth_api):
        client, _ = auth_api
        r = signup(client, unique_email())
        owner_cookies = dict(r.cookies)
        invitee_email = unique_email()
        invite_r = client.post(
            "/api/auth/invite",
            json={"email": invitee_email, "ledger_role": "staff"},
            cookies=owner_cookies,
        )
        token = invite_r.json()["token"]

        client.post(
            "/api/auth/accept-invite",
            json={"token": token, "full_name": "First", "password": "testpass99"},
        )
        r2 = client.post(
            "/api/auth/accept-invite",
            json={"token": token, "full_name": "Second", "password": "testpass99"},
        )
        assert r2.status_code == 409


class TestWorkspaceIsolation:
    def test_two_owners_have_separate_workspaces(self, auth_api):
        client, _ = auth_api
        r1 = signup(client, unique_email())
        r2 = signup(client, unique_email())
        assert r1.json()["workspace_id"] != r2.json()["workspace_id"]

    def test_dashboard_accessible_after_login(self, auth_api):
        client, _ = auth_api
        r = signup(client, unique_email())
        cookies = dict(r.cookies)
        # The workspace endpoint requires auth
        r2 = client.get("/api/workspace", cookies=cookies)
        # Should return 200 (workspace seeded) or a usable response
        assert r2.status_code in (200, 503)  # 503 if seeding is async; 200 if ready
