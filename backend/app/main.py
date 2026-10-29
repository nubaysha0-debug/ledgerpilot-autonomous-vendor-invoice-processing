"""FastAPI application entry point.

Run locally:
    uvicorn backend.app.main:app --reload --port 8000
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import Any

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .db import transaction
from .errors import (
    LedgerError,
    envelope,
    http_error_handler,
    ledger_error_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from .routers import (
    approvals,
    assistant,
    dashboard,
    files,
    findings,
    invoices,
    payments,
    runs,
    system,
    vendors,
)
from .auth_router import router as auth_router
from .seed import seed_demo
from .workflow import sweep_interrupted_runs


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    try:
        with transaction() as conn:
            present = conn.execute(
                "SELECT to_regclass('public.business_settings') IS NOT NULL AS present"
            ).fetchone()["present"]
            if present:
                sweep_interrupted_runs(conn)
                seeded = conn.execute(
                    "SELECT EXISTS (SELECT 1 FROM business_settings WHERE id = 'primary') "
                    "AS present"
                ).fetchone()["present"]
                if not seeded and settings.demo_mode:
                    seed_demo(conn)
    except Exception as exc:  # The API still starts; /api/health reports the DB.
        print(f"[ledgerpilot] startup database check skipped: {type(exc).__name__}")
    yield


app = FastAPI(
    title="LedgerPilot API",
    version="1.0.0",
    description=(
        "Deterministic supplier-bill checking and simulated payment control. "
        "No live bank connection exists."
    ),
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-Id", "Idempotency-Key"],
)


@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    value = request.headers.get("X-Correlation-Id") or str(uuid.uuid4())
    try:
        request.state.correlation_id = str(uuid.UUID(value))
    except (ValueError, TypeError):
        request.state.correlation_id = str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Correlation-Id"] = request.state.correlation_id
    return response


app.add_exception_handler(LedgerError, ledger_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)


@app.exception_handler(psycopg.Error)
async def database_error_handler(request: Request, exc: psycopg.Error) -> JSONResponse:
    if isinstance(exc, psycopg.OperationalError):
        return JSONResponse(
            status_code=503,
            content=envelope(
                "DB_UNAVAILABLE",
                "Can't reach the database. Nothing was saved.",
                {"type": type(exc).__name__},
                getattr(request.state, "correlation_id", None),
            ),
        )
    if isinstance(exc, psycopg.errors.UniqueViolation):
        return JSONResponse(
            status_code=409,
            content=envelope(
                "CONFLICT",
                "That record already exists.",
                {"constraint": getattr(exc.diag, "constraint_name", None)},
                getattr(request.state, "correlation_id", None),
            ),
        )
    return JSONResponse(
        status_code=500,
        content=envelope(
            "DB_ERROR",
            "The database rejected the request. Nothing was saved.",
            {"type": type(exc).__name__},
            getattr(request.state, "correlation_id", None),
        ),
    )


for module in (
    system,
    vendors,
    invoices,
    findings,
    files,
    payments,
    runs,
    approvals,
    dashboard,
    assistant,
):
    app.include_router(module.router)

app.include_router(auth_router)


@app.get("/api", include_in_schema=False)
def api_root() -> dict[str, Any]:
    return {
        "name": "LedgerPilot API",
        "version": "1.0.0",
        "docs": "/docs",
        "simulated": True,
    }
