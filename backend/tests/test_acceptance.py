"""Acceptance tests T01-T31 for the LedgerPilot API.

Each test starts from POST /api/demo/reset. The suite intentionally uses the
real HTTP contract, real PostgreSQL constraints and the real subprocess app, so
a passing run is evidence for the demo gates rather than a mock-only check.
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import uuid
from decimal import Decimal
from pathlib import Path

import pytest

from .conftest import API, PDF_BYTES, PNG_BYTES, ROOT, SVG_BYTES


def _error(response) -> dict:
    body = response.json()
    assert "error" in body, body
    return body["error"]


# ---------------------------------------------------------------------------
# T01-T05: persistence, upload and deterministic findings
# ---------------------------------------------------------------------------


def test_t01_manual_vendor_and_invoice_persist_across_restart(api: API):
    vendor = api.data(
        "POST",
        "/api/vendors",
        expected=201,
        headers=api.h("accountant"),
        json={
            "name": f"Test Electricals {uuid.uuid4().hex[:6]}",
            "gstin": "27AABCT1234D1Z5",
            "city": "Nashik",
            "state": "Maharashtra",
            "terms_days": 15,
        },
    )
    invoice = api.create_invoice(
        vendor_id=vendor["id"], number="INV200", total="1770.00", actor="accountant"
    )
    assert invoice["version"] == 1
    assert invoice["balance"]["outstanding"] == "1770.00"

    before = api.invoice(invoice["id"])
    api.restart()

    after = api.invoice(invoice["id"])
    for key in (
        "invoice_number",
        "vendor_id",
        "invoice_date",
        "total",
        "stated_total",
        "version",
        "review_state",
        "lifecycle_status",
    ):
        assert after[key] == before[key], key
    assert api.data("GET", f"/api/vendors/{vendor['id']}")["name"] == vendor["name"]
    assert any(row["action"] == "invoice.created" for row in api.audit_rows(invoice["id"]))


def test_t02_upload_edit_keeps_original_and_extraction(api: API):
    vendor = api.vendor()
    response = api.upload(filename="bill-241.png", vendor_id=vendor["id"])
    assert response.status_code == 201, response.text
    uploaded = response.json()
    assert uploaded["lifecycle_status"] == "draft"
    assert uploaded["extraction"]["status"] == "ok"
    source = uploaded["source_file"]
    invoice = uploaded["invoice"]
    original = api.get(f"/api/files/{source['id']}")
    assert original.status_code == 200
    assert hashlib.sha256(original.content).hexdigest() == source["sha256"]

    patched = api.data(
        "PATCH",
        f"/api/invoices/{invoice['id']}",
        headers=api.h("accountant"),
        json={
            "version": invoice["version"],
            "invoice_number": "INV-UPLOAD-EDIT",
            "notes": "Human corrected the extracted number.",
            "mark_reviewed": True,
        },
    )
    assert patched["invoice_number"] == "INV-UPLOAD-EDIT"
    assert patched["lifecycle_status"] == "active"
    assert patched["review_state"] == "reviewed"
    assert patched["source_file_id"] == source["id"]
    assert patched["extraction_json"] is not None
    assert patched["extraction_json"]["fields"]["total"] == "11800.00"
    source_after = api.get(f"/api/files/{source['id']}")
    assert source_after.content == original.content
    actions = [row["action"] for row in api.audit_rows(invoice["id"])]
    assert "invoice.reviewed" in actions


def test_t03_extractor_off_manual_fallback(api: API):
    vendor = api.vendor()
    response = api.upload(filename="manual.png", vendor_id=vendor["id"], extractor="off")
    assert response.status_code == 201, response.text
    uploaded = response.json()
    assert uploaded["extraction"]["status"] == "skipped"
    invoice = uploaded["invoice"]
    assert invoice["lifecycle_status"] == "draft"
    assert invoice["total"] == "0.00"

    patched = api.data(
        "PATCH",
        f"/api/invoices/{invoice['id']}",
        headers=api.h("accountant"),
        json={
            "version": invoice["version"],
            "invoice_number": "MANUAL-001",
            "invoice_date": "2026-10-20",
            "received_date": "2026-10-20",
            "due_date": "2026-11-04",
            "gst_rate": "18.00",
            "subtotal": "10000.00",
            "tax_total": "1800.00",
            "total": "11800.00",
            "stated_total": "11800.00",
            "mark_reviewed": True,
        },
    )
    assert patched["lifecycle_status"] == "active"
    assert patched["review_state"] == "reviewed"
    assert patched["total"] == "11800.00"
    assert patched["source"] == "upload"


def test_t04_arithmetic_mismatch_blocks_until_acknowledged(api: API):
    sharma = next(i for i in api.invoices() if i["invoice_number"] == "Sharma/26-27/0412")
    detail = api.invoice(sharma["id"])
    finding = next(f for f in detail["findings"] if f["rule_code"] == "ARITH_TOTAL_MISMATCH")
    assert finding["evidence"]["expected_total"] == "21995.20"
    assert finding["evidence"]["stated_total"] == "22130.00"
    assert finding["evidence"]["difference"] == "134.80"

    payment, _ = api.draft_payment(sharma["id"], "100.00")
    blocked = api.request(
        "POST", "/api/runs", headers=api.h("accountant"), json={"payment_id": payment["id"]}
    )
    assert blocked.status_code == 409, blocked.text
    assert _error(blocked)["code"] == "INVOICE_HAS_BLOCKING_FINDINGS"
    assert any(
        item["rule_code"] == "ARITH_TOTAL_MISMATCH"
        for item in _error(blocked)["details"]["findings"]
    )

    acknowledged = api.data(
        "POST",
        f"/api/findings/{finding['id']}/acknowledge",
        headers=api.h("staff"),
        json={"note": "Supplier confirmed the difference on the phone."},
    )
    assert acknowledged["status"] == "acknowledged"

    run = api.start_run(payment["id"])
    assert run["status"] == "waiting_approval"


def test_t05_duplicate_is_a_warning_and_both_rows_survive(api: API):
    vendor = api.vendor()
    first = api.create_invoice(
        vendor_id=vendor["id"], number="INV-104", total="12500.00", invoice_date="2026-10-05"
    )
    second = api.create_invoice(
        vendor_id=vendor["id"], number="INV-104", total="12500.00", invoice_date="2026-10-08"
    )
    duplicate = next(
        finding
        for finding in second["findings"]
        if finding["rule_code"] == "DUP_SAME_VENDOR_NUMBER"
    )
    assert duplicate["severity"] == "warning"
    assert duplicate["evidence"]["matches"][0]["invoice_id"] == first["id"]
    assert second["duplicate_candidates"][0]["invoice_id"] == first["id"]
    rows = [row for row in api.invoices("INV-104") if row["invoice_number"] == "INV-104"]
    assert {row["id"] for row in rows} >= {first["id"], second["id"]}


# ---------------------------------------------------------------------------
# T06-T10: decimal balances, partial payments and unpaid totals
# ---------------------------------------------------------------------------


def test_t06_partial_payment_leaves_7500(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T06", total="12500.00")
    payment, key = api.draft_payment(invoice["id"], "5000.00")
    api.start_run(payment["id"])
    api.approve(payment["id"])
    executed = api.execute(payment["id"], key)
    assert executed.status_code == 200, executed.text
    body = executed.json()
    assert body["payment"]["status"] == "paid_simulated"
    assert body["payment"]["gateway_reference"]
    assert body["payment"]["simulated"] is True

    after = api.invoice(invoice["id"])
    assert after["balance"]["outstanding"] == "7500.00"
    assert after["balance"]["payment_status"] == "partially_paid"
    assert any(row["action"] == "payment.executed" for row in api.audit_rows(payment["id"]))


def test_t07_two_partials_then_over_allocation(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T07", total="12500.00")
    for amount in ("5000.00", "7500.00"):
        payment, key = api.draft_payment(invoice["id"], amount)
        api.start_run(payment["id"])
        api.approve(payment["id"])
        assert api.execute(payment["id"], key).status_code == 200
    after = api.invoice(invoice["id"])
    assert after["balance"]["outstanding"] == "0.00"
    assert after["balance"]["payment_status"] == "settled"

    over = api.request(
        "POST",
        f"/api/invoices/{invoice['id']}/payments",
        headers=api.h("accountant", **{"Idempotency-Key": str(uuid.uuid4())}),
        json={"amount": "0.01", "payment_date": "2026-10-27", "mode": "NEFT"},
    )
    assert over.status_code == 409, over.text
    assert _error(over)["code"] == "OVER_ALLOCATION"


def test_t08_over_allocation_counts_in_flight_payments(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T08", total="12500.00")
    too_much = api.request(
        "POST",
        f"/api/invoices/{invoice['id']}/payments",
        headers=api.h("accountant", **{"Idempotency-Key": str(uuid.uuid4())}),
        json={"amount": "12500.01", "payment_date": "2026-10-27", "mode": "NEFT"},
    )
    assert too_much.status_code == 409
    assert _error(too_much)["code"] == "OVER_ALLOCATION"

    first, _ = api.draft_payment(invoice["id"], "8000.00")
    api.start_run(first["id"])
    second = api.request(
        "POST",
        f"/api/invoices/{invoice['id']}/payments",
        headers=api.h("accountant", **{"Idempotency-Key": str(uuid.uuid4())}),
        json={"amount": "8000.00", "payment_date": "2026-10-27", "mode": "NEFT"},
    )
    assert second.status_code == 409, second.text
    details = _error(second)["details"]
    assert details["available"] == "4500.00"
    assert details["committed"] == "8000.00"


def test_t09_decimal_exactness_three_way_settlement(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T09", total="3000.60")
    for amount in ("1000.10", "2000.20", "0.30"):
        payment, key = api.draft_payment(invoice["id"], amount)
        api.start_run(payment["id"])
        api.approve(payment["id"])
        response = api.execute(payment["id"], key)
        assert response.status_code == 200, response.text
        balance = response.json()["invoice_balance"]
        assert re.fullmatch(r"\d+\.\d{2}", balance["outstanding"])

    after = api.invoice(invoice["id"])
    assert after["balance"]["paid_amount"] == "3000.60"
    assert after["balance"]["outstanding"] == "0.00"
    assert after["balance"]["payment_status"] == "settled"
    for payment in after["payments"]:
        assert payment["amount"] in {"1000.10", "2000.20", "0.30"}


def test_t10_unpaid_invoice_is_counted_in_total_dues(api: API):
    deccan = next(i for i in api.invoices() if i["invoice_number"] == "DPT/26-27/0559")
    detail = api.invoice(deccan["id"])
    assert detail["balance"]["outstanding"] == detail["total"] == "36816.00"
    assert detail["balance"]["paid_amount"] == "0.00"
    assert detail["balance"]["payment_status"] == "unpaid"

    dashboard = api.data("GET", "/api/dashboard/summary")
    open_rows = api.data("GET", "/api/invoices?filter=open&limit=200")["items"]
    total_open = sum((Decimal(row["balance"]["outstanding"]) for row in open_rows), Decimal("0.00"))
    assert Decimal(dashboard["totals"]["total_dues"]) == total_open
    assert any(row["id"] == deccan["id"] for row in open_rows)


# ---------------------------------------------------------------------------
# T11-T16: approvals, roles and stale fingerprints
# ---------------------------------------------------------------------------


def test_t11_execute_without_owner_approval_is_denied(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T11", total="5000.00")
    payment, key = api.draft_payment(invoice["id"], "5000.00")
    denied = api.execute(payment["id"], key)
    assert denied.status_code == 409, denied.text
    assert _error(denied)["code"] == "APPROVAL_REQUIRED"

    after = api.data("GET", f"/api/payments/{payment['id']}")
    assert after["status"] == "draft"
    assert after["attempts"] == []
    actions = [row["action"] for row in api.audit_rows(payment["id"])]
    assert "payment.execution_denied" in actions


def test_t12_role_bypass_and_forged_status_are_rejected(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T12", total="5000.00")
    payment, _ = api.draft_payment(invoice["id"], "5000.00")
    api.start_run(payment["id"])
    approval = api.pending_approval(payment["id"])
    decision = {"decision": "approve", "fingerprint": approval["fingerprint"]}

    staff = api.request(
        "POST", f"/api/approvals/{approval['id']}/decision", headers=api.h("staff"), json=decision
    )
    assert staff.status_code == 403, staff.text
    assert _error(staff)["code"] == "ROLE_NOT_ALLOWED"

    system = api.request(
        "POST", f"/api/approvals/{approval['id']}/decision", headers=api.h("system"), json=decision
    )
    assert system.status_code == 403

    current = api.data("GET", f"/api/payments/{payment['id']}")
    forged = api.request(
        "PATCH",
        f"/api/payments/{payment['id']}",
        headers=api.h("owner"),
        json={"version": current["version"], "status": "paid_simulated"},
    )
    assert forged.status_code == 422, forged.text
    assert _error(forged)["code"] == "FORGED_FIELD"

    assert api.data("GET", f"/api/payments/{payment['id']}")["status"] == "pending_approval"
    assert api.pending_approval(payment["id"])["status"] == "pending"


def test_t13_amount_change_invalidates_approval_and_cancels_run(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T13", total="12500.00")
    payment, key = api.draft_payment(invoice["id"], "5000.00")
    run = api.start_run(payment["id"])
    api.approve(payment["id"])

    current = api.data("GET", f"/api/payments/{payment['id']}")
    changed = api.data(
        "PATCH",
        f"/api/payments/{payment['id']}",
        headers=api.h("accountant"),
        json={"version": current["version"], "amount": "6000.00"},
    )
    assert changed["status"] == "draft"
    assert changed["amount"] == "6000.00"
    assert changed["approval_invalidated"] is True
    assert changed["run_cancelled"] == run["id"]

    denied = api.execute(payment["id"], key)
    assert denied.status_code == 409
    assert _error(denied)["code"] == "APPROVAL_REQUIRED"
    assert api.data("GET", f"/api/runs/{run['id']}")["status"] == "cancelled"


def test_t14_invoice_change_after_approval_is_stale(api: API, api_conn):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T14", total="12500.00")
    payment, key = api.draft_payment(invoice["id"], "5000.00")
    api.start_run(payment["id"])
    api.approve(payment["id"])

    api_conn.execute(
        "UPDATE invoices SET total = total + 100, stated_total = stated_total + 100 WHERE id = %s",
        (invoice["id"],),
    )
    api_conn.commit()

    stale = api.execute(payment["id"], key)
    assert stale.status_code == 409, stale.text
    assert _error(stale)["code"] == "APPROVAL_STALE"
    after = api.data("GET", f"/api/payments/{payment['id']}")
    assert after["status"] == "draft"
    assert after["attempts"] == []


def test_t15_owner_approving_an_outdated_screen_gets_stale(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T15", total="12500.00")
    payment, _ = api.draft_payment(invoice["id"], "5000.00")
    api.start_run(payment["id"])
    approval = api.pending_approval(payment["id"])
    old_fingerprint = approval["fingerprint"]

    current = api.data("GET", f"/api/payments/{payment['id']}")
    api.data(
        "PATCH",
        f"/api/payments/{payment['id']}",
        headers=api.h("accountant"),
        json={"version": current["version"], "amount": "6000.00"},
    )

    stale = api.request(
        "POST",
        f"/api/approvals/{approval['id']}/decision",
        headers=api.h("owner"),
        json={"decision": "approve", "fingerprint": old_fingerprint},
    )
    assert stale.status_code == 409, stale.text
    assert _error(stale)["code"] == "APPROVAL_STALE"


def test_t16_rejection_requires_reason_and_then_blocks_execution(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T16", total="12500.00")
    payment, key = api.draft_payment(invoice["id"], "5000.00")
    api.start_run(payment["id"])
    approval = api.pending_approval(payment["id"])

    missing = api.request(
        "POST",
        f"/api/approvals/{approval['id']}/decision",
        headers=api.h("owner"),
        json={"decision": "reject", "fingerprint": approval["fingerprint"]},
    )
    assert missing.status_code == 422
    assert _error(missing)["code"] == "REASON_REQUIRED"

    reason = "Bank details are being verified with the supplier."
    rejected = api.data(
        "POST",
        f"/api/approvals/{approval['id']}/decision",
        headers=api.h("owner"),
        json={"decision": "reject", "fingerprint": approval["fingerprint"], "reason": reason},
    )
    assert rejected["approval"]["status"] == "rejected"
    assert rejected["payment"]["status"] == "rejected"

    denied = api.execute(payment["id"], key)
    assert denied.status_code == 409
    audit = api.audit_rows(payment["id"])
    rejected_rows = [row for row in audit if row["action"] == "payment.rejected"]
    assert rejected_rows and rejected_rows[0]["after"]["reason"] == reason


# ---------------------------------------------------------------------------
# T17-T24: gateway failure, retries, concurrency and recovery
# ---------------------------------------------------------------------------


def test_t17_gateway_failure_records_one_attempt_and_no_payment(api: API):
    invoice, payment, key = api.paid_setup(number="T17", total="12500.00", amount="5000.00")
    failed = api.execute(payment["id"], key, simulate="fail_once")
    assert failed.status_code == 502, failed.text
    assert _error(failed)["code"] == "GATEWAY_FAILED"

    after = api.data("GET", f"/api/payments/{payment['id']}")
    assert after["status"] == "failed"
    assert len(after["attempts"]) == 1
    assert after["attempts"][0]["outcome"] == "failure"
    assert api.invoice(invoice["id"])["balance"]["outstanding"] == "12500.00"


def test_t18_safe_retry_after_failure_succeeds_once(api: API, api_conn):
    invoice, payment, key = api.paid_setup(number="T18", total="12500.00", amount="5000.00")
    assert api.execute(payment["id"], key, simulate="fail_once").status_code == 502

    retried = api.execute(payment["id"], key)
    assert retried.status_code == 200, retried.text
    body = retried.json()
    assert body["payment"]["status"] == "paid_simulated"
    assert body["invoice_balance"]["outstanding"] == "7500.00"
    attempts = body["payment"]["attempts"]
    assert [item["outcome"] for item in attempts] == ["failure", "success"]
    successes = [item for item in attempts if item["outcome"] == "success"]
    assert len(successes) == 1
    gateway_rows = api_conn.execute(
        "SELECT count(*) AS n FROM mock_gateway_ledger "
        "WHERE idempotency_key = %s AND outcome = 'success'",
        (key,),
    ).fetchone()["n"]
    assert gateway_rows == 1
    assert api.invoice(invoice["id"])["balance"]["outstanding"] == "7500.00"


def test_t19_repeated_execute_is_idempotent(api: API):
    invoice, payment, key = api.paid_setup(number="T19", total="12500.00", amount="5000.00")
    first = api.execute(payment["id"], key)
    assert first.status_code == 200
    first_body = first.json()
    assert first_body["replayed"] is False

    bodies = []
    for _ in range(3):
        response = api.execute(payment["id"], key)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["replayed"] is True
        bodies.append(body)

    stripped = [{k: v for k, v in body.items() if k != "replayed"} for body in bodies]
    expected = {k: v for k, v in first_body.items() if k != "replayed"}
    assert all(body == expected for body in stripped)
    assert len(first_body["payment"]["attempts"]) == 1
    assert api.invoice(invoice["id"])["balance"]["outstanding"] == "7500.00"


def test_t20_ten_parallel_executes_have_one_success(api: API):
    invoice, payment, key = api.paid_setup(number="T20", total="12500.00", amount="5000.00")

    def call() -> tuple[int, dict]:
        with httpx_client(api) as client:
            response = client.post(
                f"/api/payments/{payment['id']}/execute",
                headers=api.h("owner", **{"Idempotency-Key": key}),
            )
            return response.status_code, response.json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda _: call(), range(10)))

    assert all(status == 200 for status, _ in results), results
    references = {body["payment"]["gateway_reference"] for _, body in results}
    assert len(references) == 1 and None not in references
    attempt_references = {body["attempt"]["gateway_reference"] for _, body in results}
    assert attempt_references == references
    attempts = api.data("GET", f"/api/payments/{payment['id']}")["attempts"]
    assert [item["outcome"] for item in attempts] == ["success"]
    assert api.invoice(invoice["id"])["balance"]["outstanding"] == "7500.00"


def test_t21_draft_creation_idempotency_key_semantics(api: API):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T21", total="5000.00")
    key = str(uuid.uuid4())
    first, _ = api.draft_payment(invoice["id"], "1000.00", key=key)
    second, _ = api.draft_payment(invoice["id"], "1000.00", key=key)
    assert second["id"] == first["id"]

    reused = api.request(
        "POST",
        f"/api/invoices/{invoice['id']}/payments",
        headers=api.h("accountant", **{"Idempotency-Key": key}),
        json={"amount": "2000.00", "payment_date": "2026-10-27", "mode": "NEFT"},
    )
    assert reused.status_code == 409, reused.text
    assert _error(reused)["code"] == "IDEMPOTENCY_KEY_REUSED"
    payments = api.data("GET", f"/api/invoices/{invoice['id']}/payments")["items"]
    assert len(payments) == 1


def test_t22_api_and_database_restart_recovery(api: API, api_conn):
    invoice = api.create_invoice(vendor_id=api.vendor()["id"], number="T22", total="12500.00")
    payment, key = api.draft_payment(invoice["id"], "5000.00")
    run = api.start_run(payment["id"])
    api.approve(payment["id"])
    assert api.data("GET", f"/api/runs/{run['id']}")["status"] == "waiting_execution"

    interrupted = api_conn.execute(
        """
        INSERT INTO workflow_runs
          (run_type, entity_type, entity_id, status, current_step, context, created_by)
        VALUES ('invoice_extraction', 'invoice', %s, 'running', 'extract', '{}'::jsonb, %s)
        RETURNING id
        """,
        (invoice["id"], api.user_id("accountant")),
    ).fetchone()["id"]
    api_conn.commit()

    api.restart(database=api.pg_ctl_handle is not None)

    assert api.data("GET", f"/api/payments/{payment['id']}")["status"] == "approved"
    assert api.data("GET", f"/api/runs/{run['id']}")["status"] == "waiting_execution"
    swept = api.data("GET", f"/api/runs/{interrupted}")
    assert swept["status"] == "failed"
    assert swept["last_error"] == "interrupted by restart"

    executed = api.execute(payment["id"], key)
    assert executed.status_code == 200, executed.text
    assert executed.json()["payment"]["status"] == "paid_simulated"
    assert api.invoice(invoice["id"])["balance"]["outstanding"] == "7500.00"


def test_t23_crash_after_gateway_recovers_original_reference(api: API, api_conn):
    invoice, payment, key = api.paid_setup(number="T23", total="12500.00", amount="5000.00")
    crashed = api.execute(payment["id"], key, demo_fault="after_gateway")
    assert crashed.status_code == 503, crashed.text
    error = _error(crashed)
    assert error["code"] == "FAULT_INJECTED"
    original_reference = error["details"]["gateway_reference"]
    assert original_reference

    retried = api.execute(payment["id"], key)
    assert retried.status_code == 200, retried.text
    body = retried.json()
    assert body["payment"]["status"] == "paid_simulated"
    assert body["payment"]["gateway_reference"] == original_reference
    assert [item["outcome"] for item in body["payment"]["attempts"]] == ["success"]
    rows = api_conn.execute(
        "SELECT count(*) AS n FROM mock_gateway_ledger "
        "WHERE idempotency_key = %s AND outcome = 'success'",
        (key,),
    ).fetchone()["n"]
    assert rows == 1
    assert api.invoice(invoice["id"])["balance"]["outstanding"] == "7500.00"


def test_t24_malformed_ai_output_is_rejected_and_manual_fallback_remains(api: API):
    vendor = api.vendor()
    response = api.upload(filename="garbage.png", vendor_id=vendor["id"], extractor="garbage")
    assert response.status_code == 201, response.text
    uploaded = response.json()
    extraction = uploaded["extraction"]
    assert extraction["status"] == "failed"
    assert extraction["attempts"] == 3
    assert extraction["errors"]
    names = [step["name"] for step in extraction["steps"]]
    assert names.count("ai_output_rejected") == 3
    assert "manual_fallback" in names
    invoice = uploaded["invoice"]
    assert invoice["lifecycle_status"] == "draft"
    assert invoice["invoice_number"] is None
    assert invoice["extraction_json"]["status"] == "failed"
    original = api.get(f"/api/files/{uploaded['source_file']['id']}")
    assert original.status_code == 200 and original.content == PNG_BYTES


# ---------------------------------------------------------------------------
# T25-T31: assistant, reconciliation, upload abuse, secrets, labels, CORS
# ---------------------------------------------------------------------------


def test_t25_invented_ai_number_falls_back_to_rules(api: API):
    invoice = next(i for i in api.invoices() if i["invoice_number"] == "DPT/26-27/0559")
    explained = api.data(
        "POST", f"/api/invoices/{invoice['id']}/explain", json={"simulate": "invented_number"}
    )
    assert explained["source"] == "rules"
    assert "9999" not in explained["explanation"]
    assert explained["rejected_ai"] and "9999.00" in explained["rejected_ai"]
    assert explained["label"].startswith("SIMULATED")


def test_t26_assistant_answers_from_database_and_fails_safe(api: API):
    answer = api.data(
        "POST",
        "/api/assistant/ask",
        json={"question": "How much do I owe ABC Electricals?"},
    )
    assert "7,500.00" in answer["answer"]
    assert answer["source"] == "rules"
    figure = answer["figures"][0]
    assert figure["value"] == "7500.00"
    abc_invoice = next(i for i in api.invoices() if i["invoice_number"] == "ABC/26-27/0184")
    assert abc_invoice["id"] in figure["invoice_ids"]

    broken = api.data(
        "POST", "/api/assistant/ask", json={"question": "__break__ retrieval"}
    )
    assert broken["answer"] == "I can't determine that right now."
    assert broken["source"] == "none"


def test_t27_dashboard_reconciles_to_the_paisa(api: API):
    summary = api.data("GET", "/api/dashboard/summary")
    open_rows = api.data("GET", "/api/invoices?filter=open&limit=200")["items"]
    overdue_rows = api.data("GET", "/api/invoices?filter=overdue&limit=200")["items"]
    review_rows = api.data("GET", "/api/invoices?filter=needs_review&limit=200")["items"]
    pending = api.data("GET", "/api/approvals?status=pending")["items"]

    outstanding = sum(
        (Decimal(row["balance"]["outstanding"]) for row in open_rows), Decimal("0.00")
    )
    overdue = sum(
        (Decimal(row["balance"]["outstanding"]) for row in overdue_rows), Decimal("0.00")
    )
    assert Decimal(summary["totals"]["total_dues"]) == outstanding
    assert Decimal(summary["totals"]["overdue_amount"]) == overdue
    assert summary["counts"]["open_invoices"] == len(open_rows)
    assert summary["counts"]["overdue_invoices"] == len(overdue_rows)
    assert summary["counts"]["needs_review"] == len(review_rows)
    assert summary["counts"]["pending_approvals"] == len(pending)
    assert summary["links"]["open"].startswith("/api/invoices")
    assert summary["links"]["overdue"].startswith("/api/invoices")


def test_t28_upload_abuse_is_rejected_and_names_are_safe(api: API, api_conn):
    vendor = api.vendor()

    disguised = api.upload(
        filename="invoice.exe", content=b"MZ\x90\x00not a pdf", content_type="application/pdf",
        vendor_id=vendor["id"],
    )
    assert disguised.status_code == 422, disguised.text
    assert _error(disguised)["code"] == "FILE_CONTENT_MISMATCH"

    oversized = api.upload(
        filename="huge.pdf", content=b"%PDF-" + b"0" * (11 * 1024 * 1024),
        content_type="application/pdf", vendor_id=vendor["id"],
    )
    assert oversized.status_code == 413, oversized.text
    assert _error(oversized)["code"] == "FILE_TOO_LARGE"

    svg = api.upload(
        filename="bill.svg", content=SVG_BYTES, content_type="image/svg+xml",
        vendor_id=vendor["id"],
    )
    assert svg.status_code == 415, svg.text
    assert _error(svg)["code"] == "UNSUPPORTED_FILE_TYPE"

    svg_as_png = api.upload(
        filename="bill.png", content=SVG_BYTES, content_type="image/png",
        vendor_id=vendor["id"],
    )
    assert svg_as_png.status_code == 415

    traversal = api.upload(
        filename="../../x.png", content=PNG_BYTES, content_type="image/png",
        vendor_id=vendor["id"],
    )
    assert traversal.status_code == 201, traversal.text
    source = traversal.json()["source_file"]
    assert "/" not in source["original_filename"] and ".." not in source["original_filename"]
    stored = api_conn.execute(
        "SELECT stored_name FROM uploaded_files WHERE id = %s", (source["id"],)
    ).fetchone()["stored_name"]
    assert re.fullmatch(r"[0-9a-f]{32}\.png", stored)


def test_t29_secrets_are_not_committed(api: API):
    git = ["git", "-C", str(ROOT)]
    tracked = subprocess.run(
        git + ["ls-files", "-z"], capture_output=True, text=True, check=True
    ).stdout.split("\0")
    assert ".env" not in tracked
    ignored = subprocess.run(git + ["check-ignore", "-q", ".env"])
    assert ignored.returncode == 0, ".env must be ignored"

    candidates = subprocess.run(
        git + ["ls-files", "-z", "-c", "-o", "--exclude-standard"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split("\0")
    pattern = re.compile(rb"AIza[0-9A-Za-z_\-]{35}")
    skip_parts = {".git", "node_modules", "dist", "build", "__pycache__", ".pgdata", "data"}
    text_suffixes = {
        ".ts", ".tsx", ".js", ".jsx", ".py", ".sql", ".json", ".md", ".txt",
        ".yml", ".yaml", ".toml", ".ini", ".html", ".css", ".example",
    }
    findings: list[str] = []
    for name in candidates:
        if not name:
            continue
        path = Path(name)
        if any(part in skip_parts for part in path.parts):
            continue
        absolute = ROOT / path
        if not absolute.is_file() or absolute.stat().st_size > 2 * 1024 * 1024:
            continue
        if absolute.suffix.lower() not in text_suffixes and path.name != ".env.example":
            continue
        if pattern.search(absolute.read_bytes()):
            findings.append(name)
    assert findings == [], f"API-key-looking secrets in: {findings}"


@pytest.mark.skipif(
    not os.getenv("OLD_GEMINI_API_KEY"),
    reason="Set OLD_GEMINI_API_KEY to prove the revoked key is rejected by Google",
)
def test_t29b_revoked_google_key_is_rejected(api: API):
    import httpx

    response = httpx.get(
        "https://generativelanguage.googleapis.com/v1beta/models",
        params={"key": os.environ["OLD_GEMINI_API_KEY"]},
        timeout=20.0,
    )
    assert response.status_code in {400, 401, 403}, response.text[:400]


def test_t30_every_payment_payload_is_labelled_simulated(api: API):
    payments = api.data("GET", "/api/payments?limit=200")["items"]
    assert payments
    for payment in payments:
        assert payment["simulated"] is True
        assert "SIMULATED" in payment["label"]
        assert "no money transferred" in payment["label"].lower()

    invoice = next(i for i in api.invoices() if i["invoice_number"] == "ABC/26-27/0184")
    detail = api.invoice(invoice["id"])
    assert detail["payments"]
    assert all(payment["simulated"] for payment in detail["payments"])
    assert detail["payments"][0]["method_label"] == "SIMULATED"

    ui = ROOT / "src" / "components" / "ledger"
    assert "SIMULATED — no money transferred" in (ui / "ui.tsx").read_text(encoding="utf-8")
    for name in ("PaymentDialog.tsx", "PaymentsView.tsx", "InvoiceDrawer.tsx", "AuditView.tsx"):
        text = (ui / name).read_text(encoding="utf-8")
        assert "SimulatedStamp" in text or "SIMULATED" in text, f"{name} lost its simulated-payment label"


def test_t31_cors_blocks_unknown_origins(api: API):
    allowed = api.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert allowed.status_code == 200
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"

    denied = api.get("/api/health", headers={"Origin": "http://evil.example"})
    assert denied.status_code == 200
    assert "access-control-allow-origin" not in denied.headers

    preflight = api.request(
        "OPTIONS",
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-Actor-Id,Idempotency-Key",
        },
    )
    assert preflight.status_code in (200, 204)
    assert preflight.headers.get("access-control-allow-origin") == "http://localhost:3000"

    evil = api.request(
        "OPTIONS",
        "/api/health",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in evil.headers


# ---------------------------------------------------------------------------
# Small helpers that need a per-thread HTTP client
# ---------------------------------------------------------------------------


def httpx_client(api: API):
    import httpx

    return httpx.Client(base_url=api.base_url, timeout=60.0)
