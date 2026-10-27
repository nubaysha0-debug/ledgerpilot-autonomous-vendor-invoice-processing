"""Deterministic invoice validation and derived views.

This is a direct port of the useful parts of src/ledger/rules.ts plus the
validation rules defined in the build plan. No AI output is used here.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from .config import get_settings
from .schemas import InvoiceCreate, InvoiceLineInput
from .util import (
    GSTIN_PATTERN,
    money,
    money_str,
    normalize_invoice_number,
    sha256_json,
    to_paise,
)

PO_THRESHOLD = money("25000.00")
IST = timezone(timedelta(hours=5, minutes=30))


def _today_from_business(conn) -> date:
    row = conn.execute(
        "SELECT (as_of AT TIME ZONE 'Asia/Kolkata')::date AS today "
        "FROM business_settings WHERE id = 'primary'"
    ).fetchone()
    return row["today"] if row else datetime.now(IST).date()


def invoice_lines(conn, invoice_id: uuid.UUID) -> list[dict[str, Any]]:
    return conn.execute(
        "SELECT * FROM invoice_lines WHERE invoice_id = %s ORDER BY line_no",
        (invoice_id,),
    ).fetchall()


def invoice_row(conn, invoice_id: uuid.UUID) -> dict[str, Any] | None:
    return conn.execute(
        "SELECT * FROM invoices WHERE id = %s", (invoice_id,)
    ).fetchone()


def vendor_row(conn, vendor_id: uuid.UUID) -> dict[str, Any] | None:
    return conn.execute(
        "SELECT * FROM vendors WHERE id = %s", (vendor_id,)
    ).fetchone()


def balance_row(conn, invoice_id: uuid.UUID) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM invoice_balances WHERE invoice_id = %s", (invoice_id,)
    ).fetchone()
    return row or {
        "invoice_id": invoice_id,
        "paid_amount": money(0),
        "committed_amount": money(0),
        "outstanding": money(0),
        "payment_status": "unpaid",
        "is_overdue": False,
    }


def flags_row(conn, invoice_id: uuid.UUID) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM invoice_flags WHERE invoice_id = %s", (invoice_id,)
    ).fetchone()
    return row or {"needs_review": True, "has_blocking_findings": False}


def findings(conn, invoice_id: uuid.UUID) -> list[dict[str, Any]]:
    return conn.execute(
        "SELECT * FROM invoice_findings WHERE invoice_id = %s "
        "ORDER BY CASE severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, "
        "created_at, rule_code",
        (invoice_id,),
    ).fetchall()


def _check(
    rule_code: str,
    severity: str,
    message: str,
    evidence: dict[str, Any],
) -> dict[str, Any]:
    return {
        "rule_code": rule_code,
        "severity": severity,
        "message": message,
        "evidence": evidence,
        "evidence_hash": sha256_json(evidence),
    }


def compute_rule_findings(
    conn,
    invoice: dict[str, Any],
    lines: list[dict[str, Any]],
    vendor: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    settings = get_settings()
    tolerance = money(settings.amount_tolerance)
    checks: list[dict[str, Any]] = []

    missing = []
    if not invoice.get("vendor_id"):
        missing.append("vendor_id")
    if not invoice.get("invoice_number"):
        missing.append("invoice_number")
    if not invoice.get("invoice_date"):
        missing.append("invoice_date")
    if invoice.get("total") is None:
        missing.append("total")
    if missing:
        checks.append(
            _check(
                "REQ_FIELD_MISSING",
                "error",
                f"Required invoice fields are missing: {', '.join(missing)}.",
                {"missing": missing},
            )
        )

    if invoice.get("review_state") == "unreviewed":
        checks.append(
            _check(
                "EXTRACTION_UNREVIEWED",
                "error",
                "A human must review every extracted field before this bill can be paid.",
                {"review_state": "unreviewed"},
            )
        )

    line_total = money(
        sum((money(line["line_amount"]) for line in lines), Decimal("0.00"))
    )
    for line in lines:
        expected = money(money(line["quantity"]) * money(line["unit_rate"]))
        printed = money(line["line_amount"])
        if abs(expected - printed) > tolerance:
            checks.append(
                _check(
                    "ARITH_LINE_AMOUNT",
                    "warning",
                    f"Line {line['line_no']} quantity × rate is ₹{money_str(expected)}, "
                    f"but the printed amount is ₹{money_str(printed)}.",
                    {
                        "line_no": line["line_no"],
                        "quantity": str(line["quantity"]),
                        "unit_rate": money_str(line["unit_rate"]),
                        "expected": money_str(expected),
                        "printed": money_str(printed),
                        "difference": money_str(printed - expected),
                    },
                )
            )

    if lines and invoice.get("subtotal") is not None:
        subtotal = money(invoice["subtotal"])
        if abs(line_total - subtotal) > tolerance:
            checks.append(
                _check(
                    "ARITH_LINES_SUBTOTAL",
                    "error",
                    f"Line items total ₹{money_str(line_total)}, but the recorded "
                    f"subtotal is ₹{money_str(subtotal)}.",
                    {
                        "line_total": money_str(line_total),
                        "subtotal": money_str(subtotal),
                        "difference": money_str(line_total - subtotal),
                    },
                )
            )

    if (
        invoice.get("subtotal") is not None
        and invoice.get("tax_total") is not None
        and (invoice.get("stated_total") is not None or invoice.get("total") is not None)
    ):
        expected_total = money(invoice["subtotal"]) + money(invoice["tax_total"])
        printed_total = money(
            invoice["stated_total"]
            if invoice.get("stated_total") is not None
            else invoice["total"]
        )
        if abs(expected_total - printed_total) > tolerance:
            checks.append(
                _check(
                    "ARITH_TOTAL_MISMATCH",
                    "error",
                    f"Subtotal plus tax is ₹{money_str(expected_total)}, but the invoice "
                    f"states ₹{money_str(printed_total)}.",
                    {
                        "subtotal": money_str(invoice["subtotal"]),
                        "tax_total": money_str(invoice["tax_total"]),
                        "expected_total": money_str(expected_total),
                        "stated_total": money_str(printed_total),
                        "total": money_str(invoice.get("total")),
                        "difference": money_str(printed_total - expected_total),
                        "tolerance": money_str(tolerance),
                    },
                )
            )

    if lines and invoice.get("tax_total") is not None and all(
        line.get("gst_rate") is not None for line in lines
    ):
        expected_tax = money(
            sum(
                (
                    money(line["line_amount"])
                    * money(line["gst_rate"])
                    / Decimal("100")
                    for line in lines
                ),
                Decimal("0.00"),
            )
        )
        recorded_tax = money(invoice["tax_total"])
        if abs(expected_tax - recorded_tax) > tolerance:
            checks.append(
                _check(
                    "ARITH_TAX_RATE",
                    "warning",
                    f"The GST rate produces ₹{money_str(expected_tax)} tax, but the "
                    f"invoice records ₹{money_str(recorded_tax)}.",
                    {
                        "expected_tax": money_str(expected_tax),
                        "recorded_tax": money_str(recorded_tax),
                        "difference": money_str(recorded_tax - expected_tax),
                    },
                )
            )

    if vendor and vendor.get("gstin"):
        if not GSTIN_PATTERN.fullmatch(vendor["gstin"]):
            checks.append(
                _check(
                    "GSTIN_FORMAT",
                    "warning",
                    f"Vendor GSTIN {vendor['gstin']} is not in the 15-character format.",
                    {"gstin": vendor["gstin"]},
                )
            )

    invoice_date = invoice.get("invoice_date")
    due_date = invoice.get("due_date")
    if invoice_date:
        today = _today_from_business(conn)
        if invoice_date > today + timedelta(days=1):
            checks.append(
                _check(
                    "DATE_SANITY",
                    "warning",
                    f"Invoice date {invoice_date.isoformat()} is more than one day in the future.",
                    {
                        "invoice_date": invoice_date.isoformat(),
                        "as_of": today.isoformat(),
                    },
                )
            )
        if due_date and due_date < invoice_date:
            checks.append(
                _check(
                    "DATE_SANITY",
                    "warning",
                    "Due date is before the invoice date.",
                    {
                        "invoice_date": invoice_date.isoformat(),
                        "due_date": due_date.isoformat(),
                    },
                )
            )

    if invoice.get("vendor_id") and invoice.get("invoice_number_norm"):
        matches = conn.execute(
            "SELECT id, invoice_number, invoice_date, total FROM invoices "
            "WHERE vendor_id = %s AND invoice_number_norm = %s AND id <> %s "
            "AND lifecycle_status <> 'void' ORDER BY created_at",
            (
                invoice["vendor_id"],
                invoice["invoice_number_norm"],
                invoice["id"],
            ),
        ).fetchall()
        if matches:
            checks.append(
                _check(
                    "DUP_SAME_VENDOR_NUMBER",
                    "warning",
                    f"Another invoice uses the same vendor and number "
                    f"({invoice['invoice_number']}). Both records are kept.",
                    {
                        "normalized_number": invoice["invoice_number_norm"],
                        "matches": [
                            {
                                "invoice_id": str(row["id"]),
                                "invoice_number": row["invoice_number"],
                                "invoice_date": row["invoice_date"].isoformat()
                                if row["invoice_date"]
                                else None,
                                "total": money_str(row["total"]),
                            }
                            for row in matches
                        ],
                    },
                )
            )

        if invoice.get("total") is not None and invoice_date:
            window = max(0, settings.dup_date_window_days)
            near = conn.execute(
                "SELECT id, invoice_number, invoice_date, total FROM invoices "
                "WHERE vendor_id = %s AND total = %s AND id <> %s "
                "AND lifecycle_status <> 'void' "
                "AND invoice_number_norm IS DISTINCT FROM %s "
                "AND invoice_date BETWEEN %s AND %s "
                "ORDER BY created_at",
                (
                    invoice["vendor_id"],
                    money(invoice["total"]),
                    invoice["id"],
                    invoice.get("invoice_number_norm"),
                    invoice_date - timedelta(days=window),
                    invoice_date + timedelta(days=window),
                ),
            ).fetchall()
            if near:
                checks.append(
                    _check(
                        "DUP_SAME_AMOUNT_NEAR_DATE",
                        "info",
                        "A different invoice number has the same vendor and total "
                        "within three days.",
                        {
                            "matches": [
                                {
                                    "invoice_id": str(row["id"]),
                                    "invoice_number": row["invoice_number"],
                                    "invoice_date": row["invoice_date"].isoformat()
                                    if row["invoice_date"]
                                    else None,
                                    "total": money_str(row["total"]),
                                }
                                for row in near
                            ]
                        },
                    )
                )

    return checks


def persist_findings(
    conn,
    invoice_id: uuid.UUID,
    checks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    current_keys = {(item["rule_code"], item["evidence_hash"]) for item in checks}
    existing = findings(conn, invoice_id)
    for row in existing:
        key = (row["rule_code"], row["evidence_hash"])
        if row["status"] in {"open", "acknowledged"} and key not in current_keys:
            conn.execute(
                "UPDATE invoice_findings SET status = 'resolved' WHERE id = %s",
                (row["id"],),
            )

    for item in checks:
        conn.execute(
            """
            INSERT INTO invoice_findings
              (invoice_id, rule_code, severity, message, evidence_json, evidence_hash)
            VALUES (%s, %s, %s, %s, %s::jsonb, %s)
            ON CONFLICT (invoice_id, rule_code, evidence_hash)
            DO UPDATE SET
              message = EXCLUDED.message,
              severity = EXCLUDED.severity,
              status = CASE
                WHEN invoice_findings.status = 'resolved' THEN 'open'
                ELSE invoice_findings.status
              END
            """,
            (
                invoice_id,
                item["rule_code"],
                item["severity"],
                item["message"],
                json.dumps(item["evidence"], default=str),
                item["evidence_hash"],
            ),
        )
    return findings(conn, invoice_id)


def validate_invoice(conn, invoice_id: uuid.UUID) -> list[dict[str, Any]]:
    invoice = invoice_row(conn, invoice_id)
    if not invoice:
        return []
    lines = invoice_lines(conn, invoice_id)
    vendor = vendor_row(conn, invoice["vendor_id"]) if invoice["vendor_id"] else None
    checks = compute_rule_findings(conn, invoice, lines, vendor)
    return persist_findings(conn, invoice_id, checks)


def blocking_findings(conn, invoice_id: uuid.UUID) -> list[dict[str, Any]]:
    return conn.execute(
        "SELECT * FROM invoice_findings WHERE invoice_id = %s "
        "AND status = 'open' AND severity = 'error' ORDER BY created_at",
        (invoice_id,),
    ).fetchall()


def latest_payments(conn, invoice_id: uuid.UUID) -> list[dict[str, Any]]:
    return conn.execute(
        "SELECT p.*, pa.invoice_id, pa.amount AS allocation_amount "
        "FROM payments p JOIN payment_allocations pa ON pa.payment_id = p.id "
        "WHERE pa.invoice_id = %s ORDER BY p.created_at",
        (invoice_id,),
    ).fetchall()


def active_payment(conn, invoice_id: uuid.UUID) -> dict[str, Any] | None:
    rows = conn.execute(
        "SELECT p.*, pa.amount AS allocation_amount "
        "FROM payments p JOIN payment_allocations pa ON pa.payment_id = p.id "
        "WHERE pa.invoice_id = %s AND p.status IN "
        "('draft','pending_approval','approved','failed') "
        "ORDER BY p.created_at DESC LIMIT 1",
        (invoice_id,),
    ).fetchall()
    return rows[0] if rows else None


def current_approval(conn, payment_id: uuid.UUID) -> dict[str, Any] | None:
    return conn.execute(
        "SELECT * FROM approvals WHERE payment_id = %s "
        "AND status IN ('pending','approved') ORDER BY requested_at DESC LIMIT 1",
        (payment_id,),
    ).fetchone()


def invoice_status(conn, invoice_id: uuid.UUID) -> dict[str, Any]:
    """Return canonical balance/flags and a frontend-friendly status label."""
    invoice = invoice_row(conn, invoice_id)
    if not invoice:
        return {}
    bal = balance_row(conn, invoice_id)
    flags = flags_row(conn, invoice_id)
    active = active_payment(conn, invoice_id)
    status = "Needs review"
    if invoice["duplicate_of"]:
        status = "Needs review"
    elif money(bal["outstanding"]) <= 0:
        status = "Paid"
    elif active and active["status"] == "failed":
        status = "Payment failed"
    elif active and active["status"] == "pending_approval":
        status = "Pending approval"
    elif active and active["status"] == "approved":
        status = "Approved"
    elif active and active["status"] == "cancelled":
        status = "Rejected"
    elif flags["has_blocking_findings"]:
        status = "Needs review"
    elif money(bal["paid_amount"]) > 0:
        status = "Part-paid"
    elif flags["needs_review"]:
        status = "Needs review"
    else:
        status = "Ready for approval"
    return {
        "status": status,
        "balance": bal,
        "flags": flags,
    }


def age_on(day: date, as_of: date) -> int:
    return (as_of - day).days
