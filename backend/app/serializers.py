"""JSON serializers shared by canonical and compatibility routes."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from .config import get_settings
from .rules import (
    active_payment,
    balance_row,
    findings,
    flags_row,
    invoice_lines,
    invoice_row,
    invoice_status,
    latest_payments,
    vendor_row,
)
from .util import money, money_str, to_paise

IST = ZoneInfo("Asia/Kolkata")


def iso_ist(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    return value.astimezone(IST).isoformat()


def quantity_str(value: Decimal | int | float | None) -> str | None:
    if value is None:
        return None
    text = format(Decimal(str(value)).normalize(), "f")
    return text


def serialize_vendor(vendor: dict[str, Any]) -> dict[str, Any]:
    if not vendor:
        return {}
    return {
        "id": str(vendor["id"]),
        "name": vendor["name"],
        "category": vendor.get("category"),
        "gstin": vendor.get("gstin"),
        "phone": vendor.get("phone"),
        "email": vendor.get("email"),
        "address": vendor.get("address"),
        "city": vendor.get("city"),
        "state": vendor.get("state"),
        "pincode": vendor.get("pincode"),
        "terms_days": vendor.get("terms_days"),
        "terms_label": vendor.get("terms_label"),
        "status": vendor.get("status", "active"),
        "last_payment_date": (
            vendor["last_payment_date"].isoformat()
            if vendor.get("last_payment_date")
            else None
        ),
        "bank": {
            "bank_name": vendor.get("bank_name"),
            "account_masked": vendor.get("bank_account_masked"),
            "ifsc": vendor.get("bank_ifsc"),
            "upi_id": vendor.get("bank_upi_id"),
            "status": vendor.get("bank_status", "verified"),
            "changed_at": iso_ist(vendor.get("bank_changed_at")),
            "previous_account_masked": vendor.get("previous_account_masked"),
        },
        "created_at": iso_ist(vendor.get("created_at")),
    }


def serialize_line(line: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(line["id"]),
        "line_no": line["line_no"],
        "description": line["description"],
        "hsn": line.get("hsn"),
        "quantity": quantity_str(line["quantity"]),
        "unit": line.get("unit"),
        "unit_rate": money_str(line["unit_rate"]),
        "line_amount": money_str(line["line_amount"]),
        "gst_rate": money_str(line["gst_rate"]) if line.get("gst_rate") is not None else None,
    }


def serialize_finding(row: dict[str, Any]) -> dict[str, Any]:
    evidence = row.get("evidence_json") or {}
    if isinstance(evidence, str):
        try:
            evidence = json.loads(evidence)
        except json.JSONDecodeError:
            evidence = {}
    return {
        "id": str(row["id"]),
        "rule_code": row["rule_code"],
        "severity": row["severity"],
        "status": row["status"],
        "message": row["message"],
        "evidence": evidence,
        "acknowledged_by": str(row["acknowledged_by"]) if row.get("acknowledged_by") else None,
        "acknowledged_note": row.get("acknowledged_note"),
        "acknowledged_at": iso_ist(row.get("acknowledged_at")),
        "created_at": iso_ist(row.get("created_at")),
    }


def serialize_approval(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "payment_id": str(row["payment_id"]),
        "status": row["status"],
        "fingerprint": row["fingerprint"],
        "requested_by": str(row["requested_by"]),
        "requested_at": iso_ist(row.get("requested_at")),
        "decided_by": str(row["decided_by"]) if row.get("decided_by") else None,
        "decided_at": iso_ist(row.get("decided_at")),
        "reason": row.get("reason"),
        "invalidated_reason": row.get("invalidated_reason"),
    }


def _attempts(conn, payment_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM payment_attempts WHERE payment_id = %s ORDER BY attempt_no",
        (payment_id,),
    ).fetchall()
    return [
        {
            "attempt_no": row["attempt_no"],
            "outcome": row["outcome"],
            "gateway_reference": row.get("gateway_reference"),
            "error_code": row.get("error_code"),
            "error_message": row.get("error_message"),
            "created_at": iso_ist(row.get("created_at")),
        }
        for row in rows
    ]


def _allocations(conn, payment_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM payment_allocations WHERE payment_id = %s ORDER BY id",
        (payment_id,),
    ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "invoice_id": str(row["invoice_id"]),
            "amount": money_str(row["amount"]),
        }
        for row in rows
    ]


def _current_approval(conn, payment_id: uuid.UUID) -> dict[str, Any] | None:
    return conn.execute(
        "SELECT * FROM approvals WHERE payment_id = %s "
        "AND status IN ('pending','approved') ORDER BY requested_at DESC LIMIT 1",
        (payment_id,),
    ).fetchone()


def serialize_payment(conn, row: dict[str, Any]) -> dict[str, Any]:
    approval = _current_approval(conn, row["id"])
    allocations = _allocations(conn, row["id"])
    attempts = _attempts(conn, row["id"])
    creator = conn.execute(
        "SELECT display_name FROM app_users WHERE id = %s", (row["created_by"],)
    ).fetchone()
    status = row["status"]
    label = get_settings().simulated_label
    return {
        "id": str(row["id"]),
        "vendor_id": str(row["vendor_id"]),
        "status": status,
        "amount": money_str(row["amount"]),
        "payment_date": row["payment_date"].isoformat(),
        "mode": row.get("payment_mode", "NEFT"),
        "reference": row.get("reference"),
        "note": row.get("note"),
        "method_label": row.get("method_label", "SIMULATED"),
        "allocations": allocations,
        "idempotency_key": row["idempotency_key"],
        "fingerprint": approval["fingerprint"] if approval else None,
        "approval": serialize_approval(approval),
        "attempts": attempts,
        "version": row["version"],
        "attempt": row.get("attempt", 1),
        "simulated": True,
        "label": label,
        "gateway_reference": row.get("gateway_reference"),
        "paid_at": iso_ist(row.get("paid_at")),
        "created_by": str(row["created_by"]),
        "created_by_name": creator["display_name"] if creator else None,
        "created_at": iso_ist(row.get("created_at")),
        "updated_at": iso_ist(row.get("updated_at")),
    }


def serialize_invoice(
    conn,
    row: dict[str, Any],
    *,
    include_lines: bool = True,
    include_findings: bool = True,
    include_payments: bool = True,
) -> dict[str, Any]:
    bal = balance_row(conn, row["id"])
    flags = flags_row(conn, row["id"])
    status = invoice_status(conn, row["id"])
    vendor = vendor_row(conn, row["vendor_id"]) if row.get("vendor_id") else None
    result: dict[str, Any] = {
        "id": str(row["id"]),
        "vendor_id": str(row["vendor_id"]) if row.get("vendor_id") else None,
        "vendor": serialize_vendor(vendor) if vendor else None,
        "invoice_number": row.get("invoice_number"),
        "invoice_number_norm": row.get("invoice_number_norm"),
        "invoice_date": row["invoice_date"].isoformat() if row.get("invoice_date") else None,
        "received_date": row["received_date"].isoformat() if row.get("received_date") else None,
        "due_date": row["due_date"].isoformat() if row.get("due_date") else None,
        "terms_days": row.get("terms_days"),
        "po_number": row.get("po_number"),
        "grn_number": row.get("grn_number"),
        "place_of_supply": row.get("place_of_supply"),
        "gst_type": row.get("gst_type"),
        "gst_rate": money_str(row["gst_rate"]) if row.get("gst_rate") is not None else None,
        "subtotal": money_str(row.get("subtotal")),
        "cgst": money_str(row.get("cgst")),
        "sgst": money_str(row.get("sgst")),
        "igst": money_str(row.get("igst")),
        "tax_total": money_str(row.get("tax_total")),
        "round_off": money_str(row.get("round_off")),
        "total": money_str(row.get("total")),
        "stated_total": money_str(row.get("stated_total")),
        "source": row.get("source"),
        "duplicate_of": str(row["duplicate_of"]) if row.get("duplicate_of") else None,
        "notes": row.get("notes"),
        "source_file_id": str(row["source_file_id"]) if row.get("source_file_id") else None,
        "extraction_json": row.get("extraction_json"),
        "review_state": row["review_state"],
        "lifecycle_status": row["lifecycle_status"],
        "version": row["version"],
        "created_at": iso_ist(row.get("created_at")),
        "updated_at": iso_ist(row.get("updated_at")),
        "status": status.get("status"),
        "needs_review": flags["needs_review"],
        "has_blocking_findings": flags["has_blocking_findings"],
        "balance": {
            "total": money_str(row.get("total")),
            "paid_amount": money_str(bal["paid_amount"]),
            "committed_amount": money_str(bal["committed_amount"]),
            "outstanding": money_str(bal["outstanding"]),
            "payment_status": bal["payment_status"],
            "is_overdue": bool(bal["is_overdue"]),
        },
    }
    if include_lines:
        result["lines"] = [
            serialize_line(line) for line in invoice_lines(conn, row["id"])
        ]
    if include_findings:
        result["findings"] = [
            serialize_finding(item) for item in findings(conn, row["id"])
        ]
    if include_payments:
        result["payments"] = [
            serialize_payment(conn, item) for item in latest_payments(conn, row["id"])
        ]
        active = active_payment(conn, row["id"])
        result["active_payment_id"] = str(active["id"]) if active else None
    duplicate_rows = []
    if row.get("invoice_number_norm") and row.get("vendor_id"):
        duplicate_rows = conn.execute(
            "SELECT id, invoice_number, invoice_date, total FROM invoices "
            "WHERE vendor_id = %s AND invoice_number_norm = %s AND id <> %s "
            "AND lifecycle_status <> 'void' ORDER BY created_at",
            (row["vendor_id"], row["invoice_number_norm"], row["id"]),
        ).fetchall()
    result["duplicate_candidates"] = [
        {
            "invoice_id": str(item["id"]),
            "invoice_number": item["invoice_number"],
            "invoice_date": item["invoice_date"].isoformat() if item["invoice_date"] else None,
            "total": money_str(item["total"]),
        }
        for item in duplicate_rows
    ]
    return result


def serialize_invoice_summary(conn, row: dict[str, Any]) -> dict[str, Any]:
    return serialize_invoice(
        conn,
        row,
        include_lines=False,
        include_findings=True,
        include_payments=False,
    )


def serialize_file(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "original_filename": row["original_filename"],
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "sha256": row["sha256"],
        "url": f"/api/files/{row['id']}",
        "created_at": iso_ist(row.get("created_at")),
    }


def serialize_audit(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "occurred_at": iso_ist(row["occurred_at"]),
        "actor": {
            "id": str(row["actor_id"]),
            "name": row.get("actor_name") or "System",
            "role": row.get("actor_role") or "system",
        },
        "action": row["action"],
        "entity_type": row["entity_type"],
        "entity_id": str(row["entity_id"]),
        "summary": row["summary"],
        "before": row.get("before_json"),
        "after": row.get("after_json"),
        "run_id": str(row["run_id"]) if row.get("run_id") else None,
        "correlation_id": str(row["correlation_id"]) if row.get("correlation_id") else None,
    }


def serialize_business(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": "primary",
        "name": row["name"],
        "legal_name": row["legal_name"],
        "gstin": row["gstin"],
        "address": row["address"],
        "city": row["city"],
        "state": row["state"],
        "pincode": row["pincode"],
        "phone": row["phone"],
        "email": row["email"],
        "fy": row["fy"],
        "as_of": iso_ist(row["as_of"]),
        "bank": {
            "bank_name": row["bank_name"],
            "account_masked": row["bank_account_masked"],
            "ifsc": row["bank_ifsc"],
            "upi_id": row.get("bank_upi_id"),
            "status": row["bank_status"],
        },
        "force_next_failure": bool(row.get("force_next_failure")),
    }


def _team_rows(conn) -> list[dict[str, Any]]:
    return conn.execute(
        "SELECT * FROM app_users WHERE role IN ('owner','accountant','staff') "
        "ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'accountant' THEN 1 ELSE 2 END"
    ).fetchall()


def _workspace_payment(
    conn,
    row: dict[str, Any],
    approval: dict[str, Any] | None,
    attempts: list[dict[str, Any]],
    names: dict[str, str],
) -> dict[str, Any]:
    status_map = {
        "paid_simulated": "simulated",
        "pending_approval": "pending_approval",
        "approved": "approved",
        "failed": "failed",
        "rejected": "rejected",
        "cancelled": "rejected",
        "draft": "pending_approval",
    }
    failure_reason = None
    for attempt in reversed(attempts):
        if attempt["outcome"] == "failure":
            failure_reason = attempt.get("error_message") or "The mock gateway declined."
            break
    return {
        "id": str(row["id"]),
        "invoiceId": str(row["_invoice_id"]),
        "amountPaise": to_paise(row["amount"]),
        "mode": row.get("payment_mode", "NEFT"),
        "reference": row.get("reference") or "",
        "requestedDate": row["payment_date"].isoformat(),
        "recordedBy": names.get(str(row["created_by"]), "Accountant"),
        "recordedAt": iso_ist(row["created_at"]),
        "status": status_map.get(row["status"], "pending_approval"),
        "approvedBy": (
            names.get(str(approval["decided_by"]), "Owner")
            if approval and approval.get("decided_by")
            else None
        ),
        "approvedAt": iso_ist(approval.get("decided_at")) if approval else None,
        "approvalFingerprint": approval["fingerprint"] if approval else None,
        "executedAt": iso_ist(row.get("paid_at")),
        "mockTxnId": row.get("gateway_reference"),
        "failureReason": failure_reason,
        "attempt": row.get("attempt", 1),
        "note": row.get("note"),
        "rejectionReason": approval.get("reason") if approval else None,
        "idempotencyKey": row.get("idempotency_key"),
    }


def serialize_workspace(conn) -> dict[str, Any]:
    business = conn.execute(
        "SELECT * FROM business_settings WHERE id = 'primary'"
    ).fetchone()
    if not business:
        raise RuntimeError("business_settings is empty; run the demo seed")
    users = _team_rows(conn)
    names = {str(row["id"]): row["display_name"] for row in users}
    vendors = conn.execute("SELECT * FROM vendors ORDER BY name").fetchall()
    invoices = conn.execute(
        "SELECT * FROM invoices ORDER BY invoice_date DESC, created_at DESC"
    ).fetchall()
    payments = conn.execute(
        "SELECT p.*, pa.invoice_id AS _invoice_id FROM payments p "
        "JOIN payment_allocations pa ON pa.payment_id = p.id "
        "ORDER BY p.created_at"
    ).fetchall()
    approvals = {
        str(row["payment_id"]): row
        for row in conn.execute(
            "SELECT DISTINCT ON (payment_id) * FROM approvals "
            "ORDER BY payment_id, requested_at DESC"
        ).fetchall()
    }
    attempts: dict[str, list[dict[str, Any]]] = {}
    for row in conn.execute(
        "SELECT * FROM payment_attempts ORDER BY payment_id, attempt_no"
    ).fetchall():
        attempts.setdefault(str(row["payment_id"]), []).append(row)
    audit_rows = conn.execute(
        "SELECT a.*, u.display_name AS actor_name, u.role AS actor_role "
        "FROM audit_logs a LEFT JOIN app_users u ON u.id = a.actor_id "
        "ORDER BY a.occurred_at, a.id"
    ).fetchall()

    workspace_vendors = []
    for vendor in vendors:
        workspace_vendors.append(
            {
                "id": str(vendor["id"]),
                "name": vendor["name"],
                "category": vendor.get("category") or "Supplier",
                "gstin": vendor.get("gstin") or "",
                "address": vendor.get("address") or "",
                "city": vendor.get("city") or "",
                "state": vendor.get("state") or "",
                "pincode": vendor.get("pincode") or "",
                "phone": vendor.get("phone") or "",
                "email": vendor.get("email") or "",
                "termsDays": vendor.get("terms_days") or 30,
                "termsLabel": vendor.get("terms_label") or f"Net {vendor.get('terms_days') or 30}",
                "bank": {
                    "bankName": vendor.get("bank_name") or "SIMULATED BANK",
                    "accountMasked": vendor.get("bank_account_masked") or "**** 0000",
                    "ifsc": vendor.get("bank_ifsc") or "SIMU0000001",
                    "upiId": vendor.get("bank_upi_id"),
                    "status": vendor.get("bank_status") or "verified",
                    "changedAt": iso_ist(vendor.get("bank_changed_at")),
                    "previousAccountMasked": vendor.get("previous_account_masked"),
                },
                "lastPaymentDate": (
                    vendor["last_payment_date"].isoformat()
                    if vendor.get("last_payment_date")
                    else None
                ),
                "status": vendor.get("status") or "active",
            }
        )

    workspace_invoices = []
    line_rows: dict[str, list[dict[str, Any]]] = {}
    for line in conn.execute(
        "SELECT * FROM invoice_lines ORDER BY invoice_id, line_no"
    ).fetchall():
        line_rows.setdefault(str(line["invoice_id"]), []).append(line)
    for row in invoices:
        lines = [
            {
                "id": str(line["id"]),
                "description": line["description"],
                "hsn": line.get("hsn") or "",
                "qty": float(line["quantity"]),
                "unit": line.get("unit") or "",
                "ratePaise": to_paise(line["unit_rate"]),
                "totalPaise": to_paise(line["line_amount"]),
            }
            for line in line_rows.get(str(row["id"]), [])
        ]
        workspace_invoices.append(
            {
                "id": str(row["id"]),
                "invoiceNumber": row.get("invoice_number") or "(draft)",
                "vendorId": str(row["vendor_id"]) if row.get("vendor_id") else "",
                "issueDate": row["invoice_date"].isoformat() if row.get("invoice_date") else "",
                "receivedDate": (
                    row["received_date"].isoformat()
                    if row.get("received_date")
                    else (row["invoice_date"].isoformat() if row.get("invoice_date") else "")
                ),
                "dueDate": row["due_date"].isoformat() if row.get("due_date") else "",
                "termsDays": row.get("terms_days") or 30,
                "poNumber": row.get("po_number"),
                "grnNumber": row.get("grn_number"),
                "placeOfSupply": row.get("place_of_supply") or "Maharashtra (27)",
                "gstType": row.get("gst_type") or "intra",
                "gstRate": float(row["gst_rate"]) if row.get("gst_rate") is not None else 18,
                "lines": lines,
                "taxablePaise": to_paise(row.get("subtotal")),
                "cgstPaise": to_paise(row.get("cgst")),
                "sgstPaise": to_paise(row.get("sgst")),
                "igstPaise": to_paise(row.get("igst")),
                "roundOffPaise": to_paise(row.get("round_off")),
                "totalPaise": to_paise(row.get("total")),
                "statedTotalPaise": to_paise(
                    row.get("stated_total") if row.get("stated_total") is not None else row.get("total")
                ),
                "version": row["version"],
                "source": row.get("source") or "manual",
                "lifecycleStatus": row.get("lifecycle_status") or "active",
                "reviewState": row.get("review_state") or "reviewed",
                "duplicateOf": str(row["duplicate_of"]) if row.get("duplicate_of") else None,
                "notes": row.get("notes"),
                "importedAt": (
                    iso_ist(row["created_at"]) if row.get("source") in {"upload", "email"} else None
                ),
            }
        )

    workspace_payments = [
        _workspace_payment(
            conn,
            row,
            approvals.get(str(row["id"])),
            attempts.get(str(row["id"]), []),
            names,
        )
        for row in payments
    ]

    action_labels = {
        "invoice.created": "Invoice received",
        "invoice.updated": "Invoice revised",
        "invoice.reviewed": "Invoice reviewed",
        "invoice.validated": "Invoice re-checked",
        "finding.acknowledged": "Exception acknowledged",
        "vendor.created": "Vendor added",
        "vendor.bank_verified": "Vendor bank verified",
        "payment.created": "Payment request recorded",
        "payment.updated": "Payment request updated",
        "payment.approved": "Payment approved",
        "payment.rejected": "Payment rejected",
        "payment.executed": "Mock payment executed",
        "payment.execution_denied": "Execution blocked",
        "payment.failed": "Mock gateway declined",
        "business.updated": "Business profile updated",
        "workspace.imported": "Workspace imported",
        "workspace.restored": "Workspace restored",
        "demo.reset": "Demo reset",
    }
    entity_labels = {
        "payment": "payment",
        "invoice": "invoice",
        "vendor": "vendor",
        "business": "system",
        "workspace": "system",
    }
    workspace_audit = [
        {
            "id": f"aud-{row['id']}",
            "at": iso_ist(row["occurred_at"]),
            "actor": row.get("actor_name") or "System",
            "actorRole": row.get("actor_role") or "system",
            "action": action_labels.get(row["action"], row["action"]),
            "entityType": entity_labels.get(row["entity_type"], "system"),
            "entityId": str(row["entity_id"]),
            "summary": row["summary"],
            "detail": (
                row.get("after_json", {}).get("detail")
                if isinstance(row.get("after_json"), dict)
                else None
            ),
        }
        for row in audit_rows
    ]

    team = [
        {
            "id": str(row["id"]),
            "name": row["display_name"],
            "title": {
                "owner": "Proprietor · Payment approver",
                "accountant": "Accountant · Records payments",
                "staff": "Counter staff · View only",
            }.get(row["role"], row["role"]),
            "role": row["role"],
            "initials": row.get("initials")
            or "".join(part[0] for part in row["display_name"].split()[:2]).upper(),
        }
        for row in users
    ]

    return {
        "schemaVersion": 1,
        "business": {
            "id": "biz-primary",
            "name": business["name"],
            "legalName": business["legal_name"],
            "gstin": business["gstin"],
            "address": business["address"],
            "city": business["city"],
            "state": business["state"],
            "pincode": business["pincode"],
            "phone": business["phone"],
            "email": business["email"],
            "fy": business["fy"],
            "asOf": iso_ist(business["as_of"]),
            "bank": {
                "bankName": business["bank_name"],
                "accountMasked": business["bank_account_masked"],
                "ifsc": business["bank_ifsc"],
                "upiId": business.get("bank_upi_id"),
                "status": business["bank_status"],
            },
        },
        "team": team,
        "vendors": workspace_vendors,
        "invoices": workspace_invoices,
        "payments": workspace_payments,
        "audit": workspace_audit,
        "role": "owner",
        "forceNextFailure": bool(business.get("force_next_failure")),
        "seededAt": iso_ist(business["as_of"]),
    }
