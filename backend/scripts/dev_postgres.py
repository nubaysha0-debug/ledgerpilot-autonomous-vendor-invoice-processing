"""Start a local PostgreSQL 18 for development without Docker.

This is the fallback for machines where Docker Desktop cannot run. It uses the
free `embedded-postgres` package, stores data under backend/.pgdata by default,
and keeps running until Ctrl+C.

Usage:
    python -m backend.scripts.dev_postgres
    # then in another terminal:
    $env:DATABASE_URL="postgresql://postgres@127.0.0.1:55432/ledgerpilot"
    python -m backend.scripts.migrate
    python -m backend.scripts.seed

The Docker path remains the primary setup: docker compose up --build.
"""

from __future__ import annotations

import os
import signal
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATA = BACKEND_DIR / ".pgdata"


def main() -> int:
    try:
        from embedded_postgres import get_server
    except ImportError:
        print(
            "embedded-postgres is not installed. Run:\n"
            "  python -m pip install -r backend/requirements-dev.txt",
            file=sys.stderr,
        )
        return 2

    pgdata = Path(os.getenv("PGDATA", str(DEFAULT_DATA)))
    pgdata.parent.mkdir(parents=True, exist_ok=True)
    print(f"Starting PostgreSQL with data directory {pgdata}")
    server = get_server(pgdata, cleanup_mode=None)
    uri = server.get_uri()
    (BACKEND_DIR / ".pg_url").write_text(uri + "\n", encoding="utf-8")
    print(f"PostgreSQL ready: {uri}")
    print("Set DATABASE_URL to that URL, then run the migrations/seed.")
    print("Press Ctrl+C to stop.")

    stopped = False

    def stop(*_: object) -> None:
        nonlocal stopped
        if stopped:
            return
        stopped = True
        print("\nStopping PostgreSQL ...")
        try:
            server.cleanup()
        finally:
            raise SystemExit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        stop()


if __name__ == "__main__":
    raise SystemExit(main())
