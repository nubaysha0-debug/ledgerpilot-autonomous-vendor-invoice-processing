"""Database connections and transactions.

When AUTH_REQUIRED is enabled every request carries a workspace_id resolved
from the session cookie.  Pass it to ``transaction()`` / ``read_connection()``
and the connection will automatically set ``search_path`` to the isolated
workspace schema so all queries hit the right tables.
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import get_settings


def _schema_name(workspace_id: uuid.UUID | str | None) -> str | None:
    if workspace_id is None:
        return None
    uid = uuid.UUID(str(workspace_id)) if not isinstance(workspace_id, uuid.UUID) else workspace_id
    return f"ws_{uid.hex}"


def connect(workspace_id: uuid.UUID | str | None = None) -> psycopg.Connection:
    settings = get_settings()
    conn = psycopg.connect(
        settings.database_url,
        row_factory=dict_row,
        connect_timeout=8,
        application_name="ledgerpilot-api",
    )
    if workspace_id is not None:
        schema = _schema_name(workspace_id)
        conn.execute(f'SET search_path TO "{schema}", public')
    return conn


@contextmanager
def transaction(workspace_id: uuid.UUID | str | None = None) -> Iterator[psycopg.Connection]:
    conn = connect(workspace_id)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


@contextmanager
def read_connection(workspace_id: uuid.UUID | str | None = None) -> Iterator[psycopg.Connection]:
    conn = connect(workspace_id)
    try:
        yield conn
    finally:
        conn.close()
