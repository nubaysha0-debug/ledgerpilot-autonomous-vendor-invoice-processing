"""Invoice, upload and payment-draft routes."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Body, File, Form, Header, Query, UploadFile
from fastapi.responses import JSONResponse

from ..ai import explain_invoice
from ..config import get_settings
from ..db import read_connection, transaction
from ..deps import actor, owner, service_response
from ..errors import LedgerError
from ..invoices_service import (
    create_invoice,
    list_invoices,
    patch_invoice,
    revise_invoice,
)
from ..payments_service import create_payment_draft
from ..rules import invoice_row, latest_payments, validate_invoice
from ..schemas import InvoiceCreate, InvoicePatch, PaymentCreate, require_role
from ..serializers import serialize_invoice, serialize_payment
from ..uploads_service import store_upload

router = APIRouter(prefix="/api/invoices", tags=["invoices"])


@router.get("")
def get_invoices(
    filter_name: str | None = Query(default=None, alias="filter"),
    vendor_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = Query(default=None),
) -> dict[str, Any]:
    with read_connection() as conn:
        return list_invoices(
            conn,
            filter_name=filter_name,
            vendor_id=vendor_id,
            query=q,
            limit=limit,
            cursor=cursor,
        )


@router.post("", status_code=201)
def post_invoice(
    payload: InvoiceCreate,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        return create_invoice(conn, actor_row, payload)


@router.post("/upload", status_code=201)
async def upload_invoice(
    file: UploadFile = File(...),
    vendor_id: str | None = Form(default=None),
    extractor: str | None = Form(default=None),
    x_actor_id: str | None = Header(default=None),
) -> JSONResponse:
    data = await file.read()
    parsed_vendor = None
    if vendor_id:
        try:
            parsed_vendor = uuid.UUID(vendor_id)
        except (ValueError, TypeError):
            raise LedgerError(422, "VENDOR_ID_INVALID", "vendor_id must be a UUID.")
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        result = store_upload(
            conn,
            actor_row,
            filename=file.filename,
            content_type=file.content_type,
            data=data,
            vendor_id=parsed_vendor,
            extractor=extractor,
        )
        return JSONResponse(status_code=201, content=result)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: uuid.UUID) -> dict[str, Any]:
    with read_connection() as conn:
        row = invoice_row(conn, invoice_id)
        if not row:
            raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")
        return serialize_invoice(conn, row)


@router.patch("/{invoice_id}")
def patch_invoice_route(
    invoice_id: uuid.UUID,
    payload: InvoicePatch,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        return patch_invoice(conn, actor_row, invoice_id, payload)


@router.post("/{invoice_id}/validate")
def validate_invoice_route(invoice_id: uuid.UUID) -> dict[str, Any]:
    with transaction() as conn:
        row = invoice_row(conn, invoice_id)
        if not row:
            raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")
        validate_invoice(conn, invoice_id)
        row = invoice_row(conn, invoice_id)
        return serialize_invoice(conn, row)


@router.get("/{invoice_id}/payments")
def get_invoice_payments(invoice_id: uuid.UUID) -> dict[str, Any]:
    with read_connection() as conn:
        if not invoice_row(conn, invoice_id):
            raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")
        rows = latest_payments(conn, invoice_id)
        return {
            "items": [serialize_payment(conn, row) for row in rows],
            "next_cursor": None,
        }


@router.post("/{invoice_id}/payments")
def post_invoice_payment(
    invoice_id: uuid.UUID,
    payload: PaymentCreate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    x_actor_id: str | None = Header(default=None),
) -> JSONResponse:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        status, body = create_payment_draft(
            conn, actor_row, invoice_id, payload, idempotency_key
        )
        return service_response(status, body)


@router.post("/{invoice_id}/revise")
def revise_invoice_route(
    invoice_id: uuid.UUID,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        owner(actor_row)
        return revise_invoice(conn, actor_row, invoice_id)


@router.post("/{invoice_id}/explain")
def explain_invoice_route(
    invoice_id: uuid.UUID,
    payload: dict[str, Any] | None = Body(default=None),
) -> dict[str, Any]:
    simulate = (payload or {}).get("simulate") if isinstance(payload, dict) else None
    with read_connection() as conn:
        return explain_invoice(conn, invoice_id, simulate=simulate)
