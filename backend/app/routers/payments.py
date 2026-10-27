"""Payment drafts, execution and retries."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from ..config import get_settings
from ..db import read_connection, transaction
from ..deps import actor, owner, service_response
from ..errors import LedgerError
from ..payments_service import (
    execute_payment,
    get_payment,
    patch_payment,
    retry_payment,
)
from ..schemas import ExecuteRequest, PaymentPatch, require_role
from ..serializers import serialize_payment

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("")
def list_payments(
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    sql = "SELECT * FROM payments"
    params: list[Any] = []
    if status:
        sql += " WHERE status = %s"
        params.append(status)
    sql += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)
    with read_connection() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
        return {
            "items": [serialize_payment(conn, row) for row in rows],
            "next_cursor": None,
        }


@router.get("/{payment_id}")
def get_payment_route(payment_id: uuid.UUID) -> dict[str, Any]:
    with read_connection() as conn:
        return get_payment(conn, payment_id)


@router.patch("/{payment_id}")
def patch_payment_route(
    payment_id: uuid.UUID,
    payload: PaymentPatch,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        return patch_payment(conn, actor_row, payment_id, payload)


@router.post("/{payment_id}/execute")
def execute_payment_route(
    payment_id: uuid.UUID,
    payload: ExecuteRequest | None = None,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    demo_fault: str | None = Header(default=None, alias="X-Demo-Fault"),
    x_actor_id: str | None = Header(default=None),
) -> JSONResponse:
    simulate = payload.simulate if payload else None
    settings = get_settings()
    if demo_fault == "after_gateway" and settings.demo_mode:
        # Test/demo only. The service clears this after one injected crash.
        settings.fault_injection = "after_gateway"
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        status, body = execute_payment(
            conn, actor_row, payment_id, idempotency_key, simulate
        )
        return service_response(status, body)


@router.post("/{payment_id}/retry")
def retry_payment_route(
    payment_id: uuid.UUID,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        return retry_payment(conn, actor_row, payment_id)
