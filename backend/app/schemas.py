"""Pydantic request models and actor helpers."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import Header
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from .errors import LedgerError
from .util import money, validate_gstin

Money = Annotated[
    Decimal,
    PlainSerializer(lambda value: f"{money(value):.2f}", return_type=str),
]

Role = Literal["owner", "staff", "system", "accountant"]
PaymentMode = Literal["NEFT", "UPI", "RTGS", "Cheque", "Cash"]


class Actor(BaseModel):
    id: uuid.UUID
    name: str
    role: Role


def actor_id_header(x_actor_id: str | None = Header(default=None)) -> str | None:
    return x_actor_id


def actor_from_conn(conn, actor_id: str | None) -> dict[str, Any]:
    if not actor_id:
        raise LedgerError(401, "ACTOR_REQUIRED", "Send X-Actor-Id from GET /api/users.")
    try:
        parsed = uuid.UUID(actor_id)
    except (ValueError, TypeError):
        raise LedgerError(401, "ACTOR_REQUIRED", "X-Actor-Id is not a valid user id.")
    row = conn.execute(
        "SELECT id, display_name, role FROM app_users WHERE id = %s", (parsed,)
    ).fetchone()
    if not row:
        raise LedgerError(401, "ACTOR_REQUIRED", "The acting user was not found.")
    return row


def require_role(actor: dict[str, Any], roles: set[str]) -> None:
    if actor["role"] not in roles:
        raise LedgerError(
            403,
            "ROLE_NOT_ALLOWED",
            "This action is not allowed for the acting role.",
            {"role": actor["role"], "allowed": sorted(roles)},
        )


class VendorCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    gstin: str | None = None
    phone: str | None = None
    email: str | None = None
    category: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    terms_days: int = Field(default=30, ge=0, le=365)
    terms_label: str | None = None
    bank_name: str = "SIMULATED BANK"
    bank_account_masked: str = "**** 0000"
    bank_ifsc: str = "SIMU0000001"
    bank_upi_id: str | None = None
    bank_status: Literal["verified", "changed"] = "verified"
    previous_account_masked: str | None = None
    status: Literal["active", "verify"] = "active"

    @field_validator("gstin")
    @classmethod
    def gstin_format(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip().upper()
            if not validate_gstin(value):
                raise ValueError("GSTIN must be a 15-character format-valid value.")
        return value


class VendorPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    gstin: str | None = None
    phone: str | None = None
    email: str | None = None
    category: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    terms_days: int | None = Field(default=None, ge=0, le=365)
    terms_label: str | None = None
    bank_name: str | None = None
    bank_account_masked: str | None = None
    bank_ifsc: str | None = None
    bank_upi_id: str | None = None
    bank_status: Literal["verified", "changed"] | None = None
    previous_account_masked: str | None = None
    status: Literal["active", "verify"] | None = None


class InvoiceLineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line_no: int | None = Field(default=None, ge=1)
    description: str = Field(min_length=1, max_length=500)
    hsn: str | None = None
    quantity: Decimal = Field(gt=0)
    unit: str | None = None
    unit_rate: Money
    line_amount: Money
    gst_rate: Money | None = None


class InvoiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vendor_id: uuid.UUID
    invoice_number: str = Field(min_length=1, max_length=120)
    invoice_date: date
    received_date: date | None = None
    due_date: date | None = None
    terms_days: int | None = Field(default=None, ge=0, le=365)
    po_number: str | None = None
    grn_number: str | None = None
    place_of_supply: str | None = None
    gst_type: Literal["intra", "inter"] = "intra"
    gst_rate: Money | None = Decimal("18.00")
    subtotal: Money
    cgst: Money = Decimal("0.00")
    sgst: Money = Decimal("0.00")
    igst: Money = Decimal("0.00")
    tax_total: Money
    round_off: Money = Decimal("0.00")
    total: Money
    stated_total: Money | None = None
    notes: str | None = None
    source: Literal["manual", "upload", "email"] = "manual"
    duplicate_of: uuid.UUID | None = None
    mark_reviewed: bool = True
    lines: list[InvoiceLineInput] = Field(default_factory=list)
    source_file_id: uuid.UUID | None = None


class InvoicePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=1)
    vendor_id: uuid.UUID | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    received_date: date | None = None
    due_date: date | None = None
    terms_days: int | None = Field(default=None, ge=0, le=365)
    po_number: str | None = None
    grn_number: str | None = None
    place_of_supply: str | None = None
    gst_type: Literal["intra", "inter"] | None = None
    gst_rate: Money | None = None
    subtotal: Money | None = None
    cgst: Money | None = None
    sgst: Money | None = None
    igst: Money | None = None
    tax_total: Money | None = None
    round_off: Money | None = None
    total: Money | None = None
    stated_total: Money | None = None
    notes: str | None = None
    duplicate_of: uuid.UUID | None = None
    mark_reviewed: bool | None = None
    lines: list[InvoiceLineInput] | None = None
    lifecycle_status: Literal["active", "void"] | None = None


class FindingAcknowledge(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str = Field(min_length=1, max_length=1000)


class PaymentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: Money
    payment_date: date
    note: str | None = None
    mode: PaymentMode = "NEFT"
    reference: str | None = None


class PaymentPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=1)
    amount: Money | None = None
    payment_date: date | None = None
    note: str | None = None
    cancel: bool | None = None
    status: Any | None = None


class RunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_type: Literal["payment_request"] = "payment_request"
    payment_id: uuid.UUID


class ApprovalDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["approve", "reject"]
    fingerprint: str = Field(min_length=10)
    reason: str | None = None


class ExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    simulate: Literal["fail_once"] | None = None


class BusinessPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    gstin: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    phone: str | None = None
    email: str | None = None
    fy: str | None = None
    as_of: str | None = None
    bank_name: str | None = None
    bank_account_masked: str | None = None
    bank_ifsc: str | None = None
    bank_upi_id: str | None = None
    bank: dict[str, Any] | None = None


class WorkspaceImport(BaseModel):
    model_config = ConfigDict(extra="allow")
    vendors: list[dict[str, Any]]
    invoices: list[dict[str, Any]]
    payments: list[dict[str, Any]] = Field(default_factory=list)
    audit: list[dict[str, Any]] = Field(default_factory=list)
    business: dict[str, Any] | None = None
