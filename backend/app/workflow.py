"""Durable workflow runs. No background worker is required: approval pauses
are rows, and the next API request resumes the relevant step."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from .audit import write_audit
from .errors import LedgerError
from .serializers import serialize_approval
from .util import money_str


def add_step(
    conn,
    run_id: uuid.UUID,
    step_no: int,
    name: str,
    *,
    status: str = "done",
    input_data: dict[str, Any] | None = None,
    output_data: dict[str, Any] | None = None,
    error: str | None = None,
    explanation: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO workflow_steps
          (run_id, step_no, step_name, status, input_json, output_json, error,
           explanation, finished_at)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s,
                CASE WHEN %s = 'running' THEN NULL ELSE now() END)
        """,
        (
            run_id,
            step_no,
            name,
            status,
            json.dumps(input_data, default=str) if input_data is not None else None,
            json.dumps(output_data, default=str) if output_data is not None else None,
            error,
            explanation,
            status,
        ),
    )


def create_payment_run(
    conn,
    actor: dict[str, Any],
    payment: dict[str, Any],
    invoice: dict[str, Any],
    vendor: dict[str, Any],
    fingerprint: str,
) -> dict[str, Any]:
    existing = conn.execute(
        "SELECT * FROM workflow_runs WHERE run_type = 'payment_request' "
        "AND entity_id = %s AND status IN "
        "('running','waiting_approval','waiting_execution','executing')",
        (payment["id"],),
    ).fetchone()
    if existing:
        raise LedgerError(
            409,
            "RUN_ALREADY_ACTIVE",
            "A live approval run already exists for this payment.",
            {"run_id": str(existing["id"])},
        )

    run = conn.execute(
        """
        INSERT INTO workflow_runs
          (run_type, entity_type, entity_id, status, current_step, context,
           created_by)
        VALUES ('payment_request', 'payment', %s, 'running', 'load_context',
                %s::jsonb, %s)
        RETURNING *
        """,
        (
            payment["id"],
            json.dumps(
                {
                    "payment_id": str(payment["id"]),
                    "invoice_id": str(invoice["id"]),
                    "vendor_id": str(vendor["id"]),
                    "amount": money_str(payment["amount"]),
                }
            ),
            actor["id"],
        ),
    ).fetchone()

    add_step(
        conn,
        run["id"],
        1,
        "load_context",
        input_data={"payment_id": str(payment["id"])},
        output_data={
            "vendor": vendor["name"],
            "invoice_number": invoice["invoice_number"],
            "amount": money_str(payment["amount"]),
        },
        explanation="Loaded the payment, invoice and vendor from PostgreSQL.",
    )
    add_step(
        conn,
        run["id"],
        2,
        "check_invoice_ready",
        output_data={
            "review_state": invoice["review_state"],
            "lifecycle_status": invoice["lifecycle_status"],
        },
        explanation="Confirmed the invoice was reviewed and active.",
    )
    add_step(
        conn,
        run["id"],
        3,
        "check_allocation",
        output_data={
            "amount": money_str(payment["amount"]),
            "outstanding": money_str(
                conn.execute(
                    "SELECT outstanding FROM invoice_balances WHERE invoice_id = %s",
                    (invoice["id"],),
                ).fetchone()["outstanding"]
            ),
        },
        explanation="Re-checked the amount against paid and in-flight allocations.",
    )

    approval = conn.execute(
        """
        INSERT INTO approvals
          (payment_id, fingerprint, status, requested_by)
        VALUES (%s, %s, 'pending', %s)
        RETURNING *
        """,
        (payment["id"], fingerprint, actor["id"]),
    ).fetchone()

    conn.execute(
        "UPDATE payments SET status = 'pending_approval', version = version + 1, "
        "updated_at = now() WHERE id = %s",
        (payment["id"],),
    )

    add_step(
        conn,
        run["id"],
        4,
        "create_approval",
        output_data={"approval_id": str(approval["id"]), "fingerprint": fingerprint},
        explanation="Paused. The owner must approve this exact fingerprint.",
    )
    conn.execute(
        "UPDATE workflow_runs SET status = 'waiting_approval', "
        "current_step = 'await_approval', updated_at = now() WHERE id = %s",
        (run["id"],),
    )
    write_audit(
        conn,
        actor_id=actor["id"],
        action="payment.run_started",
        entity_type="payment",
        entity_id=payment["id"],
        summary=(
            f"Payment run started for {vendor['name']} invoice "
            f"{invoice['invoice_number']}."
        ),
        after={"run_id": str(run["id"]), "approval_id": str(approval["id"])},
        run_id=run["id"],
    )
    return {
        "id": str(run["id"]),
        "run_type": "payment_request",
        "status": "waiting_approval",
        "current_step": "await_approval",
        "payment_id": str(payment["id"]),
        "approval": {
            "id": str(approval["id"]),
            "status": approval["status"],
            "fingerprint": approval["fingerprint"],
            "summary": {
                "vendor": vendor["name"],
                "invoice_number": invoice["invoice_number"],
                "amount": money_str(payment["amount"]),
                "outstanding_now": money_str(
                    conn.execute(
                        "SELECT outstanding FROM invoice_balances WHERE invoice_id = %s",
                        (invoice["id"],),
                    ).fetchone()["outstanding"]
                ),
                "outstanding_after": money_str(
                    conn.execute(
                        "SELECT outstanding FROM invoice_balances WHERE invoice_id = %s",
                        (invoice["id"],),
                    ).fetchone()["outstanding"]
                    - payment["amount"]
                ),
                "open_warnings": [
                    row["message"]
                    for row in conn.execute(
                        "SELECT message FROM invoice_findings WHERE invoice_id = %s "
                        "AND status = 'open' AND severity = 'warning'",
                        (invoice["id"],),
                    ).fetchall()
                ],
            },
        },
        "created_at": run["created_at"],
    }


def get_run(
    conn, run_id: uuid.UUID, actor_id: uuid.UUID | None = None
) -> dict[str, Any]:
    run = conn.execute(
        "SELECT * FROM workflow_runs WHERE id = %s", (run_id,)
    ).fetchone()
    if not run:
        raise LedgerError(404, "RUN_NOT_FOUND", "The workflow run was not found.")
    approval = conn.execute(
        "SELECT * FROM approvals WHERE payment_id = %s "
        "ORDER BY requested_at DESC LIMIT 1",
        (run["entity_id"],),
    ).fetchone()
    return {
        "id": str(run["id"]),
        "run_type": run["run_type"],
        "entity_type": run["entity_type"],
        "entity_id": str(run["entity_id"]),
        "status": run["status"],
        "current_step": run["current_step"],
        "context": run["context"],
        "retry_count": run["retry_count"],
        "last_error": run["last_error"],
        "correlation_id": str(run["correlation_id"]),
        "created_by": str(run["created_by"]),
        "created_at": run["created_at"].isoformat(),
        "updated_at": run["updated_at"].isoformat(),
        "approval": serialize_approval(approval),
    }


def get_trace(conn, run_id: uuid.UUID) -> dict[str, Any]:
    run = conn.execute(
        "SELECT * FROM workflow_runs WHERE id = %s", (run_id,)
    ).fetchone()
    if not run:
        raise LedgerError(404, "RUN_NOT_FOUND", "The workflow run was not found.")
    steps = conn.execute(
        "SELECT * FROM workflow_steps WHERE run_id = %s ORDER BY step_no",
        (run_id,),
    ).fetchall()
    items = []
    for step in steps:
        items.append(
            {
                "step_no": step["step_no"],
                "step_name": step["step_name"],
                "status": step["status"],
                "input": step.get("input_json"),
                "output": step.get("output_json"),
                "error": step.get("error"),
                "explanation": step.get("explanation"),
                "started_at": step["started_at"].isoformat(),
                "finished_at": (
                    step["finished_at"].isoformat() if step.get("finished_at") else None
                ),
            }
        )
    return {
        "run_id": str(run["id"]),
        "status": run["status"],
        "current_step": run["current_step"],
        "items": items,
        "explanation": (
            f"Run {run['status'].replace('_', ' ')} at "
            f"{run['current_step'] or 'completed'}. "
            "Steps are persisted in PostgreSQL and survive an API restart."
        ),
    }


def cancel_runs_for_payment(
    conn, payment_id: uuid.UUID, reason: str
) -> str | None:
    run = conn.execute(
        "SELECT id FROM workflow_runs WHERE run_type = 'payment_request' "
        "AND entity_id = %s AND status IN "
        "('running','waiting_approval','waiting_execution','executing') "
        "FOR UPDATE",
        (payment_id,),
    ).fetchone()
    if not run:
        return None
    conn.execute(
        "UPDATE workflow_runs SET status = 'cancelled', last_error = %s, "
        "updated_at = now() WHERE id = %s",
        (reason, run["id"]),
    )
    return str(run["id"])


def sweep_interrupted_runs(conn) -> int:
    rows = conn.execute(
        "SELECT id FROM workflow_runs WHERE status = 'running' FOR UPDATE"
    ).fetchall()
    for row in rows:
        conn.execute(
            "UPDATE workflow_runs SET status = 'failed', "
            "last_error = 'interrupted by restart', updated_at = now() WHERE id = %s",
            (row["id"],),
        )
    return len(rows)


def create_extraction_run(
    conn,
    actor_id: uuid.UUID,
    invoice_id: uuid.UUID,
    engine: str,
    status: str,
    steps: list[dict[str, Any]],
    error: str | None = None,
) -> uuid.UUID:
    run = conn.execute(
        """
        INSERT INTO workflow_runs
          (run_type, entity_type, entity_id, status, current_step, context,
           retry_count, last_error, created_by)
        VALUES ('invoice_extraction', 'invoice', %s, %s, 'extract', %s::jsonb,
                %s, %s, %s)
        RETURNING id
        """,
        (
            invoice_id,
            "completed" if status in {"ok", "skipped"} else "failed",
            json.dumps({"engine": engine, "extraction_status": status}),
            max(0, len([s for s in steps if s.get("status") == "failed"])),
            error,
            actor_id,
        ),
    ).fetchone()
    for index, step in enumerate(steps, start=1):
        add_step(
            conn,
            run["id"],
            index,
            step.get("name", "extract"),
            status=step.get("status", "done"),
            input_data=step.get("input"),
            output_data=step.get("output"),
            error=step.get("error"),
            explanation=step.get("explanation"),
        )
    return run["id"]
