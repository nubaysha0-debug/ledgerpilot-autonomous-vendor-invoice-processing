"""Vendor master routes."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Header, Query

from ..db import read_connection, transaction
from ..deps import actor, owner
from ..errors import LedgerError
from ..invoices_service import create_vendor, patch_vendor, verify_vendor_bank
from ..schemas import VendorCreate, VendorPatch, require_role
from ..serializers import serialize_vendor

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("")
def list_vendors(
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
) -> dict[str, Any]:
    sql = "SELECT * FROM vendors"
    params: list[Any] = []
    if q and q.strip():
        sql += " WHERE name ILIKE %s OR gstin ILIKE %s"
        pattern = f"%{q.strip()}%"
        params.extend([pattern, pattern])
    sql += " ORDER BY name LIMIT %s"
    params.append(limit)
    with read_connection() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return {"items": [serialize_vendor(row) for row in rows], "next_cursor": None}


@router.get("/{vendor_id}")
def get_vendor(vendor_id: uuid.UUID) -> dict[str, Any]:
    with read_connection() as conn:
        row = conn.execute("SELECT * FROM vendors WHERE id = %s", (vendor_id,)).fetchone()
    if not row:
        raise LedgerError(404, "VENDOR_NOT_FOUND", "The vendor was not found.")
    return serialize_vendor(row)


@router.post("", status_code=201)
def post_vendor(
    payload: VendorCreate,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        return create_vendor(conn, actor_row, payload)


@router.patch("/{vendor_id}")
def patch_vendor_route(
    vendor_id: uuid.UUID,
    payload: VendorPatch,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        return patch_vendor(conn, actor_row, vendor_id, payload)


@router.post("/{vendor_id}/verify-bank")
def verify_bank(
    vendor_id: uuid.UUID,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        return verify_vendor_bank(conn, actor_row, vendor_id)
