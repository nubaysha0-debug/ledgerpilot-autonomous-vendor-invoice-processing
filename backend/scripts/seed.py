"""Create the schema and load the synthetic demo workspace.

Usage:
    python -m backend.scripts.seed
"""

from __future__ import annotations

import os
import sys

import psycopg
from psycopg.rows import dict_row

from backend.app.seed import seed_demo


def main() -> int:
    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 2
    with psycopg.connect(url, row_factory=dict_row) as conn:
        seed_demo(conn)
    print("Demo workspace seeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
