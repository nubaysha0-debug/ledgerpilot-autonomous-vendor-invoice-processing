"""Health, actors, workspace, business profile and demo controls."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from ..config import get_settings
from ..db import read_connection, transaction
from ..deps import actor, owner, service_response
from ..errors import LedgerError
from ..schemas import BusinessPatch
from ..seed import seed_demo
from ..serializers import serialize_business, serialize_workspace
from ..workspace_service import (
    replace_workspace,
    toggle_force_failure,
    update_business,
)

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health() -> dict[str, Any]:
    settings = get_settings()
    with read_connection() as conn:
        conn.execute("SELECT 1")
        migrations = conn.execute(
            "SELECT count(*) AS n FROM schema_migrations"
        ).fetchone()["n"]
        seeded = conn.execute(
            "SELECT to_regclass('public.business_settings') IS NOT NULL AS present"
        ).fetchone()["present"]
        has_profile = False
        if seeded:
            has_profile = conn.execute(
                "SELECT EXISTS (SELECT 1 FROM business_settings WHERE id = 'primary') AS present"
            ).fetchone()["present"]
    return {
        "status": "ok",
        "api_version": "1.0.0",
        "database": "ok",
        "migrations": migrations,
        "seeded": bool(has_profile),
        "adapters": {
            "extractor": settings.extractor,
            "llm": settings.llm_provider,
            "payments": "mock",
        },
        "simulated": True,
        "label": settings.simulated_label,
    }


@router.get("/users")
def users() -> dict[str, Any]:
    with read_connection() as conn:
        rows = conn.execute(
            "SELECT id, display_name, role, email, initials FROM app_users "
            "ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'accountant' THEN 1 "
            "WHEN 'staff' THEN 2 ELSE 3 END, display_name"
        ).fetchall()
    return {
        "items": [
            {
                "id": str(row["id"]),
                "display_name": row["display_name"],
                "role": row["role"],
                "email": row.get("email"),
                "initials": row.get("initials"),
            }
            for row in rows
        ],
        "next_cursor": None,
    }


@router.get("/business")
def get_business() -> dict[str, Any]:
    with read_connection() as conn:
        row = conn.execute(
            "SELECT * FROM business_settings WHERE id = 'primary'"
        ).fetchone()
    if not row:
        raise LedgerError(
            503, "SEED_REQUIRED", "The business profile is missing. Reset the demo."
        )
    return serialize_business(row)


@router.patch("/business")
def patch_business(
    payload: BusinessPatch,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        data = payload.model_dump(exclude_unset=True)
        # Accept the frontend's nested bank object too.
        bank = data.pop("bank", None)
        if isinstance(bank, dict):
            data.setdefault("bank_name", bank.get("bankName"))
            data.setdefault("bank_account_masked", bank.get("accountMasked"))
            data.setdefault("bank_ifsc", bank.get("ifsc"))
            data.setdefault("bank_upi_id", bank.get("upiId"))
        return update_business(conn, actor_row, data)


@router.get("/workspace")
def get_workspace() -> dict[str, Any]:
    with read_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM business_settings WHERE id = 'primary'"
        ).fetchone()
        if not row:
            raise LedgerError(
                503,
                "SEED_REQUIRED",
                "The workspace is empty. Run POST /api/demo/reset.",
            )
        return serialize_workspace(conn)


@router.put("/workspace")
def put_workspace(
    payload: dict[str, Any],
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        return replace_workspace(conn, actor_row, payload)


@router.post("/workspace/import")
def import_workspace(
    payload: dict[str, Any],
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        return replace_workspace(conn, actor_row, payload)


@router.post("/demo/reset")
def reset_demo() -> dict[str, Any]:
    settings = get_settings()
    if not settings.demo_mode:
        raise LedgerError(404, "NOT_FOUND", "Demo reset is disabled.")
    with transaction() as conn:
        seed_demo(conn)
        return serialize_workspace(conn)


@router.post("/demo/force-failure")
def force_failure(
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        return toggle_force_failure(conn, actor_row)
