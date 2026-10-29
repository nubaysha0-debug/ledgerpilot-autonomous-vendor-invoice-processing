"""Acceptance-test harness for LedgerPilot (T01-T31).

The suite is self-contained: it starts a throw-away PostgreSQL cluster with the
``embedded-postgres`` package (or uses ``LP_TEST_DATABASE_URL``), applies the
real migrations, and runs the real FastAPI app in a subprocess on a free port.

Run from the repository root:
    python -m pytest backend/tests -q

Docker users may instead pass a disposable database whose name ends in
``_test``:
    LP_TEST_DATABASE_URL=postgresql://ledger:ledger_demo_only@127.0.0.1:5432/ledgerpilot_test \
      python -m pytest backend/tests -q
"""

from __future__ import annotations

import os
import shutil
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

PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000000020001e221bc330000000049454e44ae426082"
)
PDF_BYTES = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
SVG_BYTES = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_http(url: str, process: subprocess.Popen, timeout: float = 60.0) -> None:
    deadline = time.time() + timeout
    last_error = ""
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"API process exited with {process.returncode} before becoming ready")
        try:
            response = httpx.get(url, timeout=2.0)
            if response.status_code < 500:
                return
            last_error = f"HTTP {response.status_code}"
        except Exception as exc:  # noqa: BLE001 - poll until timeout
            last_error = f"{type(exc).__name__}: {exc}"
        time.sleep(0.4)
    raise RuntimeError(f"API did not become ready at {url}: {last_error}")


class API:
    """Small typed-ish helper around the real HTTP API."""

    def __init__(self, base_url: str, database_url: str, pg_ctl_handle=None) -> None:
        self.base_url = base_url.rstrip("/")
        self.database_url = database_url
        self.pg_ctl_handle = pg_ctl_handle
        self.client = httpx.Client(base_url=self.base_url, timeout=60.0)
        self.process: subprocess.Popen | None = None
        self.port = int(urlparse(self.base_url).port or 0)
        self.log_path = Path(tempfile.gettempdir()) / "ledgerpilot-test-api.log"
        self._users: list[dict[str, Any]] | None = None
        self._env: dict[str, str] = {}

    # -- process control -------------------------------------------------
    def _start(self) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.log = self.log_path.open("a", encoding="utf-8")
        self.log.write(f"\n\n===== API start {time.strftime('%Y-%m-%d %H:%M:%S')} =====\n")
        self.log.flush()
        self.process = subprocess.Popen(
            [
                PYTHON,
                "-m",
                "uvicorn",
                "backend.app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(self.port),
            ],
            cwd=str(ROOT),
            env=self._env,
            stdout=self.log,
            stderr=subprocess.STDOUT,
        )
        _wait_for_http(f"{self.base_url}/api/health", self.process)

    def start(self, env_overrides: dict[str, str] | None = None) -> None:
        upload_dir = Path(tempfile.mkdtemp(prefix="ledgerpilot-uploads-"))
        self._env = {
            **os.environ,
            "DATABASE_URL": self.database_url,
            "APP_ENV": "test",
            "DEMO_MODE": "true",
            "EXTRACTOR": "mock",
            "LLM_PROVIDER": "mock",
            "MOCK_ALLOW_FORCED_FAILURE": "true",
            "UPLOAD_DIR": str(upload_dir),
            "CORS_ALLOWED_ORIGINS": "http://localhost:3000,http://127.0.0.1:3000",
            # Keep AUTH_REQUIRED=false so all 31 acceptance tests continue to
            # use the legacy X-Actor-Id header path without modification.
            "AUTH_REQUIRED": "false",
        }
        self._env.update(env_overrides or {})
        self._start()

    def stop(self) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=10)
        self.process = None
        log = getattr(self, "log", None)
        if log and not log.closed:
            log.close()

    def restart(self, database: bool = False) -> None:
        self.stop()
        if database:
            if not self.pg_ctl_handle:
                raise RuntimeError("Database restart is only available for the embedded test cluster")
            self.pg_ctl_handle("stop")
            self.pg_ctl_handle("start")
        self._start()

    # -- basic HTTP ------------------------------------------------------
    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        return self.client.request(method, path, **kwargs)

    def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", path, **kwargs)

    def reset(self) -> dict[str, Any]:
        response = self.request("POST", "/api/demo/reset")
        assert response.status_code == 200, response.text
        self._users = None
        return response.json()

    def users(self) -> list[dict[str, Any]]:
        if self._users is None:
            response = self.get("/api/users")
            assert response.status_code == 200, response.text
            self._users = response.json()["items"]
        return self._users

    def user_id(self, role: str) -> str:
        for user in self.users():
            if user["role"] == role:
                return user["id"]
        raise AssertionError(f"No user with role {role}")

    def h(self, role: str = "owner", **extra: str) -> dict[str, str]:
        return {"X-Actor-Id": self.user_id(role), **extra}

    def data(self, method: str, path: str, expected: int | tuple[int, ...] = 200, **kwargs: Any):
        response = self.request(method, path, **kwargs)
        expected_codes = (expected,) if isinstance(expected, int) else expected
        assert response.status_code in expected_codes, f"{method} {path} -> {response.status_code}: {response.text}"
        return response.json() if response.content else None

    # -- domain helpers --------------------------------------------------
    def vendor(self, name: str = "ABC Electricals Pvt Ltd") -> dict[str, Any]:
        items = self.data("GET", "/api/vendors?limit=200")["items"]
        for vendor in items:
            if vendor["name"] == name:
                return vendor
        raise AssertionError(f"Vendor {name!r} not found")

    def invoice(self, invoice_id: str) -> dict[str, Any]:
        return self.data("GET", f"/api/invoices/{invoice_id}")

    def invoices(self, query: str = "", limit: int = 200) -> list[dict[str, Any]]:
        suffix = f"&q={query}" if query else ""
        return self.data("GET", f"/api/invoices?limit={limit}{suffix}")["items"]

    def create_invoice(
        self,
        *,
        vendor_id: str,
        number: str,
        total: str,
        subtotal: str | None = None,
        tax_total: str = "0.00",
        stated_total: str | None = None,
        invoice_date: str = "2026-10-20",
        due_date: str = "2026-11-04",
        actor: str = "accountant",
        mark_reviewed: bool = True,
        **extra: Any,
    ) -> dict[str, Any]:
        body = {
            "vendor_id": vendor_id,
            "invoice_number": number,
            "invoice_date": invoice_date,
            "received_date": invoice_date,
            "due_date": due_date,
            "gst_rate": "0.00",
            "subtotal": subtotal if subtotal is not None else total,
            "cgst": "0.00",
            "sgst": "0.00",
            "igst": "0.00",
            "tax_total": tax_total,
            "round_off": "0.00",
            "total": total,
            "stated_total": stated_total if stated_total is not None else total,
            "mark_reviewed": mark_reviewed,
            **extra,
        }
        return self.data("POST", "/api/invoices", expected=201, headers=self.h(actor), json=body)

    def upload(
        self,
        *,
        filename: str = "bill.png",
        content: bytes = PNG_BYTES,
        content_type: str = "image/png",
        vendor_id: str | None = None,
        extractor: str | None = None,
        actor: str = "accountant",
    ) -> httpx.Response:
        data = {}
        if vendor_id:
            data["vendor_id"] = vendor_id
        if extractor:
            data["extractor"] = extractor
        return self.request(
            "POST",
            "/api/invoices/upload",
            headers=self.h(actor),
            files={"file": (filename, content, content_type)},
            data=data,
        )

    def draft_payment(
        self,
        invoice_id: str,
        amount: str,
        *,
        key: str | None = None,
        actor: str = "accountant",
        simulate: str | None = None,
    ) -> tuple[dict[str, Any], str]:
        key = key or str(uuid.uuid4())
        response = self.request(
            "POST",
            f"/api/invoices/{invoice_id}/payments",
            headers=self.h(actor, **{"Idempotency-Key": key}),
            json={
                "amount": amount,
                "payment_date": "2026-10-27",
                "mode": "NEFT",
            },
        )
        assert response.status_code in (200, 201), response.text
        return response.json(), key

    def start_run(self, payment_id: str, actor: str = "accountant") -> dict[str, Any]:
        return self.data(
            "POST", "/api/runs", expected=201, headers=self.h(actor), json={"payment_id": payment_id}
        )

    def pending_approval(self, payment_id: str) -> dict[str, Any]:
        items = self.data("GET", "/api/approvals?status=pending")["items"]
        for approval in items:
            if approval["payment_id"] == payment_id:
                return approval
        raise AssertionError(f"No pending approval for payment {payment_id}")

    def approve(self, payment_id: str, actor: str = "owner", reason: str | None = None) -> dict[str, Any]:
        approval = self.pending_approval(payment_id)
        return self.data(
            "POST",
            f"/api/approvals/{approval['id']}/decision",
            headers=self.h(actor),
            json={"decision": "approve", "fingerprint": approval["fingerprint"], "reason": reason},
        )

    def execute(
        self,
        payment_id: str,
        key: str,
        *,
        actor: str = "owner",
        simulate: str | None = None,
        demo_fault: str | None = None,
    ) -> httpx.Response:
        headers = self.h(actor, **{"Idempotency-Key": key})
        if demo_fault:
            headers["X-Demo-Fault"] = demo_fault
        body = {"simulate": simulate} if simulate else None
        return self.request(
            "POST", f"/api/payments/{payment_id}/execute", headers=headers, json=body
        )

    def paid_setup(
        self,
        *,
        number: str,
        total: str,
        amount: str | None = None,
        vendor_id: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any], str]:
        """Create an invoice, take a payment through run + owner approval."""
        vendor = self.vendor() if vendor_id is None else {"id": vendor_id}
        invoice = self.create_invoice(vendor_id=vendor["id"], number=number, total=total)
        payment, key = self.draft_payment(invoice["id"], amount or total)
        self.start_run(payment["id"])
        self.approve(payment["id"])
        return invoice, payment, key

    def audit_rows(self, entity_id: str, limit: int = 200) -> list[dict[str, Any]]:
        return self.data("GET", f"/api/audit?entity_id={entity_id}&limit={limit}")["items"]


@pytest.fixture(scope="session")
def api() -> API:
    embedded = None
    pgdata: Path | None = None
    temp_root = Path(tempfile.mkdtemp(prefix="ledgerpilot-tests-"))

    external = os.getenv("LP_TEST_DATABASE_URL")
    if external:
        parsed = urlparse(external)
        database = (parsed.path or "/").lstrip("/")
        if not database.endswith("_test"):
            raise pytest.UsageError(
                "LP_TEST_DATABASE_URL must point at a disposable database whose name ends with _test"
            )
        with psycopg.connect(external, autocommit=True) as conn:
            conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
            conn.execute("CREATE SCHEMA public")
        database_url = external
        pg_ctl_handle = None
    else:
        from embedded_postgres import get_server, pg_ctl
        from embedded_postgres._commands import POSTGRES_BIN_PATH  # noqa: F401  (documented dependency)

        pgdata = temp_root / "pgdata"
        embedded = get_server(pgdata)
        info = embedded.get_postmaster_info()
        admin_url = embedded.get_uri()
        database = f"ledgerpilot_test_{uuid.uuid4().hex[:8]}"
        with psycopg.connect(admin_url, autocommit=True) as conn:
            conn.execute(f'CREATE DATABASE "{database}"')
        database_url = info.get_uri(database=database)
        port = info.port

        def pg_ctl_handle(action: str) -> None:
            log = str(pgdata / "log")
            if action == "stop":
                pg_ctl(["-w", "stop"], pgdata=pgdata, timeout=40)
            elif action == "start":
                pg_ctl(
                    ["-w", "-l", log, "-o", f"-p {port}", "start"],
                    pgdata=pgdata,
                    timeout=90,
                )
            else:  # pragma: no cover - programming error
                raise ValueError(action)

    env = {**os.environ, "DATABASE_URL": database_url}
    subprocess.run(
        [PYTHON, "-m", "backend.scripts.migrate"],
        cwd=str(ROOT),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    subprocess.run(
        [PYTHON, "-m", "backend.scripts.migrate"],
        cwd=str(ROOT),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    client = API(f"http://127.0.0.1:{_free_port()}", database_url, pg_ctl_handle)
    client.start()

    # The app seeds on first startup. Verify the workspace is present.
    health = client.get("/api/health")
    assert health.status_code == 200, health.text
    assert health.json()["seeded"] is True, health.json()

    yield client

    client.stop()
    client.client.close()
    if embedded is not None:
        try:
            pg_ctl(["-w", "stop"], pgdata=pgdata, timeout=40)
        except Exception:
            pass
    shutil.rmtree(temp_root, ignore_errors=True)


@pytest.fixture(autouse=True)
def reset_demo(api: API) -> dict[str, Any]:
    return api.reset()


@pytest.fixture()
def api_conn(api: API):
    with psycopg.connect(api.database_url, row_factory=dict_row) as conn:
        yield conn
