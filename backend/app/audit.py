"""Append-only audit writer. Always uses the caller's transaction."""

from __future__ import annotations

import json
import uuid
from typing import Any

from .util import canonical_json


def write_audit(
    conn,
    *,
    actor_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    summary: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    run_id: uuid.UUID | None = None,
    correlation_id: uuid.UUID | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO audit_logs
          (actor_id, action, entity_type, entity_id, summary, before_json,
           after_json, run_id, correlation_id)
        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
        """,
        (
            actor_id,
            action,
            entity_type,
            entity_id,
            summary,
            json.dumps(before, default=str) if before is not None else None,
            json.dumps(after, default=str) if after is not None else None,
            run_id,
            correlation_id,
        ),
    )
