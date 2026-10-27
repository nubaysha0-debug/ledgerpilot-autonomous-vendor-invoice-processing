"""Grounded assistant endpoint."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from ..ai import assistant_ask
from ..db import read_connection

router = APIRouter(prefix="/api/assistant", tags=["assistant"])


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=500)


@router.post("/ask")
def ask(payload: AskRequest) -> dict[str, Any]:
    with read_connection() as conn:
        return assistant_ask(conn, payload.question)
