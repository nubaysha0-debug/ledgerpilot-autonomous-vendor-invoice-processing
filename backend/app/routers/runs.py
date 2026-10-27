"""Durable approval runs and their trace."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Header
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from ..db import read_connection, transaction
from ..deps import actor
from ..errors import LedgerError
from ..payments_service import start_payment_run
from ..schemas import RunCreate, require_role
from ..workflow import get_run, get_trace

router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.post("", status_code=201)
def post_run(
    payload: RunCreate,
    x_actor_id: str | None = Header(default=None),
) -> JSONResponse:
    with transaction() as conn:
        actor_row = actor(conn, x_actor_id)
        require_role(actor_row, {"owner", "accountant"})
        result = start_payment_run(conn, actor_row, payload.payment_id)
        return JSONResponse(status_code=201, content=jsonable_encoder(result))


@router.get("/{run_id}")
def get_run_route(run_id: uuid.UUID) -> dict[str, Any]:
    with read_connection() as conn:
        return get_run(conn, run_id)


@router.get("/{run_id}/trace")
def get_trace_route(run_id: uuid.UUID) -> dict[str, Any]:
    with read_connection() as conn:
        return get_trace(conn, run_id)
