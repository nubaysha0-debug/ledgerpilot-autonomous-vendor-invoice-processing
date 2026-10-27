"""Workspace import/restore and business-profile updates.

The browser still previews CSV files locally, then sends the validated,
normalised workspace here. PostgreSQL remains the source of truth.
"""

from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from .audit import write_audit
from .errors import LedgerError
from .rules import validate_invoice
from .serializers import serialize_workspace
from .util import (
    from_paise,
    money,
    money_str,
    normalize_invoice_number,
    request_hash,
    sha256_json,
    stable_uuid,
    validate_gstin,
)


def _uid(value: str | None) -> uuid.UUID:
    if value:
        try:
            return uuid.UUID(str(value))
        except (ValueError, TypeError):
            pass
    return stable_uuid(f"workspace:{value or uuid.uuid4()}")


def _date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def truncate_domain(conn) -> None:
    conn.execute(
        """
        TRUNCATE TABLE
          audit_logs, workflow_steps, workflow_runs, mock_gateway_ledger,
          payment_attempts, approvals, payment_allocations, payments,
          invoice_findings, invoice_lines, invoices, uploaded_files, vendors
        RESTART IDENTITY CASCADE
        """
    )


def _actor_ids(conn) -> dict[str, uuid.UUID]:
    rows = conn.execute("SELECT id, display_name, role FROM app_users").fetchall()
    mapping = {row["display_name"]: row["id"] for row in rows}
    owner = next((row["id"] for row in rows if row["role"] == "owner"), None)
    if owner:
        mapping["Owner"] = owner
        mapping["owner"] = owner
    return mapping


def replace_workspace(conn, actor: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    vendors = state.get("vendors") or []
    invoices = state.get("invoices") or []
    payments = state.get("payments") or []
    if not isinstance(vendors, list) or not isinstance(invoices, list):
        raise LedgerError(422, "WORKSPACE_INVALID", "vendors and invoices must be arrays.")
    if not vendors:
        raise LedgerError(422, "WORKSPACE_INVALID", "The imported workspace has no vendors.")

    names = [str(vendor.get("name") or "").strip().lower() for vendor in vendors]
    if any(not name for name in names):
        raise LedgerError(422, "WORKSPACE_INVALID", "Every vendor needs a name.")
    if len(set(names)) != len(names):
        raise LedgerError(
            422,
            "WORKSPACE_INVALID",
            "Two vendors in the import have the same name. Fix the CSV and preview again.",
        )

    business = state.get("business")
    if business:
        _update_business_values(conn, actor, business, audit=False)

    truncate_domain(conn)
    actor_map = _actor_ids(conn)
    vendor_ids: dict[str, uuid.UUID] = {}
    for vendor in vendors:
        vendor_uid = _uid(vendor.get("id"))
        vendor_ids[str(vendor.get("id"))] = vendor_uid
        bank = vendor.get("bank") or {}
        gstin = (vendor.get("gstin") or "").strip().upper() or None
        if gstin and not validate_gstin(gstin):
            raise LedgerError(
                422,
                "GSTIN_FORMAT",
                f"Vendor {vendor.get('name')} has an invalid GSTIN.",
            )
        conn.execute(
            """
            INSERT INTO vendors
              (id, name, category, gstin, phone, email, address, city, state,
               pincode, terms_days, terms_label, bank_name, bank_account_masked,
               bank_ifsc, bank_upi_id, bank_status, previous_account_masked,
               last_payment_date, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s)
            """,
            (
                vendor_uid,
                str(vendor.get("name")).strip(),
                vendor.get("category"),
                gstin,
                vendor.get("phone"),
                vendor.get("email"),
                vendor.get("address"),
                vendor.get("city"),
                vendor.get("state"),
                vendor.get("pincode"),
                int(vendor.get("termsDays") or 30),
                vendor.get("termsLabel") or f"Net {int(vendor.get('termsDays') or 30)}",
                bank.get("bankName") or "SIMULATED BANK",
                bank.get("accountMasked") or "**** 0000",
                bank.get("ifsc") or "SIMU0000001",
                bank.get("upiId"),
                bank.get("status") or "verified",
                bank.get("previousAccountMasked"),
                _date(vendor.get("lastPaymentDate")),
                vendor.get("status") or "active",
            ),
        )

    invoice_ids: dict[str, uuid.UUID] = {}
    duplicate_links: list[tuple[uuid.UUID, str]] = []
    for invoice in invoices:
        invoice_uid = _uid(invoice.get("id"))
        invoice_ids[str(invoice.get("id"))] = invoice_uid
        if invoice.get("duplicateOf"):
            duplicate_links.append((invoice_uid, str(invoice.get("duplicateOf"))))
        vendor_uid = vendor_ids.get(str(invoice.get("vendorId")))
        total_hint = from_paise(invoice.get("totalPaise") or 0)
        lifecycle_hint = str(invoice.get("lifecycleStatus") or "").strip().lower()
        is_draft = lifecycle_hint == "draft" or (not lifecycle_hint and total_hint <= 0)
        if not vendor_uid and not is_draft:
            raise LedgerError(
                422,
                "WORKSPACE_INVALID",
                f"Invoice {invoice.get('invoiceNumber')} refers to an unknown vendor.",
            )
        total = from_paise(invoice.get("totalPaise") or 0)
        lifecycle = str(invoice.get("lifecycleStatus") or "").strip().lower()
        if lifecycle not in {"draft", "active", "void"}:
            lifecycle = "active" if total > 0 else "draft"
        if total <= 0 and lifecycle != "draft":
            raise LedgerError(
                422,
                "WORKSPACE_INVALID",
                f"Invoice {invoice.get('invoiceNumber')} has no total.",
            )
        subtotal = from_paise(invoice.get("taxablePaise") or 0)
        cgst = from_paise(invoice.get("cgstPaise") or 0)
        sgst = from_paise(invoice.get("sgstPaise") or 0)
        igst = from_paise(invoice.get("igstPaise") or 0)
        tax_total = money(cgst + sgst + igst)
        number = str(invoice.get("invoiceNumber") or "").strip() or None
        if number == "(draft)":
            number = None
        issue = _date(invoice.get("issueDate"))
        received = _date(invoice.get("receivedDate")) or issue
        review_state = str(invoice.get("reviewState") or "").strip().lower()
        if review_state not in {"unreviewed", "reviewed"}:
            review_state = "reviewed" if lifecycle == "active" else "unreviewed"
        total_value = total if total > 0 else None
        conn.execute(
            """
            INSERT INTO invoices
              (id, vendor_id, invoice_number, invoice_number_norm, invoice_date,
               received_date, due_date, terms_days, po_number, grn_number,
               place_of_supply, gst_type, gst_rate, subtotal, cgst, sgst, igst,
               tax_total, round_off, total, stated_total, source, duplicate_of,
               notes, review_state, lifecycle_status, version, created_by,
               extraction_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, NULL)
            """,
            (
                invoice_uid,
                vendor_uid,
                number,
                normalize_invoice_number(number),
                issue,
                received,
                _date(invoice.get("dueDate")),
                int(invoice.get("termsDays") or 30),
                invoice.get("poNumber"),
                invoice.get("grnNumber"),
                invoice.get("placeOfSupply"),
                invoice.get("gstType") or "intra",
                invoice.get("gstRate") or 18,
                subtotal,
                cgst,
                sgst,
                igst,
                tax_total,
                from_paise(invoice.get("roundOffPaise") or 0),
                total_value,
                from_paise(invoice.get("statedTotalPaise") or invoice.get("totalPaise") or 0),
                invoice.get("source") or "manual",
                None,
                invoice.get("notes"),
                review_state,
                lifecycle,
                int(invoice.get("version") or 1),
                actor["id"],
            ),
        )
        for index, line in enumerate(invoice.get("lines") or [], start=1):
            conn.execute(
                """
                INSERT INTO invoice_lines
                  (invoice_id, line_no, description, hsn, quantity, unit,
                   unit_rate, line_amount, gst_rate)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    invoice_uid,
                    index,
                    line.get("description") or "Imported line",
                    line.get("hsn"),
                    line.get("qty") or 1,
                    line.get("unit"),
                    from_paise(line.get("ratePaise") or 0),
                    from_paise(line.get("totalPaise") or 0),
                    invoice.get("gstRate") or 18,
                ),
            )

    for invoice_uid, duplicate_ref in duplicate_links:
        target = invoice_ids.get(duplicate_ref)
        if not target and duplicate_ref:
            try:
                target = uuid.UUID(duplicate_ref)
            except (ValueError, TypeError):
                target = None
        if target:
            conn.execute(
                "UPDATE invoices SET duplicate_of = %s WHERE id = %s",
                (target, invoice_uid),
            )

    status_map = {
        "simulated": "paid_simulated",
        "pending_approval": "pending_approval",
        "approved": "approved",
        "failed": "failed",
        "rejected": "rejected",
    }
    for payment in payments:
        invoice_uid = invoice_ids.get(str(payment.get("invoiceId")))
        if not invoice_uid:
            continue
        invoice = next(
            (item for item in invoices if str(item.get("id")) == str(payment.get("invoiceId"))),
            None,
        )
        vendor_uid = vendor_ids.get(str(invoice.get("vendorId"))) if invoice else None
        if not vendor_uid:
            continue
        payment_uid = _uid(payment.get("id"))
        amount = from_paise(payment.get("amountPaise") or 0)
        if amount <= 0:
            continue
        status = status_map.get(payment.get("status"), "draft")
        key = f"import-{str(payment_uid)}"
        recorded_by = actor_map.get(str(payment.get("recordedBy")), actor["id"])
        gateway_reference = None
        paid_at = None
        if status == "paid_simulated":
            gateway_reference = payment.get("mockTxnId") or f"MOCK-{str(payment_uid)[:8].upper()}"
            paid_at = _timestamp(payment.get("executedAt")) or datetime.now().astimezone()
        conn.execute(
            """
            INSERT INTO payments
              (id, vendor_id, amount, payment_date, method_label, payment_mode,
               reference, note, status, idempotency_key, request_hash, simulated,
               gateway_reference, paid_at, version, attempt, created_by, created_at)
            VALUES (%s, %s, %s, %s, 'SIMULATED', %s, %s, %s, %s, %s, %s, true,
                    %s, %s, 1, %s, %s, %s)
            """,
            (
                payment_uid,
                vendor_uid,
                amount,
                _date(payment.get("requestedDate")),
                payment.get("mode") or "NEFT",
                payment.get("reference") or "IMPORTED",
                payment.get("note"),
                status,
                key,
                request_hash({"import": str(payment_uid), "amount": money_str(amount)}),
                gateway_reference,
                paid_at,
                int(payment.get("attempt") or 1),
                recorded_by,
                _timestamp(payment.get("recordedAt")) or datetime.now().astimezone(),
            ),
        )
        conn.execute(
            "INSERT INTO payment_allocations (payment_id, invoice_id, amount) "
            "VALUES (%s, %s, %s)",
            (payment_uid, invoice_uid, amount),
        )
        fingerprint = payment.get("approvalFingerprint") or (
            "sha256:" + sha256_json({"import_payment": str(payment_uid), "amount": money_str(amount)})
        )
        owner_id = actor_map.get("Owner") or actor["id"]
        if status in {"pending_approval", "approved", "paid_simulated"}:
            approval_status = "pending" if status == "pending_approval" else "approved"
            conn.execute(
                """
                INSERT INTO approvals
                  (payment_id, fingerprint, status, requested_by, requested_at,
                   decided_by, decided_at, reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NULL)
                """,
                (
                    payment_uid,
                    fingerprint,
                    approval_status,
                    recorded_by,
                    _timestamp(payment.get("recordedAt")) or datetime.now().astimezone(),
                    owner_id if approval_status == "approved" else None,
                    _timestamp(payment.get("approvedAt")) if approval_status == "approved" else None,
                ),
            )
        elif status == "rejected" and payment.get("rejectionReason"):
            conn.execute(
                """
                INSERT INTO approvals
                  (payment_id, fingerprint, status, requested_by, requested_at,
                   decided_by, decided_at, reason)
                VALUES (%s, %s, 'rejected', %s, now(), %s, now(), %s)
                """,
                (
                    payment_uid,
                    fingerprint,
                    recorded_by,
                    owner_id,
                    str(payment.get("rejectionReason")),
                ),
            )

    for invoice_uid in invoice_ids.values():
        validate_invoice(conn, invoice_uid)

    for event in state.get("audit") or []:
        try:
            conn.execute(
                """
                INSERT INTO audit_logs
                  (occurred_at, actor_id, action, entity_type, entity_id, summary,
                   after_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    _timestamp(event.get("at")) or datetime.now().astimezone(),
                    actor_map.get(str(event.get("actor")), actor["id"]),
                    event.get("action") or "workspace.event",
                    event.get("entityType") or "workspace",
                    _uid(event.get("entityId")),
                    event.get("summary") or "Imported event",
                    json.dumps({"detail": event.get("detail")} if event.get("detail") else {}),
                ),
            )
        except Exception:
            continue

    write_audit(
        conn,
        actor_id=actor["id"],
        action="workspace.imported",
        entity_type="workspace",
        entity_id=uuid.uuid4(),
        summary=(
            f"Workspace imported with {len(vendors)} vendors, {len(invoices)} invoices "
            f"and {len(payments)} payments."
        ),
        after={"vendors": len(vendors), "invoices": len(invoices), "payments": len(payments)},
    )
    return serialize_workspace(conn)


def _update_business_values(
    conn, actor: dict[str, Any], payload: dict[str, Any], *, audit: bool = True
) -> dict[str, Any]:
    current = conn.execute(
        "SELECT * FROM business_settings WHERE id = 'primary' FOR UPDATE"
    ).fetchone()
    if not current:
        raise LedgerError(
            503,
            "SEED_REQUIRED",
            "The business profile is missing. Run POST /api/demo/reset.",
        )
    mapping = {
        "name": "name",
        "legal_name": "legal_name",
        "gstin": "gstin",
        "address": "address",
        "city": "city",
        "state": "state",
        "pincode": "pincode",
        "phone": "phone",
        "email": "email",
        "fy": "fy",
        "as_of": "as_of",
        "bank_name": "bank_name",
        "bank_account_masked": "bank_account_masked",
        "bank_ifsc": "bank_ifsc",
        "bank_upi_id": "bank_upi_id",
    }
    merged = dict(current)
    for key, column in mapping.items():
        if key in payload and payload[key] is not None:
            merged[column] = payload[key]
    gstin = str(merged.get("gstin") or "").strip().upper()
    if not validate_gstin(gstin):
        raise LedgerError(422, "GSTIN_FORMAT", "The business GSTIN is not valid.")
    as_of = merged.get("as_of")
    if isinstance(as_of, str):
        as_of = _timestamp(as_of)
    if not as_of:
        raise LedgerError(422, "DATE_SANITY", "as_of must be an ISO-8601 timestamp.")
    conn.execute(
        """
        UPDATE business_settings SET
          name = %s, legal_name = %s, gstin = %s, address = %s, city = %s,
          state = %s, pincode = %s, phone = %s, email = %s, fy = %s,
          as_of = %s, bank_name = %s, bank_account_masked = %s, bank_ifsc = %s,
          bank_upi_id = %s, updated_at = now()
        WHERE id = 'primary'
        """,
        (
            merged["name"],
            merged.get("legal_name") or merged["name"],
            gstin,
            merged["address"],
            merged["city"],
            merged["state"],
            merged["pincode"],
            merged["phone"],
            merged["email"],
            merged["fy"],
            as_of,
            merged["bank_name"],
            merged["bank_account_masked"],
            merged["bank_ifsc"],
            merged.get("bank_upi_id"),
        ),
    )
    row = conn.execute(
        "SELECT * FROM business_settings WHERE id = 'primary'"
    ).fetchone()
    if audit:
        write_audit(
            conn,
            actor_id=actor["id"],
            action="business.updated",
            entity_type="business",
            entity_id=uuid.uuid4(),
            summary=f"Business profile updated for {row['name']}.",
            after={"gstin": row["gstin"], "as_of": str(row["as_of"])},
        )
    return row


def update_business(conn, actor: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    row = _update_business_values(conn, actor, payload, audit=True)
    from .serializers import serialize_business

    return serialize_business(row)


def toggle_force_failure(conn, actor: dict[str, Any]) -> dict[str, Any]:
    row = conn.execute(
        "UPDATE business_settings SET force_next_failure = NOT force_next_failure, "
        "updated_at = now() WHERE id = 'primary' RETURNING *"
    ).fetchone()
    if not row:
        raise LedgerError(503, "SEED_REQUIRED", "Run POST /api/demo/reset first.")
    write_audit(
        conn,
        actor_id=actor["id"],
        action="demo.failure_toggled",
        entity_type="business",
        entity_id=uuid.uuid4(),
        summary=(
            "The next simulated transfer will be forced to fail by the mock gateway."
            if row["force_next_failure"]
            else "The forced failure was disarmed."
        ),
        after={"force_next_failure": bool(row["force_next_failure"])},
    )
    return {"force_next_failure": bool(row["force_next_failure"])}
