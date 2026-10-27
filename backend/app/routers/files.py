"""Original-file streaming."""

from __future__ import annotations

import uuid

from fastapi import APIRouter
from fastapi.responses import FileResponse

from ..config import get_settings
from ..db import read_connection
from ..errors import LedgerError
from ..util import safe_filename

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{file_id}")
def get_file(file_id: uuid.UUID) -> FileResponse:
    with read_connection() as conn:
        row = conn.execute(
            "SELECT * FROM uploaded_files WHERE id = %s", (file_id,)
        ).fetchone()
    if not row:
        raise LedgerError(404, "FILE_NOT_FOUND", "The uploaded file was not found.")
    path = get_settings().upload_dir / row["stored_name"]
    if not path.exists():
        raise LedgerError(404, "FILE_NOT_FOUND", "The stored original is missing.")
    filename = safe_filename(row["original_filename"]).replace('"', "")
    return FileResponse(
        path,
        media_type=row["content_type"],
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )
