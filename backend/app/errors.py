"""Structured API errors.

Every failure uses {"error": {code, message, details, correlation_id}}.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class LedgerError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def envelope(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
    correlation_id: str | None = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "correlation_id": correlation_id or str(uuid.uuid4()),
        }
    }


def correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", str(uuid.uuid4()))


def error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content=envelope(code, message, details, correlation_id(request)),
    )


async def ledger_error_handler(request: Request, exc: LedgerError) -> JSONResponse:
    return error_response(
        request, exc.status_code, exc.code, exc.message, exc.details
    )


async def validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return error_response(
        request,
        422,
        "VALIDATION_ERROR",
        "The request did not match the API contract.",
        {"errors": exc.errors()},
    )


async def http_error_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    return error_response(
        request,
        exc.status_code,
        "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR",
        str(exc.detail),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return error_response(
        request,
        500,
        "INTERNAL_ERROR",
        "The server could not complete the request. Nothing was saved.",
        {"type": type(exc).__name__},
    )
