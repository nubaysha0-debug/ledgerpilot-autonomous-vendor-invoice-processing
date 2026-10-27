"""Finding acknowledgement."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Header

from ..db import transaction
from ..deps import actor
from ..invoices_service import acknowledge_finding
from ..schemas import FindingAcknowledge, require_role

router = APIRouter(prefix="/api/findings", tags=["findings"])


@router.post("/{finding_id}/acknowledge")
def acknowledge(
    finding_id: uuid.UUID,
    payload: FindingAcknowledge,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "staff", "accountant"})
        return acknowledge_finding(conn, actor_row, finding_id, payload.note)
