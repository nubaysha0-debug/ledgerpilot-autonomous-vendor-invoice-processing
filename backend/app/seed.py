"""Deterministic synthetic seed used by POST /api/demo/reset and startup."""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from .util import (
    from_paise,
    money,
    normalize_invoice_number,
    request_hash,
    sha256_json,
    stable_uuid,
)

SEED_PATH = Path(__file__).resolve().parents[1] / "seed" / "demo_workspace.json"

SYSTEM_ACTOR_ID = stable_uuid("user-system")
ID_NAMESPACE = "ledgerpilot-demo"


def _uid(value: str) -> uuid.UUID:
    return uuid.UUID(str(stable_uuid(f"{ID_NAMESPACE}:{value}")))


def _date(value: str | None) -> date | None:
    if not value:
        return None
    return date.fromisoformat(value[:10])


def _timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def _action_code(value: str) -> str:
    mapping = {
        "Invoice received": "invoice.created",
        "Bank change detected": "vendor.bank_changed",
        "Bank change re-flagged": "vendor.bank_changed",
        "Arithmetic check failed": "invoice.validated",
        "Duplicate upload detected": "invoice.validated",
        "Part-payment recorded": "payment.created",
        "Payment request recorded": "payment.created",
        "Payment approved": "payment.approved",
        "Mock payment executed": "payment.executed",
    }
    return mapping.get(value, value)


def _entity_type(value: str) -> str:
    return value if value in {"invoice", "payment", "vendor"} else "workspace"


def load_seed() -> dict[str, Any]:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def truncate_demo(conn) -> None:
    conn.execute(
        """
        TRUNCATE TABLE
          audit_logs, workflow_steps, workflow_runs, mock_gateway_ledger,
          payment_attempts, approvals, payment_allocations, payments,
          invoice_findings, invoice_lines, invoices, uploaded_files,
          vendors, business_settings, app_users
        RESTART IDENTITY CASCADE
        """
    )


def seed_demo(conn) -> None:
    data = load_seed()
    truncate_demo(conn)

    # Actors ---------------------------------------------------------------
    actor_ids: dict[str, uuid.UUID] = {}
    for member in data["team"]:
        uid = _uid(member["id"])
        actor_ids[member["name"]] = uid
        conn.execute(
            "INSERT INTO app_users (id, display_name, role, email, initials) "
            "VALUES (%s, %s, %s, %s, %s)",
            (
                uid,
                member["name"],
                member["role"],
                f"{member['role']}@shreeganesh.example",
                member["initials"],
            ),
        )
    conn.execute(
        "INSERT INTO app_users (id, display_name, role, email, initials) "
        "VALUES (%s, %s, 'system', %s, %s)",
        (SYSTEM_ACTOR_ID, "System", "system@ledgerpilot.local", "SY"),
    )
    actor_ids["System"] = SYSTEM_ACTOR_ID

    # Shop profile ---------------------------------------------------------
    business = data["business"]
    bank = business["bank"]
    as_of = _timestamp(business["asOf"])
    conn.execute(
        """
        INSERT INTO business_settings
          (id, name, legal_name, gstin, address, city, state, pincode, phone,
           email, fy, as_of, bank_name, bank_account_masked, bank_ifsc,
           bank_upi_id, bank_status, force_next_failure)
        VALUES ('primary', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, false)
        """,
        (
            business["name"],
            business["legalName"],
            business["gstin"],
            business["address"],
            business["city"],
            business["state"],
            business["pincode"],
            business["phone"],
            business["email"],
            business["fy"],
            as_of,
            bank["bankName"],
            bank["accountMasked"],
            bank["ifsc"],
            bank.get("upiId"),
            bank.get("status", "verified"),
        ),
    )

    # Vendors --------------------------------------------------------------
    vendor_ids: dict[str, uuid.UUID] = {}
    for vendor in data["vendors"]:
        uid = _uid(vendor["id"])
        vendor_ids[vendor["id"]] = uid
        bank = vendor["bank"]
        conn.execute(
            """
            INSERT INTO vendors
              (id, name, category, gstin, phone, email, address, city, state,
               pincode, terms_days, terms_label, bank_name, bank_account_masked,
               bank_ifsc, bank_upi_id, bank_status, bank_changed_at,
               previous_account_masked, last_payment_date, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                uid,
                vendor["name"],
                vendor.get("category"),
                vendor.get("gstin"),
                vendor.get("phone"),
                vendor.get("email"),
                vendor.get("address"),
                vendor.get("city"),
                vendor.get("state"),
                vendor.get("pincode"),
                vendor.get("termsDays", 30),
                vendor.get("termsLabel"),
                bank["bankName"],
                bank["accountMasked"],
                bank["ifsc"],
                bank.get("upiId"),
                bank.get("status", "verified"),
                _timestamp(bank.get("changedAt")),
                bank.get("previousAccountMasked"),
                _date(vendor.get("lastPaymentDate")),
                vendor.get("status", "active"),
            ),
        )

    # Invoices and lines ---------------------------------------------------
    invoice_ids: dict[str, uuid.UUID] = {}
    for invoice in data["invoices"]:
        uid = _uid(invoice["id"])
        invoice_ids[invoice["id"]] = uid
        tax = from_paise(
            invoice["cgstPaise"] + invoice["sgstPaise"] + invoice["igstPaise"]
        )
        conn.execute(
            """
            INSERT INTO invoices
              (id, vendor_id, invoice_number, invoice_number_norm, invoice_date,
               received_date, due_date, terms_days, po_number, grn_number,
               place_of_supply, gst_type, gst_rate, subtotal, cgst, sgst, igst,
               tax_total, round_off, total, stated_total, source, duplicate_of,
               notes, review_state, lifecycle_status, version, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'reviewed',
                    'active', %s, %s)
            """,
            (
                uid,
                vendor_ids[invoice["vendorId"]],
                invoice["invoiceNumber"],
                normalize_invoice_number(invoice["invoiceNumber"]),
                _date(invoice["issueDate"]),
                _date(invoice["receivedDate"]),
                _date(invoice["dueDate"]),
                invoice.get("termsDays", 30),
                invoice.get("poNumber"),
                invoice.get("grnNumber"),
                invoice.get("placeOfSupply"),
                invoice.get("gstType", "intra"),
                invoice.get("gstRate", 18),
                from_paise(invoice["taxablePaise"]),
                from_paise(invoice["cgstPaise"]),
                from_paise(invoice["sgstPaise"]),
                from_paise(invoice["igstPaise"]),
                tax,
                from_paise(invoice["roundOffPaise"]),
                from_paise(invoice["totalPaise"]),
                from_paise(invoice["statedTotalPaise"]),
                invoice.get("source", "email"),
                _uid(invoice["duplicateOf"]) if invoice.get("duplicateOf") else None,
                invoice.get("notes"),
                invoice.get("version", 1),
                actor_ids["Sunita Deshmukh"],
            ),
        )
        for index, line in enumerate(invoice["lines"], start=1):
            conn.execute(
                """
                INSERT INTO invoice_lines
                  (id, invoice_id, line_no, description, hsn, quantity, unit,
                   unit_rate, line_amount, gst_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    _uid(f"{invoice['id']}:line:{line['id']}"),
                    uid,
                    index,
                    line["description"],
                    line.get("hsn"),
                    line["qty"],
                    line.get("unit"),
                    from_paise(line["ratePaise"]),
                    from_paise(line["totalPaise"]),
                    invoice.get("gstRate", 18),
                ),
            )

    # Payments and approvals ----------------------------------------------
    payment_ids: dict[str, uuid.UUID] = {}
    status_map = {
        "simulated": "paid_simulated",
        "approved": "approved",
        "pending_approval": "pending_approval",
        "failed": "failed",
        "rejected": "rejected",
    }
    for payment in data["payments"]:
        uid = _uid(payment["id"])
        payment_ids[payment["id"]] = uid
        invoice_uid = invoice_ids[payment["invoiceId"]]
        invoice = next(
            item for item in data["invoices"] if item["id"] == payment["invoiceId"]
        )
        vendor_uid = vendor_ids[invoice["vendorId"]]
        status = status_map.get(payment["status"], "draft")
        key = f"seed-{str(uid)[:24]}"
        recorded_by = actor_ids.get(
            payment.get("recordedBy", "Sunita Deshmukh"),
            actor_ids["Sunita Deshmukh"],
        )
        approved_by = (
            actor_ids.get(payment.get("approvedBy", "Ramesh Patil"))
            if payment.get("approvedBy")
            else None
        )
        conn.execute(
            """
            INSERT INTO payments
              (id, vendor_id, amount, payment_date, method_label, payment_mode,
               reference, note, status, idempotency_key, request_hash,
               simulated, gateway_reference, paid_at, version, attempt,
               created_by, created_at)
            VALUES (%s, %s, %s, %s, 'SIMULATED', %s, %s, %s, %s, %s, %s,
                    true, %s, %s, 1, %s, %s, %s)
            """,
            (
                uid,
                vendor_uid,
                from_paise(payment["amountPaise"]),
                _date(payment["requestedDate"]),
                payment.get("mode", "NEFT"),
                payment.get("reference", "SEED-REF"),
                payment.get("note"),
                status,
                key,
                request_hash({"seed": payment["id"], "amount": payment["amountPaise"]}),
                payment.get("mockTxnId"),
                _timestamp(payment.get("executedAt")),
                payment.get("attempt", 1),
                recorded_by,
                _timestamp(payment.get("recordedAt")),
            ),
        )
        conn.execute(
            "INSERT INTO payment_allocations (payment_id, invoice_id, amount) "
            "VALUES (%s, %s, %s)",
            (uid, invoice_uid, from_paise(payment["amountPaise"])),
        )
        if status in {"pending_approval", "approved", "paid_simulated"}:
            approval_status = (
                "pending" if status == "pending_approval" else "approved"
            )
            fingerprint = "sha256:" + sha256_json(
                {
                    "seed_payment": payment["id"],
                    "amount": payment["amountPaise"],
                    "invoice": invoice["invoiceNumber"],
                }
            )
            conn.execute(
                """
                INSERT INTO approvals
                  (payment_id, fingerprint, status, requested_by, requested_at,
                   decided_by, decided_at, reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    uid,
                    fingerprint,
                    approval_status,
                    recorded_by,
                    _timestamp(payment.get("recordedAt")),
                    approved_by if approval_status == "approved" else None,
                    _timestamp(payment.get("approvedAt"))
                    if approval_status == "approved"
                    else None,
                    payment.get("rejectionReason"),
                ),
            )

    # Audit history --------------------------------------------------------
    for event in data["audit"]:
        actor = actor_ids.get(event["actor"], SYSTEM_ACTOR_ID)
        entity_id = _uid(event["entityId"])
        conn.execute(
            """
            INSERT INTO audit_logs
              (occurred_at, actor_id, action, entity_type, entity_id, summary,
               after_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                _timestamp(event["at"]),
                actor,
                _action_code(event["action"]),
                _entity_type(event["entityType"]),
                entity_id,
                event["summary"],
                json.dumps({"detail": event.get("detail")} if event.get("detail") else {}),
            ),
        )

    # Seed is intentionally clean of open payment runs. Deterministic findings
    # are generated now so the demo opens with real exceptions visible.
    from .rules import validate_invoice

    for invoice_uid in invoice_ids.values():
        validate_invoice(conn, invoice_uid)

