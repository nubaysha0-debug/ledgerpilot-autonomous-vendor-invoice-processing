"""Apply backend/migrations/*.sql in order.

Usage:
    python -m backend.scripts.migrate
    DATABASE_URL=postgresql://... python -m backend.scripts.migrate --status

The runner is intentionally tiny: migrations are plain SQL, applied once and
recorded in schema_migrations. It is safe to run repeatedly.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = BACKEND_DIR / "migrations"


def database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        print(
            "DATABASE_URL is not set. Copy .env.example to .env or export it.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return url


def applied_versions(conn: psycopg.Connection) -> set[str]:
    exists = conn.execute(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present"
    ).fetchone()[0]
    if not exists:
        return set()
    return {
        row[0]
        for row in conn.execute("SELECT version FROM schema_migrations").fetchall()
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply LedgerPilot SQL migrations.")
    parser.add_argument("--status", action="store_true", help="Only print status.")
    args = parser.parse_args()

    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    with psycopg.connect(database_url(), autocommit=True) as conn:
        applied = applied_versions(conn)
        if args.status:
            for path in files:
                mark = "applied" if path.name in applied else "pending"
                print(f"{mark:8} {path.name}")
            return 0

        for path in files:
            if path.name in applied:
                print(f"skip     {path.name}")
                continue
            sql = path.read_text(encoding="utf-8")
            with conn.transaction():
                conn.execute(sql)
                conn.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s) "
                    "ON CONFLICT (version) DO NOTHING",
                    (path.name,),
                )
            print(f"applied  {path.name}")
    print("Migrations complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
