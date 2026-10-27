"""Dashboard totals and audit timeline."""

from __future__ import annotations

import base64
import uuid
from typing import Any

from fastapi import APIRouter, Query

from ..db import read_connection
from ..errors import LedgerError
from ..serializers import serialize_audit
from ..util import money, money_str

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/dashboard/summary")
def dashboard_summary() -> dict[str, Any]:
    with read_connection() as conn:
        business = conn.execute(
            "SELECT * FROM business_settings WHERE id = 'primary'"
        ).fetchone()
        if not business:
            raise LedgerError(503, "SEED_REQUIRED", "Reset the demo first.")
        totals = conn.execute(
            """
            SELECT
              COALESCE(SUM(b.outstanding) FILTER (
                WHERE i.lifecycle_status <> 'void' AND i.duplicate_of IS NULL
                  AND b.outstanding > 0), 0) AS total_dues,
              COALESCE(SUM(b.outstanding) FILTER (
                WHERE i.lifecycle_status <> 'void' AND i.duplicate_of IS NULL
                  AND b.outstanding > 0 AND b.is_overdue), 0) AS overdue_amount
            FROM invoice_balances b
            JOIN invoices i ON i.id = b.invoice_id
            """
        ).fetchone()
        pending = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) AS amount, count(*) AS n "
            "FROM payments WHERE status = 'pending_approval'"
        ).fetchone()
        counts = conn.execute(
            """
            SELECT
              COUNT(*) FILTER (
                WHERE i.lifecycle_status <> 'void' AND i.duplicate_of IS NULL
                  AND b.outstanding > 0) AS open_invoices,
              COUNT(*) FILTER (
                WHERE i.lifecycle_status <> 'void' AND i.duplicate_of IS NULL
                  AND b.outstanding > 0 AND b.is_overdue) AS overdue_invoices,
              COUNT(*) FILTER (WHERE f.needs_review) AS needs_review
            FROM invoice_balances b
            JOIN invoices i ON i.id = b.invoice_id
            JOIN invoice_flags f ON f.invoice_id = i.id
            """
        ).fetchone()
        by_vendor = conn.execute(
            """
            SELECT v.id AS vendor_id, v.name,
                   SUM(b.outstanding) AS outstanding,
                   COALESCE(SUM(b.outstanding) FILTER (WHERE b.is_overdue), 0) AS overdue,
                   COUNT(*) AS open_invoices
            FROM invoice_balances b
            JOIN invoices i ON i.id = b.invoice_id
            JOIN vendors v ON v.id = i.vendor_id
            WHERE i.lifecycle_status <> 'void' AND i.duplicate_of IS NULL
              AND b.outstanding > 0
            GROUP BY v.id, v.name
            ORDER BY outstanding DESC, v.name
            """
        ).fetchall()
        as_of = conn.execute(
            "SELECT (as_of AT TIME ZONE 'Asia/Kolkata')::date AS day "
            "FROM business_settings WHERE id = 'primary'"
        ).fetchone()["day"]

    return {
        "as_of": as_of.isoformat(),
        "currency": "INR",
        "totals": {
            "total_dues": money_str(totals["total_dues"]),
            "overdue_amount": money_str(totals["overdue_amount"]),
            "pending_approval_amount": money_str(pending["amount"]),
        },
        "counts": {
            "open_invoices": counts["open_invoices"],
            "overdue_invoices": counts["overdue_invoices"],
            "pending_approvals": pending["n"],
            "needs_review": counts["needs_review"],
        },
        "by_vendor": [
            {
                "vendor_id": str(row["vendor_id"]),
                "name": row["name"],
                "outstanding": money_str(row["outstanding"]),
                "overdue": money_str(row["overdue"]),
                "open_invoices": row["open_invoices"],
            }
            for row in by_vendor
        ],
        "links": {
            "overdue": "/api/invoices?filter=overdue",
            "needs_review": "/api/invoices?filter=needs_review",
            "pending_approval": "/api/approvals?status=pending",
            "open": "/api/invoices?filter=open",
        },
    }


@router.get("/audit")
def audit(
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    cursor: str | None = Query(default=None),
) -> dict[str, Any]:
    offset = 0
    if cursor:
        try:
            offset = max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
        except Exception:
            offset = 0
    clauses: list[str] = []
    params: list[Any] = []
    if entity_type:
        clauses.append("a.entity_type = %s")
        params.append(entity_type)
    if entity_id:
        try:
            parsed = uuid.UUID(entity_id)
        except (ValueError, TypeError):
            raise LedgerError(422, "ENTITY_ID_INVALID", "entity_id must be a UUID.")
        clauses.append("a.entity_id = %s")
        params.append(parsed)
    if run_id:
        try:
            parsed_run = uuid.UUID(run_id)
        except (ValueError, TypeError):
            raise LedgerError(422, "RUN_ID_INVALID", "run_id must be a UUID.")
        clauses.append("a.run_id = %s")
        params.append(parsed_run)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with read_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT a.*, u.display_name AS actor_name, u.role AS actor_role
            FROM audit_logs a
            LEFT JOIN app_users u ON u.id = a.actor_id
            {where}
            ORDER BY a.occurred_at DESC, a.id DESC
            LIMIT %s OFFSET %s
            """,
            (*params, limit + 1, offset),
        ).fetchall()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = (
        base64.urlsafe_b64encode(str(offset + limit).encode()).decode()
        if has_more
        else None
    )
    return {
        "items": [serialize_audit(row) for row in rows],
        "next_cursor": next_cursor,
    }
