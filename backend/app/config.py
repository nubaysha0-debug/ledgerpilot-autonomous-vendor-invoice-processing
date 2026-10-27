"""Runtime configuration. Nothing in this file is a secret."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
load_dotenv(PROJECT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env", override=False)


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _decimal(name: str, default: str) -> Decimal:
    try:
        return Decimal(os.getenv(name, default))
    except Exception:
        return Decimal(default)


@dataclass
class Settings:
    app_env: str = os.getenv("APP_ENV", "local")
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres@127.0.0.1:55432/ledgerpilot",
    )
    api_port: int = int(os.getenv("API_PORT", "8000"))
    cors_allowed_origins: list[str] = field(
        default_factory=lambda: [
            item.strip()
            for item in os.getenv(
                "CORS_ALLOWED_ORIGINS",
                "http://localhost:3000,http://127.0.0.1:3000,"
                "http://localhost:5173,http://127.0.0.1:5173",
            ).split(",")
            if item.strip()
        ]
    )
    # Vercel Functions ship a read-only bundle; only /tmp is writable. Original
    # uploads are therefore ephemeral there (set UPLOAD_DIR to a mounted volume
    # if you need them to outlive a warm instance).
    upload_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv("UPLOAD_DIR")
            or (
                "/tmp/ledgerpilot/uploads"
                if os.getenv("VERCEL")
                else str(BACKEND_DIR / "data" / "uploads")
            )
        )
    )
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "10"))
    max_pdf_pages: int = int(os.getenv("MAX_PDF_PAGES", "5"))
    llm_provider: str = os.getenv("LLM_PROVIDER", "mock")
    extractor: str = os.getenv("EXTRACTOR", "mock")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "")
    llm_timeout_seconds: int = int(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
    llm_max_retries: int = int(os.getenv("LLM_MAX_RETRIES", "2"))
    max_execute_attempts: int = int(os.getenv("MAX_EXECUTE_ATTEMPTS", "3"))
    mock_allow_forced_failure: bool = _bool("MOCK_ALLOW_FORCED_FAILURE", True)
    demo_mode: bool = _bool("DEMO_MODE", True)
    amount_tolerance: Decimal = field(
        default_factory=lambda: _decimal("AMOUNT_TOLERANCE_INR", "1.00")
    )
    dup_date_window_days: int = int(os.getenv("DUP_DATE_WINDOW_DAYS", "3"))
    fault_injection: str = os.getenv("FAULT_INJECTION", "")

    @property
    def simulated_label(self) -> str:
        return "SIMULATED — no money transferred"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
