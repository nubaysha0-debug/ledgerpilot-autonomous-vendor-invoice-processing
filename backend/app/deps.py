"""Shared route helpers."""

from __future__ import annotations

from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from .errors import envelope
from .schemas import actor_from_conn, require_role


def actor(conn, x_actor_id: str | None) -> dict[str, Any]:
    return actor_from_conn(conn, x_actor_id)


def owner(actor_row: dict[str, Any]) -> None:
    require_role(actor_row, {"owner"})


def service_response(status_code: int, payload: Any) -> JSONResponse:
    """Turn a (status, payload) service result into an HTTP response.

    Services return an error-shaped dict for expected conflicts so their audit
    rows are committed. Those are rendered in the normal error envelope.
    """
    if status_code < 400:
        return JSONResponse(status_code=status_code, content=jsonable_encoder(payload))
    code = payload.get("code", "REQUEST_FAILED") if isinstance(payload, dict) else "REQUEST_FAILED"
    message = (
        payload.get("message", "The request could not be completed.")
        if isinstance(payload, dict)
        else str(payload)
    )
    details = payload.get("details", {}) if isinstance(payload, dict) else {}
    return JSONResponse(
        status_code=status_code,
        content=envelope(code, message, details),
    )
