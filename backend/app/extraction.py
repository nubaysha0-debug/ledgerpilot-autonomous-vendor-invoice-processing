"""Upload extraction with an explicit manual fallback.

The demo never depends on an AI service. EXTRACTOR=mock returns deterministic
fields, EXTRACTOR=off skips extraction, and the upload accepts an `extractor`
override only in DEMO_MODE so acceptance tests can exercise failure paths.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .config import get_settings
from .util import money_str, today_ist


class ExtractionLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=1, max_length=500)
    hsn: str | None = None
    quantity: Decimal = Field(gt=0)
    unit: str | None = None
    unit_rate: Decimal
    line_amount: Decimal
    gst_rate: Decimal | None = None


class ExtractionFields(BaseModel):
    model_config = ConfigDict(extra="forbid")
    vendor_name: str | None = None
    vendor_gstin: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    po_number: str | None = None
    gst_type: str | None = None
    gst_rate: Decimal | None = None
    subtotal: Decimal | None = None
    tax_total: Decimal | None = None
    total: Decimal | None = None
    lines: list[ExtractionLine] = Field(default_factory=list)


def _mock_payload(filename: str, size: int) -> dict[str, Any]:
    stem = re.sub(r"[^A-Za-z0-9]+", "-", filename.rsplit(".", 1)[0]).strip("-").upper()
    number = f"INV-{stem[:18] or 'UPLOAD'}-{size % 1000:03d}"
    return {
        "vendor_name": None,
        "vendor_gstin": None,
        "invoice_number": number,
        "invoice_date": today_ist().isoformat(),
        "due_date": None,
        "po_number": None,
        "gst_type": "intra",
        "gst_rate": "18.00",
        "subtotal": "10000.00",
        "tax_total": "1800.00",
        "total": "11800.00",
        "lines": [],
    }


def _garbage_payloads() -> list[Any]:
    return [
        "{not valid json",
        {"invoice_number": 12345, "total": {"amount": "9900.00"}},
        {
            "invoice_number": "INV-GARBAGE",
            "total": "9900.00",
            "invented_extra_field": "AI invented this",
        },
    ]


def _validate_payload(payload: Any) -> tuple[ExtractionFields | None, list[str]]:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError as exc:
            return None, [f"Invalid JSON: {exc.msg}"]
    try:
        return ExtractionFields.model_validate(payload), []
    except ValidationError as exc:
        return None, [
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()
        ]


def run_extraction(
    filename: str,
    size_bytes: int,
    engine_override: str | None = None,
) -> dict[str, Any]:
    """Return extraction metadata. Never raises for extraction failures."""
    settings = get_settings()
    engine = (engine_override or settings.extractor or "mock").strip().lower()
    if engine not in {"mock", "off", "garbage"}:
        engine = "mock"
    steps: list[dict[str, Any]] = []
    errors: list[str] = []
    fields: dict[str, Any] = {}
    status = "ok"
    attempts = 0

    if engine == "off":
        status = "skipped"
        steps.append(
            {
                "name": "extract",
                "status": "skipped",
                "explanation": "Extraction is turned off. Enter the bill manually.",
            }
        )
    elif engine == "garbage":
        attempts = 3
        steps.append(
            {
                "name": "extract",
                "status": "done",
                "output": {"engine": "mock", "mode": "garbage"},
                "explanation": "The mock extractor returned deliberately malformed output.",
            }
        )
        for attempt, payload in enumerate(_garbage_payloads(), start=1):
            parsed, problems = _validate_payload(payload)
            steps.append(
                {
                    "name": "ai_output_rejected",
                    "status": "failed",
                    "input": {"attempt": attempt, "payload": payload},
                    "error": "; ".join(problems),
                    "explanation": "Rejected by the extraction schema. The record was not changed.",
                }
            )
            errors.extend(problems)
        status = "failed"
        steps.append(
            {
                "name": "manual_fallback",
                "status": "done",
                "explanation": "AI output was discarded. The original file and blank bill remain.",
            }
        )
    else:
        payload = _mock_payload(filename, size_bytes)
        parsed, problems = _validate_payload(payload)
        steps.append(
            {
                "name": "extract",
                "status": "done",
                "output": {"engine": "mock"},
                "explanation": "The deterministic mock extractor read placeholder fields.",
            }
        )
        if parsed is None:
            status = "failed"
            errors.extend(problems)
            steps.append(
                {
                    "name": "ai_output_rejected",
                    "status": "failed",
                    "error": "; ".join(problems),
                    "explanation": "Mock output failed schema validation.",
                }
            )
        else:
            fields = parsed.model_dump(mode="json")
            steps.append(
                {
                    "name": "validate_ai_output",
                    "status": "done",
                    "output": {"field_count": len(fields)},
                    "explanation": "Schema-validated. Every field still needs human review.",
                }
            )

    return {
        "engine": engine,
        "status": status,
        "fields": fields,
        "errors": errors,
        "attempts": attempts,
        "steps": steps,
        "label": (
            "Extraction failed. Enter the bill manually."
            if status == "failed"
            else "Extraction complete. Check every field."
        ),
    }
