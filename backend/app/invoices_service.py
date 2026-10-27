"""Vendor and invoice persistence, validation and approval invalidation."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from .audit import write_audit
from .errors import LedgerError
from .rules import (
    balance_row,
    invoice_lines,
    invoice_row,
    validate_invoice,
    vendor_row,
)
from .schemas import InvoiceCreate, InvoiceLineInput, InvoicePatch, PaymentPatch
from .serializers import serialize_invoice, serialize_vendor
from .util import (
    money,
    money_str,
    normalize_invoice_number,
    parse_uuid,
    validate_gstin,
)
from .workflow import cancel_runs_for_payment


def create_vendor(conn, actor: dict[str, Any], payload) -> dict[str, Any]:
    name = payload.name.strip()
    existing = conn.execute(
        "SELECT id FROM vendors WHERE lower(name) = lower(%s)", (name,)
    ).fetchone()
    if existing:
        raise LedgerError(
            409,
            "VENDOR_EXISTS",
            "A vendor with that name already exists.",
            {"vendor_id": str(existing["id"])},
        )
    if payload.gstin and not validate_gstin(payload.gstin):
        raise LedgerError(
            422, "GSTIN_FORMAT", "The vendor GSTIN is not in the expected format."
        )
    row = conn.execute(
        """
        INSERT INTO vendors
          (name, category, gstin, phone, email, address, city, state, pincode,
           terms_days, terms_label, bank_name, bank_account_masked, bank_ifsc,
           bank_upi_id, bank_status, previous_account_masked, status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s)
        RETURNING *
        """,
        (
            name,
            payload.category,
            payload.gstin,
            payload.phone,
            payload.email,
            payload.address,
            payload.city,
            payload.state,
            payload.pincode,
            payload.terms_days,
            payload.terms_label or f"Net {payload.terms_days}",
            payload.bank_name,
            payload.bank_account_masked,
            payload.bank_ifsc,
            payload.bank_upi_id,
            payload.bank_status,
            payload.previous_account_masked,
            payload.status,
        ),
    ).fetchone()
    write_audit(
        conn,
        actor_id=actor["id"],
        action="vendor.created",
        entity_type="vendor",
        entity_id=row["id"],
        summary=f"Vendor {name} added to the supplier master.",
        after={"name": name, "gstin": payload.gstin},
    )
    return serialize_vendor(row)


def patch_vendor(
    conn, actor: dict[str, Any], vendor_id: uuid.UUID, payload
) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM vendors WHERE id = %s FOR UPDATE", (vendor_id,)
    ).fetchone()
    if not row:
        raise LedgerError(404, "VENDOR_NOT_FOUND", "The vendor was not found.")
    updates = payload.model_dump(exclude_unset=True)
    if "gstin" in updates and updates["gstin"] and not validate_gstin(updates["gstin"]):
        raise LedgerError(422, "GSTIN_FORMAT", "The vendor GSTIN is not valid.")
    for key, value in updates.items():
        row[key] = value
    row = conn.execute(
        """
        UPDATE vendors SET name = %s, category = %s, gstin = %s, phone = %s,
          email = %s, address = %s, city = %s, state = %s, pincode = %s,
          terms_days = %s, terms_label = %s, bank_name = %s,
          bank_account_masked = %s, bank_ifsc = %s, bank_upi_id = %s,
          bank_status = %s, previous_account_masked = %s, status = %s,
          updated_at = now()
        WHERE id = %s RETURNING *
        """,
        (
            row["name"],
            row.get("category"),
            row.get("gstin"),
            row.get("phone"),
            row.get("email"),
            row.get("address"),
            row.get("city"),
            row.get("state"),
            row.get("pincode"),
            row.get("terms_days"),
            row.get("terms_label"),
            row.get("bank_name"),
            row.get("bank_account_masked"),
            row.get("bank_ifsc"),
            row.get("bank_upi_id"),
            row.get("bank_status"),
            row.get("previous_account_masked"),
            row.get("status"),
            vendor_id,
        ),
    ).fetchone()
    write_audit(
        conn,
        actor_id=actor["id"],
        action="vendor.updated",
        entity_type="vendor",
        entity_id=vendor_id,
        summary=f"Vendor {row['name']} updated.",
    )
    return serialize_vendor(row)


def verify_vendor_bank(
    conn, actor: dict[str, Any], vendor_id: uuid.UUID
) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM vendors WHERE id = %s FOR UPDATE", (vendor_id,)
    ).fetchone()
    if not row:
        raise LedgerError(404, "VENDOR_NOT_FOUND", "The vendor was not found.")
    conn.execute(
        "UPDATE vendors SET bank_status = 'verified', status = 'active', "
        "updated_at = now() WHERE id = %s",
        (vendor_id,),
    )
    write_audit(
        conn,
        actor_id=actor["id"],
        action="vendor.bank_verified",
        entity_type="vendor",
        entity_id=vendor_id,
        summary=f"Bank account {row['bank_account_masked']} verified for {row['name']} by phone.",
        after={"bank_status": "verified", "status": "active"},
    )
    return serialize_vendor(
        conn.execute("SELECT * FROM vendors WHERE id = %s", (vendor_id,)).fetchone()
    )


def _line_values(
    line: InvoiceLineInput, line_no: int, default_gst_rate: Decimal | None
) -> tuple:
    return (
        line.description.strip(),
        line.hsn,
        line.quantity,
        line.unit,
        money(line.unit_rate),
        money(line.line_amount),
        line.gst_rate if line.gst_rate is not None else default_gst_rate,
        line_no,
    )


def insert_lines(
    conn,
    invoice_id: uuid.UUID,
    lines: list[InvoiceLineInput],
    default_gst_rate: Decimal | None,
) -> None:
    for index, line in enumerate(lines, start=1):
        description, hsn, quantity, unit, rate, amount, gst_rate, line_no = _line_values(
            line, line.line_no or index, default_gst_rate
        )
        conn.execute(
            """
            INSERT INTO invoice_lines
              (invoice_id, line_no, description, hsn, quantity, unit, unit_rate,
               line_amount, gst_rate)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (invoice_id, line_no, description, hsn, quantity, unit, rate, amount, gst_rate),
        )


def create_invoice(conn, actor: dict[str, Any], payload: InvoiceCreate) -> dict[str, Any]:
    vendor = vendor_row(conn, payload.vendor_id)
    if not vendor:
        raise LedgerError(404, "VENDOR_NOT_FOUND", "The vendor was not found.")
    if payload.due_date and payload.due_date < payload.invoice_date:
        raise LedgerError(422, "DATE_SANITY", "Due date cannot be before the invoice date.")
    if payload.duplicate_of:
        if not invoice_row(conn, payload.duplicate_of):
            raise LedgerError(404, "DUPLICATE_TARGET_NOT_FOUND", "The original invoice was not found.")
    if payload.mark_reviewed:
        missing = [
            name
            for name, value in {
                "vendor_id": payload.vendor_id,
                "invoice_number": payload.invoice_number,
                "invoice_date": payload.invoice_date,
                "total": payload.total,
            }.items()
            if not value
        ]
        if missing:
            raise LedgerError(
                422,
                "REQ_FIELD_MISSING",
                "The invoice cannot be marked reviewed while required fields are missing.",
                {"missing": missing},
            )
    received = payload.received_date or payload.invoice_date
    row = conn.execute(
        """
        INSERT INTO invoices
          (vendor_id, invoice_number, invoice_number_norm, invoice_date,
           received_date, due_date, terms_days, po_number, grn_number,
           place_of_supply, gst_type, gst_rate, subtotal, cgst, sgst, igst,
           tax_total, round_off, total, stated_total, source, duplicate_of,
           source_file_id, notes, review_state, lifecycle_status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            payload.vendor_id,
            payload.invoice_number.strip(),
            normalize_invoice_number(payload.invoice_number),
            payload.invoice_date,
            received,
            payload.due_date,
            payload.terms_days,
            payload.po_number,
            payload.grn_number,
            payload.place_of_supply or f"{vendor['state']} (27)",
            payload.gst_type,
            payload.gst_rate,
            money(payload.subtotal),
            money(payload.cgst),
            money(payload.sgst),
            money(payload.igst),
            money(payload.tax_total),
            money(payload.round_off),
            money(payload.total),
            money(payload.stated_total if payload.stated_total is not None else payload.total),
            payload.source,
            payload.duplicate_of,
            payload.source_file_id,
            payload.notes,
            "reviewed" if payload.mark_reviewed else "unreviewed",
            "active" if payload.mark_reviewed else "draft",
            actor["id"],
        ),
    ).fetchone()
    insert_lines(conn, row["id"], payload.lines, payload.gst_rate)
    validate_invoice(conn, row["id"])
    write_audit(
        conn,
        actor_id=actor["id"],
        action="invoice.created",
        entity_type="invoice",
        entity_id=row["id"],
        summary=(
            f"Invoice {row['invoice_number']} from {vendor['name']} recorded "
            f"for ₹{money_str(row['total'])}."
        ),
        after={
            "vendor_id": str(payload.vendor_id),
            "total": money_str(row["total"]),
            "source": payload.source,
        },
    )
    return serialize_invoice(conn, row)


def invalidate_invoice_approvals(
    conn, invoice_id: uuid.UUID, actor: dict[str, Any], reason: str
) -> tuple[list[str], list[str]]:
    payments = conn.execute(
        "SELECT p.id, p.status FROM payments p "
        "JOIN payment_allocations a ON a.payment_id = p.id "
        "WHERE a.invoice_id = %s AND p.status IN "
        "('pending_approval','approved','failed') FOR UPDATE",
        (invoice_id,),
    ).fetchall()
    invalidated = []
    cancelled_runs = []
    for payment in payments:
        approvals = conn.execute(
            "UPDATE approvals SET status = 'invalidated', "
            "invalidated_reason = %s WHERE payment_id = %s "
            "AND status IN ('pending','approved') RETURNING id",
            (reason, payment["id"]),
        ).fetchall()
        if approvals:
            invalidated.extend(str(row["id"]) for row in approvals)
        conn.execute(
            "UPDATE payments SET status = 'draft', version = version + 1, "
            "updated_at = now() WHERE id = %s",
            (payment["id"],),
        )
        run_id = cancel_runs_for_payment(conn, payment["id"], reason)
        if run_id:
            cancelled_runs.append(run_id)
        write_audit(
            conn,
            actor_id=actor["id"],
            action="payment.approval_invalidated",
            entity_type="payment",
            entity_id=payment["id"],
            summary=f"Approval invalidated after invoice change: {reason}",
            run_id=parse_uuid(run_id) if run_id else None,
        )
    return invalidated, cancelled_runs


def patch_invoice(
    conn,
    actor: dict[str, Any],
    invoice_id: uuid.UUID,
    payload: InvoicePatch,
    correlation_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    current = conn.execute(
        "SELECT * FROM invoices WHERE id = %s FOR UPDATE", (invoice_id,)
    ).fetchone()
    if not current:
        raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")
    if payload.version != current["version"]:
        raise LedgerError(
            409,
            "VERSION_CONFLICT",
            "The invoice was edited by someone else. Reload and try again.",
            {"current": serialize_invoice(conn, current)},
        )
    if payload.lifecycle_status == "void":
        balance = balance_row(conn, invoice_id)
        if money(balance["paid_amount"]) > 0:
            raise LedgerError(
                409,
                "INVOICE_HAS_PAID_ALLOCATIONS",
                "An invoice with simulated payments cannot be voided.",
            )

    fields = payload.model_dump(exclude_unset=True)
    fields.pop("version", None)
    fields.pop("lines", None)
    fields.pop("mark_reviewed", None)
    fields.pop("lifecycle_status", None)
    merged = dict(current)
    merged.update(fields)
    if payload.mark_reviewed is True:
        merged["review_state"] = "reviewed"
        if current["lifecycle_status"] == "draft":
            merged["lifecycle_status"] = "active"
    elif payload.mark_reviewed is False:
        merged["review_state"] = "unreviewed"
        merged["lifecycle_status"] = "draft"
    if payload.lifecycle_status:
        merged["lifecycle_status"] = payload.lifecycle_status
    if "invoice_number" in fields and fields["invoice_number"]:
        merged["invoice_number_norm"] = normalize_invoice_number(fields["invoice_number"])
    if "total" in fields and payload.stated_total is None:
        merged["stated_total"] = fields["total"]
    if merged["lifecycle_status"] == "active":
        missing = [
            name
            for name, value in {
                "vendor_id": merged.get("vendor_id"),
                "invoice_number": merged.get("invoice_number"),
                "invoice_date": merged.get("invoice_date"),
                "total": merged.get("total"),
            }.items()
            if not value
        ]
        if missing:
            raise LedgerError(
                422,
                "REQ_FIELD_MISSING",
                "The invoice cannot be active while required fields are missing.",
                {"missing": missing},
            )
        if merged.get("review_state") != "reviewed":
            raise LedgerError(
                422,
                "EXTRACTION_UNREVIEWED",
                "Mark the invoice reviewed before activating it.",
            )
    if merged.get("due_date") and merged.get("invoice_date") and merged["due_date"] < merged["invoice_date"]:
        raise LedgerError(422, "DATE_SANITY", "Due date cannot be before the invoice date.")

    balance = balance_row(conn, invoice_id)
    if money(merged.get("total")) < money(balance["paid_amount"]):
        raise LedgerError(
            409,
            "INVOICE_HAS_PAID_ALLOCATIONS",
            "The invoice total cannot be lower than payments already simulated against it.",
            {
                "paid_amount": money_str(balance["paid_amount"]),
                "new_total": money_str(merged.get("total")),
            },
        )

    material = False
    for key in ("vendor_id", "invoice_number", "subtotal", "tax_total", "total", "duplicate_of"):
        if str(current.get(key)) != str(merged.get(key)):
            material = True
            break
    if payload.lines is not None:
        material = True
    if payload.lifecycle_status == "void":
        material = True

    update_values = {
        "vendor_id": merged.get("vendor_id"),
        "invoice_number": merged.get("invoice_number"),
        "invoice_number_norm": merged.get("invoice_number_norm"),
        "invoice_date": merged.get("invoice_date"),
        "received_date": merged.get("received_date"),
        "due_date": merged.get("due_date"),
        "terms_days": merged.get("terms_days"),
        "po_number": merged.get("po_number"),
        "grn_number": merged.get("grn_number"),
        "place_of_supply": merged.get("place_of_supply"),
        "gst_type": merged.get("gst_type"),
        "gst_rate": merged.get("gst_rate"),
        "subtotal": merged.get("subtotal"),
        "cgst": merged.get("cgst"),
        "sgst": merged.get("sgst"),
        "igst": merged.get("igst"),
        "tax_total": merged.get("tax_total"),
        "round_off": merged.get("round_off"),
        "total": merged.get("total"),
        "stated_total": merged.get("stated_total"),
        "notes": merged.get("notes"),
        "duplicate_of": merged.get("duplicate_of"),
        "review_state": merged.get("review_state"),
        "lifecycle_status": merged.get("lifecycle_status"),
        "version": current["version"] + 1,
    }
    row = conn.execute(
        """
        UPDATE invoices SET vendor_id = %s, invoice_number = %s,
          invoice_number_norm = %s, invoice_date = %s, received_date = %s,
          due_date = %s, terms_days = %s, po_number = %s, grn_number = %s,
          place_of_supply = %s, gst_type = %s, gst_rate = %s, subtotal = %s,
          cgst = %s, sgst = %s, igst = %s, tax_total = %s, round_off = %s,
          total = %s, stated_total = %s, notes = %s, duplicate_of = %s,
          review_state = %s, lifecycle_status = %s, version = %s,
          updated_at = now()
        WHERE id = %s RETURNING *
        """,
        (
            update_values["vendor_id"],
            update_values["invoice_number"],
            update_values["invoice_number_norm"],
            update_values["invoice_date"],
            update_values["received_date"],
            update_values["due_date"],
            update_values["terms_days"],
            update_values["po_number"],
            update_values["grn_number"],
            update_values["place_of_supply"],
            update_values["gst_type"],
            update_values["gst_rate"],
            update_values["subtotal"],
            update_values["cgst"],
            update_values["sgst"],
            update_values["igst"],
            update_values["tax_total"],
            update_values["round_off"],
            update_values["total"],
            update_values["stated_total"],
            update_values["notes"],
            update_values["duplicate_of"],
            update_values["review_state"],
            update_values["lifecycle_status"],
            update_values["version"],
            invoice_id,
        ),
    ).fetchone()
    if payload.lines is not None:
        conn.execute("DELETE FROM invoice_lines WHERE invoice_id = %s", (invoice_id,))
        insert_lines(conn, invoice_id, payload.lines, row.get("gst_rate"))
    validate_invoice(conn, invoice_id)

    invalidated: list[str] = []
    cancelled_runs: list[str] = []
    if material and payload.lifecycle_status != "void":
        invalidated, cancelled_runs = invalidate_invoice_approvals(
            conn,
            invoice_id,
            actor,
            "The invoice amount, number or vendor changed after approval.",
        )
    if payload.lifecycle_status == "void":
        invalidated, cancelled_runs = invalidate_invoice_approvals(
            conn,
            invoice_id,
            actor,
            "The invoice was voided.",
        )

    write_audit(
        conn,
        actor_id=actor["id"],
        action="invoice.reviewed" if payload.mark_reviewed else "invoice.updated",
        entity_type="invoice",
        entity_id=invoice_id,
        summary=(
            f"Invoice {row['invoice_number']} updated to version {row['version']}."
        ),
        before={
            "version": current["version"],
            "total": money_str(current.get("total")),
            "vendor_id": str(current.get("vendor_id")),
        },
        after={
            "version": row["version"],
            "total": money_str(row.get("total")),
            "vendor_id": str(row.get("vendor_id")),
            "approvals_invalidated": invalidated,
            "detail": "A material edit makes prior approvals stale.",
        },
        correlation_id=correlation_id,
    )
    detail = serialize_invoice(conn, row)
    detail["approvals_invalidated"] = invalidated
    detail["runs_cancelled"] = cancelled_runs
    return detail


def revise_invoice(
    conn, actor: dict[str, Any], invoice_id: uuid.UUID
) -> dict[str, Any]:
    """Add a demo freight revision and invalidate any existing approvals."""
    from .util import money_str

    current = conn.execute(
        "SELECT * FROM invoices WHERE id = %s FOR UPDATE", (invoice_id,)
    ).fetchone()
    if not current:
        raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")
    if current["duplicate_of"]:
        raise LedgerError(
            409, "DUPLICATE_NOT_REVISABLE", "A duplicate copy cannot be revised."
        )
    lines = conn.execute(
        "SELECT * FROM invoice_lines WHERE invoice_id = %s ORDER BY line_no",
        (invoice_id,),
    ).fetchall()
    next_line = max((line["line_no"] for line in lines), default=0) + 1
    freight = money(500)
    gst_rate = money(current.get("gst_rate") or 18)
    conn.execute(
        """
        INSERT INTO invoice_lines
          (invoice_id, line_no, description, hsn, quantity, unit, unit_rate,
           line_amount, gst_rate)
        VALUES (%s, %s, 'Additional freight (supplier revision)', '9965', 1,
                'lot', %s, %s, %s)
        """,
        (invoice_id, next_line, freight, freight, gst_rate),
    )
    line_total = money(
        conn.execute(
            "SELECT COALESCE(SUM(line_amount), 0) AS total FROM invoice_lines "
            "WHERE invoice_id = %s",
            (invoice_id,),
        ).fetchone()["total"]
    )
    tax = money(line_total * gst_rate / Decimal("100"))
    if current.get("gst_type") == "inter":
        cgst = money(0)
        sgst = money(0)
        igst = tax
    else:
        cgst = money(tax / 2)
        sgst = money(tax - cgst)
        igst = money(0)
    total = money(line_total + cgst + sgst + igst)
    row = conn.execute(
        """
        UPDATE invoices SET subtotal = %s, cgst = %s, sgst = %s, igst = %s,
          tax_total = %s, total = %s, stated_total = %s, round_off = 0,
          version = version + 1,
          notes = trim(COALESCE(notes, '') || ' Supplier added ₹500.00 freight after approval.'),
          updated_at = now()
        WHERE id = %s RETURNING *
        """,
        (line_total, cgst, sgst, igst, tax, total, total, invoice_id),
    ).fetchone()
    validate_invoice(conn, invoice_id)
    invalidated, cancelled_runs = invalidate_invoice_approvals(
        conn,
        invoice_id,
        actor,
        "The supplier revised the invoice after approval.",
    )
    write_audit(
        conn,
        actor_id=actor["id"],
        action="invoice.revised",
        entity_type="invoice",
        entity_id=invoice_id,
        summary=(
            f"Invoice {row['invoice_number']} revised by the supplier: ₹500.00 "
            f"freight added. New total ₹{money_str(row['total'])}."
        ),
        before={"version": current["version"], "total": money_str(current.get("total"))},
        after={
            "version": row["version"],
            "total": money_str(row["total"]),
            "approvals_invalidated": invalidated,
        },
    )
    detail = serialize_invoice(conn, row)
    detail["approvals_invalidated"] = invalidated
    detail["runs_cancelled"] = cancelled_runs
    return detail


def acknowledge_finding(
    conn, actor: dict[str, Any], finding_id: uuid.UUID, note: str
) -> dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM invoice_findings WHERE id = %s FOR UPDATE", (finding_id,)
    ).fetchone()
    if not row:
        raise LedgerError(404, "FINDING_NOT_FOUND", "The finding was not found.")
    if row["status"] != "open":
        raise LedgerError(
            409,
            "FINDING_NOT_OPEN",
            "Only an open finding can be acknowledged.",
            {"status": row["status"]},
        )
    note = note.strip()
    if not note:
        raise LedgerError(422, "NOTE_REQUIRED", "Acknowledge with a short note.")
    row = conn.execute(
        "UPDATE invoice_findings SET status = 'acknowledged', "
        "acknowledged_by = %s, acknowledged_note = %s, acknowledged_at = now() "
        "WHERE id = %s RETURNING *",
        (actor["id"], note, finding_id),
    ).fetchone()
    write_audit(
        conn,
        actor_id=actor["id"],
        action="finding.acknowledged",
        entity_type="invoice",
        entity_id=row["invoice_id"],
        summary=f"Exception {row['rule_code']} acknowledged: {note}",
        after={"finding_id": str(row["id"]), "status": "acknowledged"},
    )
    from .serializers import serialize_finding

    return serialize_finding(row)


def list_invoices(
    conn,
    *,
    filter_name: str | None = None,
    vendor_id: str | None = None,
    query: str | None = None,
    limit: int = 50,
    cursor: str | None = None,
) -> dict[str, Any]:
    limit = max(1, min(limit, 200))
    offset = 0
    if cursor:
        try:
            offset = max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
        except Exception:
            offset = 0
    clauses = ["i.lifecycle_status <> 'void'"]
    params: list[Any] = []
    if filter_name == "open":
        clauses.append("i.duplicate_of IS NULL AND b.outstanding > 0")
    elif filter_name == "overdue":
        clauses.append("i.duplicate_of IS NULL AND b.outstanding > 0 AND b.is_overdue")
    elif filter_name == "settled":
        clauses.append("b.outstanding <= 0")
    elif filter_name == "pending_approval":
        clauses.append(
            "EXISTS (SELECT 1 FROM payments p JOIN payment_allocations pa "
            "ON pa.payment_id = p.id WHERE pa.invoice_id = i.id "
            "AND p.status = 'pending_approval')"
        )
    elif filter_name == "needs_review":
        clauses.append("f.needs_review")
    elif filter_name:
        raise LedgerError(422, "FILTER_INVALID", "Unknown invoice filter.")
    if vendor_id:
        parsed = parse_uuid(vendor_id)
        if not parsed:
            raise LedgerError(422, "VENDOR_ID_INVALID", "vendor_id must be a UUID.")
        clauses.append("i.vendor_id = %s")
        params.append(parsed)
    if query:
        clauses.append("(i.invoice_number ILIKE %s OR v.name ILIKE %s)")
        pattern = f"%{query.strip()}%"
        params.extend([pattern, pattern])
    where = " WHERE " + " AND ".join(clauses)
    rows = conn.execute(
        f"""
        SELECT i.* FROM invoices i
        JOIN invoice_balances b ON b.invoice_id = i.id
        JOIN invoice_flags f ON f.invoice_id = i.id
        LEFT JOIN vendors v ON v.id = i.vendor_id
        {where}
        ORDER BY i.invoice_date DESC NULLS LAST, i.created_at DESC
        LIMIT %s OFFSET %s
        """,
        (*params, limit + 1, offset),
    ).fetchall()
    has_more = len(rows) > limit
    rows = rows[:limit]
    from .serializers import serialize_invoice_summary

    items = [serialize_invoice_summary(conn, row) for row in rows]
    next_cursor = (
        base64.urlsafe_b64encode(str(offset + limit).encode()).decode()
        if has_more
        else None
    )
    return {"items": items, "next_cursor": next_cursor}
