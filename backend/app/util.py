"""Small helpers for exact money, IDs, hashes and validation."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

MONEY_QUANT = Decimal("0.01")
GSTIN_PATTERN = re.compile(
    r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"
)
UUID_NAMESPACE = uuid.UUID("ef58f9b0-8a78-5b8c-9f5f-38d1d7a0e4c1")


def money(value: Decimal | int | float | str | None) -> Decimal:
    if value is None:
        return Decimal("0.00")
    if isinstance(value, Decimal):
        return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def money_str(value: Decimal | int | float | str | None) -> str:
    return f"{money(value):.2f}"


def to_paise(value: Decimal | int | float | str | None) -> int:
    return int((money(value) * 100).to_integral_value(rounding=ROUND_HALF_UP))


def from_paise(value: int | float) -> Decimal:
    return money(Decimal(int(value)) / Decimal(100))


def normalize_invoice_number(value: str | None) -> str | None:
    if value is None:
        return None
    return re.sub(r"[^A-Z0-9]", "", value.upper()) or None


def validate_gstin(value: str | None) -> bool:
    if not value:
        return True
    return bool(GSTIN_PATTERN.fullmatch(value.strip().upper()))


def stable_uuid(value: str | None) -> uuid.UUID:
    if value:
        try:
            return uuid.UUID(str(value))
        except (ValueError, AttributeError, TypeError):
            pass
    return uuid.uuid5(UUID_NAMESPACE, str(value or uuid.uuid4()))


def now_ist() -> datetime:
    return datetime.now(timezone.utc).astimezone(
        timezone.utc
    )  # timestamps are stored with tz; formatting uses IST in the UI


def today_ist() -> date:
    from datetime import timedelta

    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return value.isoformat()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def request_hash(payload: dict[str, Any]) -> str:
    return sha256_json(payload)


def fingerprint_payment(
    *,
    payment_id: str,
    vendor_id: str,
    invoice_id: str,
    invoice_number: str,
    invoice_total: Decimal,
    amount: Decimal,
    currency: str = "INR",
) -> str:
    body = {
        "payment_id": str(payment_id),
        "vendor_id": str(vendor_id),
        "invoice_id": str(invoice_id),
        "invoice_number": invoice_number,
        "invoice_total": money_str(invoice_total),
        "amount": money_str(amount),
        "currency": currency,
    }
    return "sha256:" + sha256_json(body)


def safe_filename(value: str | None) -> str:
    name = (value or "invoice").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return (name or "invoice")[:120]


def parse_uuid(value: str | uuid.UUID | None) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None
