"""Payment drafts, approvals, simulated execution and idempotency."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

import psycopg

from .audit import write_audit
from .config import get_settings
from .db import transaction
from .errors import LedgerError
from .rules import (
    balance_row,
    blocking_findings,
    invoice_row,
    invoice_status,
    vendor_row,
)
from .schemas import ApprovalDecision, PaymentCreate, PaymentPatch
from .serializers import (
    serialize_approval,
    serialize_invoice,
    serialize_payment,
)
from .util import (
    fingerprint_payment,
    money,
    money_str,
    parse_uuid,
    request_hash,
    sha256_json,
)
from .workflow import cancel_runs_for_payment, create_payment_run


def _invoice_available(conn, invoice_id: uuid.UUID, exclude_payment: uuid.UUID | None = None):
    invoice = conn.execute(
        "SELECT * FROM invoices WHERE id = %s FOR UPDATE", (invoice_id,)
    ).fetchone()
    if not invoice:
        raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")
    rows = conn.execute(
        """
        SELECT
          COALESCE(SUM(a.amount) FILTER (WHERE p.status = 'paid_simulated'), 0)
            AS paid,
          COALESCE(SUM(a.amount) FILTER (
            WHERE p.status IN ('pending_approval','approved','failed')
              AND (%s::uuid IS NULL OR p.id <> %s::uuid)
          ), 0) AS committed
        FROM payment_allocations a
        JOIN payments p ON p.id = a.payment_id
        WHERE a.invoice_id = %s
        """,
        (exclude_payment, exclude_payment, invoice_id),
    ).fetchone()
    paid = money(rows["paid"])
    committed = money(rows["committed"])
    total = money(invoice["total"])
    outstanding = total - paid
    available = outstanding - committed
    return invoice, paid, committed, available, outstanding


def create_payment_draft(
    conn,
    actor: dict[str, Any],
    invoice_id: uuid.UUID,
    payload: PaymentCreate,
    idempotency_key: str | None,
) -> tuple[int, dict[str, Any]]:
    if not idempotency_key or not (16 <= len(idempotency_key) <= 64):
        raise LedgerError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Send an Idempotency-Key header between 16 and 64 characters.",
        )
    body = {
        "invoice_id": str(invoice_id),
        "amount": money_str(payload.amount),
        "payment_date": payload.payment_date.isoformat(),
        "note": payload.note,
        "mode": payload.mode,
        "reference": payload.reference,
    }
    digest = request_hash(body)
    existing = conn.execute(
        "SELECT * FROM payments WHERE idempotency_key = %s", (idempotency_key,)
    ).fetchone()
    if existing:
        if existing["request_hash"] != digest:
            raise LedgerError(
                409,
                "IDEMPOTENCY_KEY_REUSED",
                "That Idempotency-Key was already used for a different payment request.",
                {"payment_id": str(existing["id"])},
            )
        return 200, serialize_payment(conn, existing)

    invoice, paid, committed, available, outstanding = _invoice_available(
        conn, invoice_id
    )
    if invoice["lifecycle_status"] != "active":
        raise LedgerError(
            409,
            "INVOICE_NOT_ACTIVE",
            "Only an active, reviewed invoice can be paid.",
            {"lifecycle_status": invoice["lifecycle_status"]},
        )
    if invoice["review_state"] != "reviewed":
        raise LedgerError(
            409,
            "INVOICE_UNREVIEWED",
            "A human must review the invoice before a payment can be recorded.",
        )
    amount = money(payload.amount)
    if amount <= 0:
        raise LedgerError(422, "INVALID_AMOUNT", "Payment amount must be greater than zero.")
    if amount > available:
        raise LedgerError(
            409,
            "OVER_ALLOCATION",
            f"Only ₹{money_str(available)} is available on this invoice.",
            {
                "available": money_str(available),
                "outstanding": money_str(outstanding),
                "committed": money_str(committed),
                "requested": money_str(amount),
            },
        )
    vendor = vendor_row(conn, invoice["vendor_id"])
    if not vendor:
        raise LedgerError(404, "VENDOR_NOT_FOUND", "The invoice vendor was not found.")
    reference = (payload.reference or "").strip() or (
        f"SIM-{payload.mode}-{str(uuid.uuid4())[:8].upper()}"
    )
    payment = conn.execute(
        """
        INSERT INTO payments
          (vendor_id, amount, payment_date, method_label, payment_mode, reference,
           note, status, idempotency_key, request_hash, simulated, created_by)
        VALUES (%s, %s, %s, 'SIMULATED', %s, %s, %s, 'draft', %s, %s, true, %s)
        RETURNING *
        """,
        (
            vendor["id"],
            amount,
            payload.payment_date,
            payload.mode,
            reference,
            payload.note,
            idempotency_key,
            digest,
            actor["id"],
        ),
    ).fetchone()
    conn.execute(
        "INSERT INTO payment_allocations (payment_id, invoice_id, amount) "
        "VALUES (%s, %s, %s)",
        (payment["id"], invoice_id, amount),
    )
    write_audit(
        conn,
        actor_id=actor["id"],
        action="payment.created",
        entity_type="payment",
        entity_id=payment["id"],
        summary=(
            f"₹{money_str(amount)} {payload.mode} request recorded against "
            f"{invoice['invoice_number']}. No transfer has happened."
        ),
        after={
            "amount": money_str(amount),
            "invoice_id": str(invoice_id),
            "status": "draft",
        },
    )
    result = serialize_payment(conn, payment)
    result["if_paid"] = {"outstanding_after": money_str(outstanding - amount)}
    result["simulated"] = True
    result["label"] = get_settings().simulated_label
    return 201, result


def patch_payment(
    conn,
    actor: dict[str, Any],
    payment_id: uuid.UUID,
    payload: PaymentPatch,
) -> dict[str, Any]:
    if payload.status is not None:
        raise LedgerError(
            422,
            "FORGED_FIELD",
            "Clients cannot set payment status directly.",
        )
    payment = conn.execute(
        "SELECT * FROM payments WHERE id = %s FOR UPDATE", (payment_id,)
    ).fetchone()
    if not payment:
        raise LedgerError(404, "PAYMENT_NOT_FOUND", "The payment was not found.")
    if payload.version != payment["version"]:
        raise LedgerError(
            409,
            "VERSION_CONFLICT",
            "The payment was edited by someone else. Reload and try again.",
            {"current": serialize_payment(conn, payment)},
        )
    if payment["status"] in {"paid_simulated", "rejected", "cancelled"}:
        raise LedgerError(
            409,
            "PAYMENT_NOT_EDITABLE",
            "This payment is terminal and cannot be edited.",
            {"status": payment["status"]},
        )

    allocation = conn.execute(
        "SELECT * FROM payment_allocations WHERE payment_id = %s FOR UPDATE",
        (payment_id,),
    ).fetchone()
    if not allocation:
        raise LedgerError(409, "ALLOCATION_MISSING", "The payment allocation is missing.")
    invoice_id = allocation["invoice_id"]
    if payload.cancel:
        conn.execute(
            "UPDATE approvals SET status = 'invalidated', "
            "invalidated_reason = 'The payment was cancelled.' "
            "WHERE payment_id = %s AND status IN ('pending','approved')",
            (payment_id,),
        )
        run_id = cancel_runs_for_payment(conn, payment_id, "The payment was cancelled.")
        cancelled = conn.execute(
            "UPDATE payments SET status = 'cancelled', version = version + 1, "
            "updated_at = now() WHERE id = %s RETURNING *",
            (payment_id,),
        ).fetchone()
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.cancelled",
            entity_type="payment",
            entity_id=payment_id,
            summary=f"Payment of ₹{money_str(payment['amount'])} cancelled. Nothing was sent.",
            run_id=parse_uuid(run_id) if run_id else None,
        )
        result = serialize_payment(conn, cancelled)
        result["run_cancelled"] = run_id
        result["approval_invalidated"] = True
        return result

    updates = payload.model_dump(exclude_unset=True)
    updates.pop("version", None)
    updates.pop("cancel", None)
    updates.pop("status", None)
    material = False
    if "amount" in updates and money(updates["amount"]) != money(payment["amount"]):
        material = True
        new_amount = money(updates["amount"])
        if new_amount <= 0:
            raise LedgerError(422, "INVALID_AMOUNT", "Payment amount must be positive.")
        invoice, paid, committed, available, outstanding = _invoice_available(
            conn, invoice_id, exclude_payment=payment_id
        )
        if new_amount > available:
            raise LedgerError(
                409,
                "OVER_ALLOCATION",
                f"Only ₹{money_str(available)} is available for this payment.",
                {
                    "available": money_str(available),
                    "requested": money_str(new_amount),
                },
            )
        conn.execute(
            "UPDATE payment_allocations SET amount = %s WHERE payment_id = %s",
            (new_amount, payment_id),
        )
    if "payment_date" in updates:
        material = True

    values = {
        "amount": money(updates.get("amount", payment["amount"])),
        "payment_date": updates.get("payment_date", payment["payment_date"]),
        "note": updates.get("note", payment.get("note")),
    }
    updated = conn.execute(
        """
        UPDATE payments SET amount = %s, payment_date = %s, note = %s,
          version = version + 1, updated_at = now()
        WHERE id = %s RETURNING *
        """,
        (values["amount"], values["payment_date"], values["note"], payment_id),
    ).fetchone()
    invalidated = []
    run_id = None
    if material:
        rows = conn.execute(
            "UPDATE approvals SET status = 'invalidated', "
            "invalidated_reason = 'The payment amount or date changed after approval.' "
            "WHERE payment_id = %s AND status IN ('pending','approved') RETURNING id",
            (payment_id,),
        ).fetchall()
        invalidated = [str(row["id"]) for row in rows]
        run_id = cancel_runs_for_payment(
            conn, payment_id, "The payment changed after approval."
        )
        if updated["status"] in {"pending_approval", "approved", "failed"}:
            updated = conn.execute(
                "UPDATE payments SET status = 'draft', updated_at = now() "
                "WHERE id = %s RETURNING *",
                (payment_id,),
            ).fetchone()
    write_audit(
        conn,
        actor_id=actor["id"],
        action="payment.updated",
        entity_type="payment",
        entity_id=payment_id,
        summary=(
            f"Payment updated to ₹{money_str(updated['amount'])}. "
            "Any previous approval is no longer current."
            if material
            else f"Payment note/date updated for ₹{money_str(updated['amount'])}."
        ),
        before={"version": payment["version"], "amount": money_str(payment["amount"])},
        after={"version": updated["version"], "amount": money_str(updated["amount"])},
        run_id=parse_uuid(run_id) if run_id else None,
    )
    result = serialize_payment(conn, updated)
    result["approval_invalidated"] = bool(invalidated)
    result["approvals_invalidated"] = invalidated
    result["run_cancelled"] = run_id
    return result


def start_payment_run(
    conn, actor: dict[str, Any], payment_id: uuid.UUID
) -> dict[str, Any]:
    payment = conn.execute(
        "SELECT * FROM payments WHERE id = %s FOR UPDATE", (payment_id,)
    ).fetchone()
    if not payment:
        raise LedgerError(404, "PAYMENT_NOT_FOUND", "The payment was not found.")
    if payment["status"] != "draft":
        if payment["status"] in {"pending_approval", "approved", "paid_simulated"}:
            raise LedgerError(
                409,
                "RUN_ALREADY_ACTIVE" if payment["status"] == "pending_approval" else "PAYMENT_NOT_EDITABLE",
                "This payment is not a draft that can start a new run.",
                {"status": payment["status"]},
            )
        raise LedgerError(
            409,
            "PAYMENT_NOT_EDITABLE",
            "Only a draft payment can start an approval run.",
            {"status": payment["status"]},
        )
    allocation = conn.execute(
        "SELECT * FROM payment_allocations WHERE payment_id = %s", (payment_id,)
    ).fetchone()
    if not allocation:
        raise LedgerError(409, "ALLOCATION_MISSING", "The payment has no invoice allocation.")
    invoice_id = allocation["invoice_id"]
    invoice, paid, committed, available, outstanding = _invoice_available(
        conn, invoice_id, exclude_payment=payment_id
    )
    if invoice["lifecycle_status"] != "active" or invoice["review_state"] != "reviewed":
        raise LedgerError(
            409,
            "INVOICE_UNREVIEWED",
            "The invoice must be active and reviewed before approval starts.",
        )
    blocking = blocking_findings(conn, invoice_id)
    if blocking:
        raise LedgerError(
            409,
            "INVOICE_HAS_BLOCKING_FINDINGS",
            "Resolve or acknowledge the blocking exceptions before starting approval.",
            {
                "findings": [
                    {"id": str(row["id"]), "rule_code": row["rule_code"], "message": row["message"]}
                    for row in blocking
                ]
            },
        )
    if money(payment["amount"]) > available:
        raise LedgerError(
            409,
            "OVER_ALLOCATION",
            f"Only ₹{money_str(available)} is available after in-flight payments.",
            {"available": money_str(available), "requested": money_str(payment["amount"])},
        )
    vendor = vendor_row(conn, invoice["vendor_id"])
    fingerprint = fingerprint_payment(
        payment_id=str(payment["id"]),
        vendor_id=str(vendor["id"]),
        invoice_id=str(invoice["id"]),
        invoice_number=invoice["invoice_number"],
        invoice_total=money(invoice["total"]),
        amount=money(payment["amount"]),
    )
    return create_payment_run(conn, actor, payment, invoice, vendor, fingerprint)


def decide_approval(
    conn,
    actor: dict[str, Any],
    approval_id: uuid.UUID,
    payload: ApprovalDecision,
) -> dict[str, Any]:
    from .schemas import require_role

    require_role(actor, {"owner"})
    approval = conn.execute(
        "SELECT * FROM approvals WHERE id = %s FOR UPDATE", (approval_id,)
    ).fetchone()
    if not approval:
        raise LedgerError(404, "APPROVAL_NOT_FOUND", "The approval was not found.")
    if approval["status"] != "pending":
        if (
            approval["status"] == "invalidated"
            and payload.fingerprint == approval["fingerprint"]
        ):
            raise LedgerError(
                409,
                "APPROVAL_STALE",
                "The payment changed after this approval screen was loaded. Review it again.",
                {"current_fingerprint": approval["fingerprint"]},
            )
        raise LedgerError(
            409,
            "APPROVAL_NOT_PENDING",
            "This approval has already been decided.",
            {"status": approval["status"]},
        )
    if payload.decision == "reject" and not (payload.reason or "").strip():
        raise LedgerError(
            422,
            "REASON_REQUIRED",
            "Enter a reason for rejecting this payment.",
        )
    payment = conn.execute(
        "SELECT * FROM payments WHERE id = %s FOR UPDATE",
        (approval["payment_id"],),
    ).fetchone()
    allocation = conn.execute(
        "SELECT * FROM payment_allocations WHERE payment_id = %s",
        (payment["id"],),
    ).fetchone()
    invoice = invoice_row(conn, allocation["invoice_id"])
    vendor = vendor_row(conn, invoice["vendor_id"])
    fingerprint = fingerprint_payment(
        payment_id=str(payment["id"]),
        vendor_id=str(vendor["id"]),
        invoice_id=str(invoice["id"]),
        invoice_number=invoice["invoice_number"],
        invoice_total=money(invoice["total"]),
        amount=money(payment["amount"]),
    )
    if fingerprint != approval["fingerprint"] or payload.fingerprint != approval["fingerprint"]:
        conn.execute(
            "UPDATE approvals SET status = 'invalidated', decided_by = %s, "
            "decided_at = now(), invalidated_reason = "
            "'The amount, invoice or vendor changed after the screen was loaded.' "
            "WHERE id = %s",
            (actor["id"], approval_id),
        )
        run_id = cancel_runs_for_payment(
            conn, payment["id"], "The approval fingerprint was stale."
        )
        conn.execute(
            "UPDATE payments SET status = 'draft', version = version + 1, "
            "updated_at = now() WHERE id = %s",
            (payment["id"],),
        )
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.approval_stale",
            entity_type="payment",
            entity_id=payment["id"],
            summary="Owner decision rejected because the approval fingerprint was stale.",
            run_id=parse_uuid(run_id) if run_id else None,
        )
        raise LedgerError(
            409,
            "APPROVAL_STALE",
            "The payment changed after this approval screen was loaded. Review it again.",
            {"current_fingerprint": fingerprint},
        )

    run = conn.execute(
        "SELECT * FROM workflow_runs WHERE run_type = 'payment_request' "
        "AND entity_id = %s AND status IN "
        "('running','waiting_approval','waiting_execution') FOR UPDATE",
        (payment["id"],),
    ).fetchone()
    if payload.decision == "approve":
        conn.execute(
            "UPDATE approvals SET status = 'approved', decided_by = %s, "
            "decided_at = now(), reason = %s WHERE id = %s",
            (actor["id"], payload.reason, approval_id),
        )
        conn.execute(
            "UPDATE payments SET status = 'approved', version = version + 1, "
            "updated_at = now() WHERE id = %s",
            (payment["id"],),
        )
        if run:
            conn.execute(
                "UPDATE workflow_runs SET status = 'waiting_execution', "
                "current_step = 'await_execution', updated_at = now() WHERE id = %s",
                (run["id"],),
            )
            conn.execute(
                "INSERT INTO workflow_steps (run_id, step_no, step_name, status, "
                "output_json, explanation, finished_at) "
                "SELECT %s, COALESCE(MAX(step_no), 0) + 1, 'owner_approved', 'done', "
                "%s::jsonb, 'Owner approved the exact fingerprint shown.', now() "
                "FROM workflow_steps WHERE run_id = %s",
                (
                    run["id"],
                    json.dumps({"decided_by": str(actor["id"])}),
                    run["id"],
                ),
            )
        status = "approved"
        action = "payment.approved"
        summary = (
            f"{actor['display_name']} approved ₹{money_str(payment['amount'])} "
            f"to {vendor['name']} for {invoice['invoice_number']}."
        )
    else:
        conn.execute(
            "UPDATE approvals SET status = 'rejected', decided_by = %s, "
            "decided_at = now(), reason = %s WHERE id = %s",
            (actor["id"], payload.reason.strip(), approval_id),
        )
        conn.execute(
            "UPDATE payments SET status = 'rejected', version = version + 1, "
            "updated_at = now() WHERE id = %s",
            (payment["id"],),
        )
        if run:
            conn.execute(
                "UPDATE workflow_runs SET status = 'rejected', "
                "last_error = %s, updated_at = now() WHERE id = %s",
                (payload.reason.strip(), run["id"]),
            )
        status = "rejected"
        action = "payment.rejected"
        summary = (
            f"{actor['display_name']} rejected ₹{money_str(payment['amount'])} "
            f"to {vendor['name']}. Reason: {payload.reason.strip()}."
        )

    write_audit(
        conn,
        actor_id=actor["id"],
        action=action,
        entity_type="payment",
        entity_id=payment["id"],
        summary=summary,
        after={"status": status, "reason": payload.reason},
        run_id=run["id"] if run else None,
    )
    current_payment = conn.execute(
        "SELECT * FROM payments WHERE id = %s", (payment["id"],)
    ).fetchone()
    current_approval = conn.execute(
        "SELECT * FROM approvals WHERE id = %s", (approval_id,)
    ).fetchone()
    return {
        "approval": serialize_approval(current_approval),
        "payment": {"id": str(payment["id"]), "status": current_payment["status"]},
        "run": {
            "id": str(run["id"]) if run else None,
            "status": {
                "approve": "waiting_execution",
                "reject": "rejected",
            }[payload.decision],
        },
    }


def get_payment(conn, payment_id: uuid.UUID) -> dict[str, Any]:
    payment = conn.execute(
        "SELECT * FROM payments WHERE id = %s", (payment_id,)
    ).fetchone()
    if not payment:
        raise LedgerError(404, "PAYMENT_NOT_FOUND", "The payment was not found.")
    return serialize_payment(conn, payment)


def _invoice_balance_response(conn, invoice_id: uuid.UUID) -> dict[str, Any]:
    bal = balance_row(conn, invoice_id)
    return {
        "total": money_str(bal["total"] if bal.get("total") is not None else 0),
        "paid_amount": money_str(bal["paid_amount"]),
        "committed_amount": money_str(bal["committed_amount"]),
        "outstanding": money_str(bal["outstanding"]),
        "payment_status": bal["payment_status"],
        "is_overdue": bool(bal["is_overdue"]),
    }


def _gateway_charge(key: str, attempt_no: int, force_failure: bool) -> dict[str, Any]:
    """The fake bank keeps its own committed memory.

    It runs on a separate connection so a crash after the gateway write but
    before the payment commit can be recovered by replaying the key.
    """
    with transaction() as gw:
        existing = gw.execute(
            "SELECT * FROM mock_gateway_ledger WHERE idempotency_key = %s "
            "AND outcome = 'success'",
            (key,),
        ).fetchone()
        if existing:
            return {
                "success": True,
                "gateway_reference": existing["gateway_reference"],
                "recovered": True,
            }
        if force_failure:
            gw.execute(
                "INSERT INTO mock_gateway_ledger "
                "(idempotency_key, attempt_no, outcome, gateway_reference) "
                "VALUES (%s, %s, 'failure', NULL) "
                "ON CONFLICT (idempotency_key, attempt_no) DO NOTHING",
                (key, attempt_no),
            )
            return {"success": False, "gateway_reference": None, "recovered": False}

        reference = f"SIM-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
        inserted = gw.execute(
            "INSERT INTO mock_gateway_ledger "
            "(idempotency_key, attempt_no, outcome, gateway_reference) "
            "VALUES (%s, %s, 'success', %s) "
            "ON CONFLICT DO NOTHING RETURNING gateway_reference",
            (key, attempt_no, reference),
        ).fetchone()
        if inserted:
            return {
                "success": True,
                "gateway_reference": inserted["gateway_reference"],
                "recovered": False,
            }
        existing = gw.execute(
            "SELECT * FROM mock_gateway_ledger WHERE idempotency_key = %s "
            "AND outcome = 'success'",
            (key,),
        ).fetchone()
        if existing:
            return {
                "success": True,
                "gateway_reference": existing["gateway_reference"],
                "recovered": True,
            }
        failed = gw.execute(
            "SELECT * FROM mock_gateway_ledger WHERE idempotency_key = %s "
            "AND attempt_no = %s",
            (key, attempt_no),
        ).fetchone()
        return {
            "success": False,
            "gateway_reference": None,
            "recovered": bool(failed),
        }


def execute_payment(
    conn,
    actor: dict[str, Any],
    payment_id: uuid.UUID,
    idempotency_key: str | None,
    simulate: str | None,
) -> tuple[int, dict[str, Any]]:
    from .schemas import require_role

    require_role(actor, {"owner"})
    payment = conn.execute(
        "SELECT * FROM payments WHERE id = %s FOR UPDATE", (payment_id,)
    ).fetchone()
    if not payment:
        raise LedgerError(404, "PAYMENT_NOT_FOUND", "The payment was not found.")
    if not idempotency_key:
        raise LedgerError(
            400,
            "IDEMPOTENCY_KEY_REQUIRED",
            "Send the payment's Idempotency-Key header.",
        )
    if idempotency_key != payment["idempotency_key"]:
        raise LedgerError(
            409,
            "IDEMPOTENCY_KEY_MISMATCH",
            "The execute key does not match the payment's original idempotency key.",
        )

    allocation = conn.execute(
        "SELECT * FROM payment_allocations WHERE payment_id = %s",
        (payment_id,),
    ).fetchone()
    invoice_id = allocation["invoice_id"]
    invoice = invoice_row(conn, invoice_id)
    if not invoice:
        raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")

    def replay_response():
        current = conn.execute(
            "SELECT * FROM payments WHERE id = %s", (payment_id,)
        ).fetchone()
        success = conn.execute(
            "SELECT * FROM payment_attempts WHERE payment_id = %s "
            "AND outcome = 'success' ORDER BY attempt_no LIMIT 1",
            (payment_id,),
        ).fetchone()
        return {
            "payment": serialize_payment(conn, current),
            "attempt": (
                {
                    "attempt_no": success["attempt_no"],
                    "outcome": "success",
                    "gateway_reference": success["gateway_reference"],
                }
                if success
                else None
            ),
            "replayed": True,
            "invoice_balance": _invoice_balance_response(conn, invoice_id),
        }

    if payment["status"] == "paid_simulated":
        return 200, replay_response()
    if payment["status"] not in {"approved", "failed"}:
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.execution_denied",
            entity_type="payment",
            entity_id=payment_id,
            summary=(
                f"Execution denied for ₹{money_str(payment['amount'])}: "
                "owner approval is required."
            ),
            after={"status": payment["status"]},
        )
        return 409, {
            "code": "APPROVAL_REQUIRED",
            "message": "Owner approval is required before execution.",
            "details": {"payment_status": payment["status"]},
        }

    approval = conn.execute(
        "SELECT * FROM approvals WHERE payment_id = %s AND status = 'approved' "
        "ORDER BY requested_at DESC LIMIT 1 FOR UPDATE",
        (payment_id,),
    ).fetchone()
    if not approval:
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.execution_denied",
            entity_type="payment",
            entity_id=payment_id,
            summary="Execution denied because there is no current owner approval.",
            after={"status": payment["status"]},
        )
        return 409, {
            "code": "APPROVAL_REQUIRED",
            "message": "Owner approval is required before execution.",
            "details": {"payment_status": payment["status"]},
        }

    invoice = conn.execute(
        "SELECT * FROM invoices WHERE id = %s FOR UPDATE", (invoice_id,)
    ).fetchone()
    vendor = vendor_row(conn, invoice["vendor_id"])
    current_fingerprint = fingerprint_payment(
        payment_id=str(payment["id"]),
        vendor_id=str(vendor["id"]),
        invoice_id=str(invoice["id"]),
        invoice_number=invoice["invoice_number"],
        invoice_total=money(invoice["total"]),
        amount=money(payment["amount"]),
    )
    if current_fingerprint != approval["fingerprint"]:
        conn.execute(
            "UPDATE approvals SET status = 'invalidated', invalidated_reason = "
            "'The invoice or vendor changed after approval.' WHERE id = %s",
            (approval["id"],),
        )
        conn.execute(
            "UPDATE payments SET status = 'draft', version = version + 1, "
            "updated_at = now() WHERE id = %s",
            (payment_id,),
        )
        run_id = cancel_runs_for_payment(
            conn, payment_id, "The approval fingerprint became stale."
        )
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.approval_stale",
            entity_type="payment",
            entity_id=payment_id,
            summary="Execution denied because the approval fingerprint is stale.",
            run_id=parse_uuid(run_id) if run_id else None,
        )
        return 409, {
            "code": "APPROVAL_STALE",
            "message": "The invoice or payment changed after approval. Approve it again.",
            "details": {"current_fingerprint": current_fingerprint},
        }

    paid = money(
        conn.execute(
            "SELECT COALESCE(SUM(a.amount), 0) AS paid FROM payment_allocations a "
            "JOIN payments p ON p.id = a.payment_id WHERE a.invoice_id = %s "
            "AND p.status = 'paid_simulated'",
            (invoice_id,),
        ).fetchone()["paid"]
    )
    if money(payment["amount"]) > money(invoice["total"]) - paid:
        return 409, {
            "code": "OVER_ALLOCATION",
            "message": "This execution would exceed the invoice total.",
            "details": {
                "paid": money_str(paid),
                "total": money_str(invoice["total"]),
            },
        }

    attempts = conn.execute(
        "SELECT * FROM payment_attempts WHERE payment_id = %s ORDER BY attempt_no",
        (payment_id,),
    ).fetchall()
    attempt_no = len(attempts) + 1
    settings = get_settings()
    if attempt_no > settings.max_execute_attempts:
        conn.execute(
            "UPDATE workflow_runs SET status = 'failed', "
            "last_error = 'Retry limit reached', updated_at = now() "
            "WHERE run_type = 'payment_request' AND entity_id = %s "
            "AND status IN ('waiting_execution','executing')",
            (payment_id,),
        )
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.execute_denied",
            entity_type="payment",
            entity_id=payment_id,
            summary="Execution denied after the retry limit was reached.",
        )
        return 409, {
            "code": "RETRY_LIMIT",
            "message": "The retry limit was reached. Nothing was paid.",
            "details": {"max_attempts": settings.max_execute_attempts},
        }

    business = conn.execute(
        "SELECT * FROM business_settings WHERE id = 'primary' FOR UPDATE"
    ).fetchone()
    force_failure = False
    if simulate == "fail_once" and settings.mock_allow_forced_failure:
        force_failure = True
    if business and business.get("force_next_failure"):
        force_failure = True
        conn.execute(
            "UPDATE business_settings SET force_next_failure = false WHERE id = 'primary'"
        )

    gateway = _gateway_charge(payment["idempotency_key"], attempt_no, force_failure)

    if settings.fault_injection == "after_gateway" and gateway["success"]:
        settings.fault_injection = ""
        raise LedgerError(
            503,
            "FAULT_INJECTED",
            "The process stopped after the gateway wrote its result. Nothing was committed to the ledger.",
            {"retry_safe": True, "gateway_reference": gateway["gateway_reference"]},
        )

    if not gateway["success"]:
        conn.execute(
            "INSERT INTO payment_attempts "
            "(payment_id, attempt_no, outcome, error_code, error_message) "
            "VALUES (%s, %s, 'failure', 'GATEWAY_FAILED', "
            "'Simulated gateway failure. Nothing was paid.')",
            (payment_id, attempt_no),
        )
        conn.execute(
            "UPDATE payments SET status = 'failed', attempt = %s, "
            "version = version + 1, updated_at = now() WHERE id = %s",
            (attempt_no, payment_id),
        )
        conn.execute(
            "UPDATE workflow_runs SET status = 'waiting_execution', "
            "retry_count = LEAST(retry_count + 1, 5), "
            "last_error = 'Simulated gateway failure', updated_at = now() "
            "WHERE run_type = 'payment_request' AND entity_id = %s "
            "AND status IN ('waiting_execution','executing')",
            (payment_id,),
        )
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.failed",
            entity_type="payment",
            entity_id=payment_id,
            summary=(
                f"Simulated gateway declined ₹{money_str(payment['amount'])}. "
                "Nothing was paid; a safe retry is allowed."
            ),
            after={"attempt_no": attempt_no, "outcome": "failure"},
        )
        return 502, {
            "code": "GATEWAY_FAILED",
            "message": "Simulated gateway failure. Nothing was paid. You can retry safely.",
            "details": {
                "attempt_no": attempt_no,
                "payment_status": "failed",
                "retry_allowed": attempt_no < settings.max_execute_attempts,
            },
        }

    attempt = conn.execute(
        "INSERT INTO payment_attempts "
        "(payment_id, attempt_no, outcome, gateway_reference) "
        "VALUES (%s, %s, 'success', %s) RETURNING *",
        (payment_id, attempt_no, gateway["gateway_reference"]),
    ).fetchone()
    updated = conn.execute(
        "UPDATE payments SET status = 'paid_simulated', gateway_reference = %s, "
        "paid_at = now(), attempt = %s, version = version + 1, updated_at = now() "
        "WHERE id = %s RETURNING *",
        (gateway["gateway_reference"], attempt_no, payment_id),
    ).fetchone()
    conn.execute(
        "UPDATE workflow_runs SET status = 'completed', current_step = 'completed', "
        "updated_at = now() WHERE run_type = 'payment_request' AND entity_id = %s "
        "AND status IN ('waiting_execution','executing','waiting_approval')",
        (payment_id,),
    )
    write_audit(
        conn,
        actor_id=actor["id"],
        action="payment.executed",
        entity_type="payment",
        entity_id=payment_id,
        summary=(
            f"SIMULATED {payment.get('payment_mode', 'NEFT')} of "
            f"₹{money_str(payment['amount'])} executed as "
            f"{gateway['gateway_reference']}. No money was transferred."
        ),
        after={
            "status": "paid_simulated",
            "attempt_no": attempt_no,
            "gateway_reference": gateway["gateway_reference"],
            "recovered": gateway.get("recovered", False),
        },
    )
    return 200, {
        "payment": serialize_payment(conn, updated),
        "attempt": {
            "attempt_no": attempt["attempt_no"],
            "outcome": "success",
            "gateway_reference": attempt["gateway_reference"],
        },
        "replayed": False,
        "invoice_balance": _invoice_balance_response(conn, invoice_id),
    }


def retry_payment(
    conn, actor: dict[str, Any], payment_id: uuid.UUID
) -> dict[str, Any]:
    from .schemas import require_role

    require_role(actor, {"owner"})
    payment = conn.execute(
        "SELECT * FROM payments WHERE id = %s FOR UPDATE", (payment_id,)
    ).fetchone()
    if not payment:
        raise LedgerError(404, "PAYMENT_NOT_FOUND", "The payment was not found.")
    if payment["status"] != "failed":
        raise LedgerError(
            409,
            "PAYMENT_NOT_RETRYABLE",
            "Only a failed simulated payment can be retried.",
            {"status": payment["status"]},
        )
    conn.execute(
        "UPDATE payments SET status = 'approved', version = version + 1, "
        "updated_at = now() WHERE id = %s",
        (payment_id,),
    )
    write_audit(
        conn,
        actor_id=actor["id"],
        action="payment.retry_authorised",
        entity_type="payment",
        entity_id=payment_id,
        summary=(
            f"Owner authorised a retry of ₹{money_str(payment['amount'])}. "
            "The same approval and idempotency key will be reused."
        ),
    )
    current = conn.execute(
        "SELECT * FROM payments WHERE id = %s", (payment_id,)
    ).fetchone()
    return serialize_payment(conn, current)


def list_approvals(conn, status: str | None = "pending") -> dict[str, Any]:
    params: list[Any] = []
    clause = ""
    if status:
        clause = " WHERE a.status = %s"
        params.append(status)
    rows = conn.execute(
        f"""
        SELECT a.*, p.amount, p.vendor_id, pa.invoice_id, i.invoice_number,
               v.name AS vendor_name
        FROM approvals a
        JOIN payments p ON p.id = a.payment_id
        JOIN payment_allocations pa ON pa.payment_id = p.id
        JOIN invoices i ON i.id = pa.invoice_id
        JOIN vendors v ON v.id = p.vendor_id
        {clause}
        ORDER BY a.requested_at DESC
        """,
        tuple(params),
    ).fetchall()
    items = []
    for row in rows:
        item = serialize_approval(row)
        item["summary"] = {
            "vendor": row["vendor_name"],
            "invoice_number": row["invoice_number"],
            "amount": money_str(row["amount"]),
        }
        items.append(item)
    return {"items": items, "next_cursor": None}
