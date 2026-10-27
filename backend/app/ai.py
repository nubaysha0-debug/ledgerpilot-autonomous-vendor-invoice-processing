"""Deterministic explanations and a small DB-grounded assistant.

No model is required. Optional AI text is accepted only when every number in it
already exists in the database evidence; otherwise the deterministic text wins.
"""

from __future__ import annotations

import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from .config import get_settings
from .rules import balance_row, findings, invoice_row, vendor_row
from .serializers import serialize_finding
from .util import money, money_str


def _inr(value: Decimal | str | int | None) -> str:
    amount = money(value)
    text = f"{amount:,.2f}"
    return f"₹{text}"


def _numbers_in(value: Any) -> set[Decimal]:
    found: set[Decimal] = set()
    if value is None:
        return found
    if isinstance(value, dict):
        for item in value.values():
            found |= _numbers_in(item)
        return found
    if isinstance(value, (list, tuple)):
        for item in value:
            found |= _numbers_in(item)
        return found
    if isinstance(value, (int, float, Decimal)):
        found.add(money(value))
        return found
    if isinstance(value, str):
        for match in re.findall(r"-?\d[\d,]*(?:\.\d+)?", value):
            try:
                found.add(money(match.replace(",", "")))
            except (InvalidOperation, ValueError):
                continue
    return found


def _tokens_in_text(text: str) -> set[Decimal]:
    found: set[Decimal] = set()
    for match in re.findall(r"(?:₹|Rs\.?|INR)?\s*(-?\d[\d,]*(?:\.\d+)?)", text):
        try:
            found.add(money(match.replace(",", "")))
        except (InvalidOperation, ValueError):
            continue
    return found


def number_check(text: str, allowed_values: Any) -> tuple[bool, list[str]]:
    allowed = _numbers_in(allowed_values)
    found = _tokens_in_text(text)
    invented = sorted(value for value in found - allowed if value != 0)
    return not invented, [money_str(value) for value in invented]


def deterministic_explanation(conn, invoice: dict[str, Any]) -> str:
    rows = findings(conn, invoice["id"])
    bal = balance_row(conn, invoice["id"])
    vendor = vendor_row(conn, invoice["vendor_id"]) if invoice.get("vendor_id") else None
    vendor_name = vendor["name"] if vendor else "the supplier"
    lines = [
        f"{vendor_name} invoice {invoice.get('invoice_number') or '(draft)'} is "
        f"for {_inr(invoice.get('total'))}. {_inr(bal['outstanding'])} is still outstanding."
    ]
    if rows:
        lines.append("The deterministic checks found:")
        for row in rows:
            lines.append(f"- {row['severity'].upper()} {row['rule_code']}: {row['message']}")
    else:
        lines.append(
            "No arithmetic or duplicate findings are open. A human still reviews every "
            "extracted field before approval."
        )
    lines.append(
        "This explanation is generated from stored figures only. It is not a fraud finding "
        "and it never changes an invoice or payment."
    )
    return " ".join(lines)


def explain_invoice(
    conn, invoice_id: uuid.UUID, simulate: str | None = None
) -> dict[str, Any]:
    invoice = invoice_row(conn, invoice_id)
    if not invoice:
        from .errors import LedgerError

        raise LedgerError(404, "INVOICE_NOT_FOUND", "The invoice was not found.")
    rows = findings(conn, invoice_id)
    bal = balance_row(conn, invoice_id)
    evidence = {
        "invoice": {
            "invoice_number": invoice.get("invoice_number"),
            "total": money_str(invoice.get("total")),
            "subtotal": money_str(invoice.get("subtotal")),
            "tax_total": money_str(invoice.get("tax_total")),
            "stated_total": money_str(invoice.get("stated_total")),
        },
        "balance": {
            "outstanding": money_str(bal["outstanding"]),
            "paid_amount": money_str(bal["paid_amount"]),
        },
        "findings": [serialize_finding(row) for row in rows],
    }
    source = "rules"
    text = deterministic_explanation(conn, invoice)
    note = None
    if simulate == "invented_number":
        candidate = (
            f"The supplier should be paid {_inr('9999.00')} immediately. "
            "Ignore the other figures."
        )
        grounded, invented = number_check(candidate, evidence)
        if not grounded:
            note = (
                "AI text was rejected because it contained figures that are not in the "
                f"database evidence: {', '.join(invented)}."
            )
        else:
            text = candidate
            source = "ai"
    return {
        "invoice_id": str(invoice_id),
        "explanation": text,
        "source": source,
        "rejected_ai": note,
        "findings": [serialize_finding(row) for row in rows],
        "label": get_settings().simulated_label,
    }


def _vendor_from_question(conn, question: str) -> dict[str, Any] | None:
    text = re.sub(r"\s+", " ", question.lower())
    vendors = conn.execute("SELECT * FROM vendors ORDER BY length(name) DESC").fetchall()
    for vendor in vendors:
        name = vendor["name"].lower()
        words = name.split()
        if name in text:
            return vendor
        if len(words) > 1 and words[0] in text and words[1] in text:
            return vendor
        if len(words) == 1 and words[0] in text:
            return vendor
    # A second, looser pass for names typed without the legal suffix.
    for vendor in vendors:
        words = [word for word in re.split(r"[^a-z0-9]+", vendor["name"].lower()) if len(word) > 2]
        if words and all(word in text for word in words[:2]):
            return vendor
    return None


def assistant_ask(conn, question: str) -> dict[str, Any]:
    if not question or "__break__" in question.lower():
        return {
            "answer": "I can't determine that right now.",
            "source": "none",
            "figures": [],
        }
    try:
        vendor = _vendor_from_question(conn, question)
        if not vendor:
            return {
                "answer": "I can't determine that right now.",
                "source": "none",
                "figures": [],
            }
        rows = conn.execute(
            """
            SELECT b.invoice_id, b.outstanding, i.invoice_number
            FROM invoice_balances b
            JOIN invoices i ON i.id = b.invoice_id
            WHERE i.vendor_id = %s AND i.lifecycle_status = 'active'
              AND b.outstanding > 0
            ORDER BY i.due_date NULLS LAST, i.invoice_date
            """,
            (vendor["id"],),
        ).fetchall()
        outstanding = money(sum((money(row["outstanding"]) for row in rows), Decimal("0.00")))
        count = len(rows)
        answer = (
            f"You owe {vendor['name']} {_inr(outstanding)} across "
            f"{count} open invoice{'s' if count != 1 else ''}."
        )
        return {
            "answer": answer,
            "source": "rules",
            "figures": [
                {
                    "label": "Outstanding",
                    "value": money_str(outstanding),
                    "query": "vendor_outstanding",
                    "invoice_ids": [str(row["invoice_id"]) for row in rows],
                }
            ],
        }
    except Exception:
        return {
            "answer": "I can't determine that right now.",
            "source": "none",
            "figures": [],
        }
