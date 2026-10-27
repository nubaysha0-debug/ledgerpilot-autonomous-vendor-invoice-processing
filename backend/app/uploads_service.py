"""Safe upload storage and draft-invoice creation."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from .audit import write_audit
from .config import get_settings
from .errors import LedgerError
from .extraction import run_extraction
from .serializers import serialize_invoice
from .util import money, normalize_invoice_number, safe_filename, today_ist
from .workflow import create_extraction_run

ALLOWED = {
    "application/pdf": (".pdf", (b"%PDF-",)),
    "image/png": (".png", (b"\x89PNG\r\n\x1a\n",)),
    "image/jpeg": (".jpg", (b"\xff\xd8\xff",)),
}


def _looks_like_svg(data: bytes) -> bool:
    head = data[:512].lstrip().lower()
    return head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in data[:4096].lower())


def _magic_matches(content_type: str, data: bytes) -> bool:
    signatures = ALLOWED[content_type][1]
    return any(data.startswith(signature) for signature in signatures)


def _parse_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return money(value)
    except Exception:
        return None


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def store_upload(
    conn,
    actor: dict[str, Any],
    *,
    filename: str | None,
    content_type: str | None,
    data: bytes,
    vendor_id: uuid.UUID | None,
    extractor: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    declared = (content_type or "").split(";")[0].strip().lower()
    if declared in {"image/svg+xml", "text/html", "application/xhtml+xml"}:
        raise LedgerError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Only PDF, PNG and JPEG bills are accepted. SVG and HTML are never opened.",
        )
    if declared not in ALLOWED:
        raise LedgerError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "Only PDF, PNG and JPEG bills are accepted.",
            {"content_type": declared or None},
        )
    if not data:
        raise LedgerError(422, "EMPTY_FILE", "The uploaded file is empty.")
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise LedgerError(
            413,
            "FILE_TOO_LARGE",
            f"The file is larger than {settings.max_upload_mb} MB.",
            {"max_mb": settings.max_upload_mb, "size_bytes": len(data)},
        )
    if _looks_like_svg(data):
        raise LedgerError(
            415,
            "UNSUPPORTED_FILE_TYPE",
            "The file contains SVG markup. Only real PDF, PNG and JPEG bills are accepted.",
        )
    if not _magic_matches(declared, data):
        raise LedgerError(
            422,
            "FILE_CONTENT_MISMATCH",
            "The file contents do not match the declared PDF/PNG/JPEG type.",
            {"content_type": declared},
        )

    original = safe_filename(filename)
    extension = ALLOWED[declared][0]
    stored_name = f"{uuid.uuid4().hex}{extension}"
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    target = settings.upload_dir / stored_name
    target.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()

    file_row = conn.execute(
        """
        INSERT INTO uploaded_files
          (original_filename, stored_name, content_type, size_bytes, sha256, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (original, stored_name, declared, len(data), digest, actor["id"]),
    ).fetchone()

    if vendor_id is not None:
        exists = conn.execute("SELECT id FROM vendors WHERE id = %s", (vendor_id,)).fetchone()
        if not exists:
            raise LedgerError(404, "VENDOR_NOT_FOUND", "The vendor was not found.")

    extraction = run_extraction(original, len(data), extractor)
    fields = extraction.get("fields") or {}
    invoice_number = (fields.get("invoice_number") or "").strip() or None
    invoice_date = _parse_date(fields.get("invoice_date"))
    subtotal = _parse_decimal(fields.get("subtotal"))
    tax_total = _parse_decimal(fields.get("tax_total"))
    total = _parse_decimal(fields.get("total"))
    gst_rate = _parse_decimal(fields.get("gst_rate"))
    gst_type = fields.get("gst_type") if fields.get("gst_type") in {"intra", "inter"} else "intra"

    row = conn.execute(
        """
        INSERT INTO invoices
          (vendor_id, invoice_number, invoice_number_norm, invoice_date,
           received_date, due_date, po_number, place_of_supply, gst_type,
           gst_rate, subtotal, cgst, sgst, igst, tax_total, round_off, total,
           stated_total, source, source_file_id, extraction_json, review_state,
           lifecycle_status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, %s, %s, %s, 0, 0, 0, %s, 0,
                %s, %s, 'upload', %s, %s::jsonb, 'unreviewed', 'draft', %s)
        RETURNING *
        """,
        (
            vendor_id,
            invoice_number,
            normalize_invoice_number(invoice_number),
            invoice_date,
            invoice_date or today_ist(),
            _parse_date(fields.get("due_date")),
            fields.get("po_number"),
            gst_type,
            gst_rate,
            subtotal,
            tax_total,
            total,
            total,
            file_row["id"],
            json.dumps(
                {
                    **extraction,
                    "fields": fields,
                    "engine": extraction["engine"],
                    "status": extraction["status"],
                },
                default=str,
            ),
            actor["id"],
        ),
    ).fetchone()

    run_id = create_extraction_run(
        conn,
        actor["id"],
        row["id"],
        extraction["engine"],
        extraction["status"],
        [
            {
                **step,
                "input": step.get("input"),
                "output": step.get("output"),
            }
            for step in extraction["steps"]
        ],
        error="; ".join(extraction["errors"]) or None,
    )
    conn.execute(
        "UPDATE invoices SET extraction_json = %s::jsonb WHERE id = %s",
        (
            json.dumps(
                {**extraction, "fields": fields, "run_id": str(run_id)},
                default=str,
            ),
            row["id"],
        ),
    )
    row = conn.execute("SELECT * FROM invoices WHERE id = %s", (row["id"],)).fetchone()

    write_audit(
        conn,
        actor_id=actor["id"],
        action="invoice.uploaded",
        entity_type="invoice",
        entity_id=row["id"],
        summary=(
            f"Uploaded {original} and created a draft bill. "
            "Every extracted field needs human review."
        ),
        after={
            "source_file_id": str(file_row["id"]),
            "extraction_status": extraction["status"],
            "engine": extraction["engine"],
            "run_id": str(run_id),
        },
    )

    invoice = serialize_invoice(conn, row)
    return {
        "invoice_id": str(row["id"]),
        "lifecycle_status": row["lifecycle_status"],
        "review_state": row["review_state"],
        "source_file": {
            "id": str(file_row["id"]),
            "original_filename": original,
            "content_type": declared,
            "size_bytes": len(data),
            "sha256": digest,
            "url": f"/api/files/{file_row['id']}",
        },
        "extraction": {
            "engine": extraction["engine"],
            "status": extraction["status"],
            "fields": fields,
            "errors": extraction["errors"],
            "attempts": extraction["attempts"],
            "run_id": str(run_id),
            "steps": extraction["steps"],
        },
        "invoice": invoice,
        "next": "Review every field, then PATCH with mark_reviewed=true",
    }
