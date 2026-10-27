"""Pending approvals and owner decisions."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Header, Query

from ..db import read_connection, transaction
from ..deps import actor
from ..payments_service import decide_approval, list_approvals
from ..schemas import ApprovalDecision

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("")
def get_approvals(
    status: str | None = Query(default="pending"),
) -> dict[str, Any]:
    with read_connection() as conn:
        return list_approvals(conn, status=status)


@router.post("/{approval_id}/decision")
def decision(
    approval_id: uuid.UUID,
    payload: ApprovalDecision,
    x_actor_id: str | None = Header(default=None),
) -> dict[str, Any]:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        return decide_approval(conn, actor_row, approval_id, payload)
