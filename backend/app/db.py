"""Database connections and transactions."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row

from .config import get_settings


def connect() -> psycopg.Connection:
    settings = get_settings()
    return psycopg.connect(
        settings.database_url,
        row_factory=dict_row,
        connect_timeout=8,
        application_name="ledgerpilot-api",
    )


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    conn = connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


@contextmanager
def read_connection() -> Iterator[psycopg.Connection]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
