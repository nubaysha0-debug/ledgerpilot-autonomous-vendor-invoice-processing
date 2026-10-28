# LedgerPilot

**A simulated accounts-payable console for a small Indian electricals and hardware shop.**

**Live demo:** <https://ledgerpilot-autonomous-vendor-invoi.vercel.app> — Neon PostgreSQL, simulated payments only.

LedgerPilot checks supplier bills, explains exceptions with evidence, keeps a maker-checker
approval trail, tracks partial payments in paise-exact INR, and executes **simulated** payments.
There is no bank, UPI, card or payment-gateway connection.

> **SIMULATED — no money transferred.** Every payment screen and API response carries this label.
> All vendors, invoices and bank details in the repository are synthetic.

---

## What it does

- **Invoice intake** — create invoices manually, import vendor/invoice CSVs in the browser, or
  upload PNG/JPEG/PDF bills. Uploads keep the original file and run a deterministic mock extractor.
- **Evidence-backed checks** — arithmetic totals, GST breakup, required fields, duplicate
  candidates, purchase-order thresholds and changed vendor bank accounts. Findings store their
  evidence, not just a message.
- **Exception-first dashboard** — total dues, overdue amount, pending approvals and needs-review
  counts reconcile to the same PostgreSQL balance view as the drill-down lists.
- **Maker-checker payments** — an accountant records a request; only the owner can approve,
  reject, execute or retry it. The approval fingerprint covers the invoice total and vendor bank
  account, so later changes make the approval stale.
- **Partial and decimal payments** — money is decimal-safe in PostgreSQL and integer paise in the
  React client. Two ₹5,000 and one ₹7,500 payment can settle a ₹12,500 invoice exactly.
- **Idempotent mock execution** — a stored `Idempotency-Key` makes repeated executes replay the
  original mock reference. A forced gateway failure can be retried without creating a second
  payment. Ten parallel executes produce one success.
- **Durable workflow and audit** — runs, steps, approvals, attempts and audit events live in
  PostgreSQL and survive an API/database restart. Interrupted runs are swept on startup.
- **Browser fallback** — the original localStorage demo remains available if the API or database is
  unavailable, so a live demo still works offline.

---

## Architecture

```mermaid
flowchart LR
  Browser["React console<br/>localhost:3000"] -->|"HTTP JSON / multipart"| API["FastAPI<br/>localhost:8000"]
  API --> PG[("PostgreSQL 16+<br/>vendors · invoices · payments<br/>approvals · runs · audit")]
  Browser -.->|"fallback: localStorage<br/>?api=off"| Local["Browser demo state"]
  API --> Mock["Mock gateway + extractor<br/>no external network"]
```

The React console probes `GET /api/health` once at startup. If it answers, the API/PostgreSQL
workspace is the source of truth. If it does not, the console keeps the browser-local workspace and
shows a **Browser-local** badge. Add `?api=off` to the URL to force local mode.

The full HTTP contract is in [`docs/api-contract.md`](docs/api-contract.md). The generated OpenAPI
schema is served at `/docs` and `/openapi.json` when the API is running.

---

## Quick start

### A. Full stack with Docker (recommended)

Requirements: Docker Desktop with Compose, Node.js 22 LTS or newer, and npm.

```powershell
# Terminal 1 — PostgreSQL on :5432 and FastAPI on :8000
docker compose up --build

# Terminal 2 — React console on :3000
npm install --legacy-peer-deps --no-audit --no-fund
npm run dev
```

Open <http://localhost:3000>. The header should show **PostgreSQL API**. Verify the service:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

The API container applies migrations at startup and seeds the synthetic workspace on first boot.
Stop with `docker compose down`. To discard the demo database as well, use
`docker compose down -v`.

### B. Windows without Docker (embedded PostgreSQL)

This path uses the free `embedded-postgres` package and is useful when Docker Desktop, WSL or
virtualization is unavailable. It downloads a PostgreSQL binary on first use.

Requirements: Python 3.12+ and Node.js 22 LTS or newer.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements-dev.txt

# Terminal 1 — starts PostgreSQL, writes the URL to backend/.pg_url, stays in the foreground
python -m backend.scripts.dev_postgres
```

In a second terminal:

```powershell
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = (Get-Content backend/.pg_url).Trim()
python -m backend.scripts.migrate
python -m backend.scripts.seed          # optional; the API seeds an empty workspace on startup
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

In a third terminal:

```powershell
npm install --legacy-peer-deps --no-audit --no-fund
npm run dev
```

Open <http://localhost:3000>. The header should show **PostgreSQL API**.

If port 8000 is already occupied, run the API on 8010 and point the console at it:

```powershell
uvicorn backend.app.main:app --host 127.0.0.1 --port 8010
$env:VITE_API_URL = "http://127.0.0.1:8010"
npm run dev
```

`VITE_API_URL` is read when the frontend starts. Restart `npm run dev` after changing it.

### C. Browser-only demo

No Python, database or API is required. This is the original demo path and remains the offline
fallback.

```powershell
npm install --legacy-peer-deps --no-audit --no-fund
npm run dev
```

Open <http://localhost:3000/?api=off>. State is stored in `localStorage` under
`ledgerpilot.demo.v1`. CSV import, JSON backup/restore and reset all work in this mode.

Without `?api=off`, the console waits briefly for `http://127.0.0.1:8000/api/health`; if it does
not answer, it falls back to the local workspace automatically.

---

## Environment variables

Copy `.env.example` to `.env` for local use. `.env` is ignored by Git. Do not commit real bank
credentials, API keys or customer data.

| Variable | Default | Used by | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres@127.0.0.1:55432/ledgerpilot` | API | PostgreSQL connection string. Docker Compose overrides it. |
| `API_PORT` | `8000` | API | Informational default; pass `--port` to uvicorn. |
| `CORS_ALLOWED_ORIGINS` | localhost/127.0.0.1 on 3000 and 5173 | API | Comma-separated browser origins. |
| `DEMO_MODE` | `true` | API | Enables `/api/demo/reset` and demo fault hooks. |
| `EXTRACTOR` | `mock` | API | `mock`, `off` or demo-only `garbage` via the upload form. |
| `LLM_PROVIDER` | `mock` | API | The demo is rules-first; no model key is required. |
| `MAX_UPLOAD_MB` | `10` | API | Upload size ceiling. |
| `MAX_PDF_PAGES` | `5` | API | PDF page ceiling. |
| `UPLOAD_DIR` | `backend/data/uploads` (`/tmp/ledgerpilot/uploads` on Vercel) | API | Original-file storage. Ignored by Git. |
| `MOCK_ALLOW_FORCED_FAILURE` | `true` | API | Allows the demo failure toggle. |
| `VITE_API_URL` | `http://127.0.0.1:8000` in dev; same origin in production | Frontend | API base URL used by the React adapter. |
| `LP_TEST_DATABASE_URL` | unset | Tests | Optional external disposable DB; name must end in `_test`. |

The console is a standalone Vite + React app. It does not require Firebase, a
model key or a hosted AI service.

---

## Deploy to Vercel

The repository ships [`vercel.json`](vercel.json) using two [Vercel Services](https://vercel.com/docs/services)
on one domain:

| Service | Root | Role |
| --- | --- | --- |
| `web` | `./` | Vite build of the React console (`dist/`) |
| `api` | `backend/` | FastAPI ASGI app (`app.main:app`, PostgreSQL) |

Requests to `/api/*` are rewritten to `api`; everything else goes to `web`. Both share the
deployment origin, so the production console defaults to a same-origin API and needs no
`VITE_API_URL`.

1. Create a free PostgreSQL 16+ database (Neon or Supabase). Copy the pooled connection string,
   including `?sslmode=require`.
2. Apply the migrations once from this machine:

   ```powershell
   $env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
   python -m pip install -r backend/requirements.txt
   python -m backend.scripts.migrate
   ```

   The runner is idempotent, so it is safe to repeat after pulling new migrations.
3. Import the GitHub repository at <https://vercel.com/new> and keep **Root Directory** at the
   repository root (leave it empty, or `.`). If the project already exists, open
   **Settings → Build & Deployment** and set **Framework Preset** to **Services** (CLI:
   `vercel project update --framework services`). `vercel.json` declares both services; the build
   log should show `web` (Vite) and `api` (FastAPI).
4. Add these Project → Settings → Environment Variables (Production, and Preview if wanted):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | The PostgreSQL connection string from step 1. |
   | `CORS_ALLOWED_ORIGINS` | Optional. Only needed when the console and API use different origins. |
   | `UPLOAD_DIR` | Optional. Defaults to `/tmp/ledgerpilot/uploads` on Vercel. |
   | `VITE_API_URL` | Optional. Only set it when the API lives on another host; then redeploy. |

5. Deploy and verify `https://<project>.vercel.app/api/health` returns `"database": "ok"` and
   `"migrations": 6`. The console header should show **PostgreSQL API**; `/docs` is the Swagger UI.

Notes:

- Vercel Functions are stateless. Uploaded originals live in `/tmp` and can disappear on a cold
  start or a different instance. Vendors, invoices, approvals, payments and audit events are in
  PostgreSQL and persist.
- For the browser-only demo, import the repository as a plain Vite project and open `/?api=off`.
  No database or API is required.
- Free tiers are sufficient for a demo. Neon pauses idle databases, so the first request after a
  pause can take a few seconds; the console waits up to 8 seconds for `/api/health`.

---

## Tests and checks

Backend acceptance tests exercise the real HTTP API against a real PostgreSQL instance:

```powershell
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
```

The harness starts an isolated `embedded-postgres` cluster, applies the real migrations, launches
the real FastAPI process on a free port, and covers T01–T31: persistence across restarts, upload
abuse, arithmetic findings, partial/decimal settlement, over-allocation, role bypass, stale
approvals, gateway failure, safe retry, idempotent and parallel execution, crash recovery,
malformed extraction, grounded assistant answers, dashboard reconciliation, secret hygiene,
SIMULATED labels and CORS. `T29b` is skipped unless `OLD_GEMINI_API_KEY` is set; it is an optional
live check that the old Google key was revoked.

Frontend checks:

```powershell
npm run check:ledger   # deterministic ledger assertions
npm run check:import   # CSV, GST-rate and round-trip assertions
npm run lint           # TypeScript, no emit
npm run build          # production bundle
```

For an external disposable database:

```powershell
$env:LP_TEST_DATABASE_URL = "postgresql://ledger:ledger_demo_only@127.0.0.1:5432/ledgerpilot_test"
python -m pytest backend/tests -q
```

The test harness refuses to run against a database whose name does not end in `_test`.

---

## Demo

See [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) for the 3-minute judge walkthrough, numbers, judge Q&A and
failure drills. The seed is deterministic:

- 12 vendors, 16 invoices, 10 payment records, 19 audit events
- ₹3,83,870 open payables across 11 invoices
- ₹1,01,088 overdue on 4 invoices
- ABC Electricals `ABC/26-27/0184`: ₹12,500 total, ₹5,000 paid, ₹7,500 available
- Sharma Hardware `Sharma/26-27/0412`: ₹22,130 printed vs ₹21,995 arithmetic, a ₹135 exception
- One changed bank account, one duplicate candidate, one missing purchase order

Use **Data → Reset demo data** to restore the seed. In API mode this replaces the PostgreSQL
workspace; in browser-local mode it replaces `localStorage`. Download a JSON backup first if you
need to keep an imported workspace.

---

## Repository layout

```text
backend/
  app/               FastAPI app, services, serializers, rules, seed
  migrations/        001_init.sql … 006_audit.sql
  scripts/           migrate, seed, embedded PostgreSQL launcher
  tests/             pytest acceptance harness and T01–T31
  seed/              deterministic browser seed exported for the API
  Dockerfile
docker-compose.yml   PostgreSQL :5432 + API :8000
docs/
  api-contract.md    HTTP contract, errors, roles, money format
src/
  components/ledger/ React console
  ledger/            state store, API adapter, rules, money, importer
scripts/             frontend assertion scripts and seed export
```

---

## Security and limitations

- **Synthetic demo only.** Do not import live bank credentials, full account numbers, customer data
  or vendor secrets. Imported account numbers are reduced to the last four digits, but the demo
  store is not a system of record.
- **No real payments.** Execution writes a `SIMULATED` mock reference and an audit event. No bank,
  UPI, card or PSP is contacted.
- **Browser-local mode is unencrypted.** It uses `localStorage` and can be read or changed by anyone
  with access to the browser profile.
- **API mode is a local demo.** PostgreSQL is not configured for production encryption, backups,
  high availability or multi-tenant access control. The `X-Actor-Id` header is an identification
  convenience, not authentication.
- **Rotate any leaked key.** The old Google/Firebase key was removed from every reachable commit in a
  pre-push history rewrite, and the current config uses a placeholder. Revoke the old key in Google
  Cloud anyway: rewriting history does not unshare a value that was already copied or cached.
- **Demo reset is destructive.** It overwrites the current workspace.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Header says **Browser-local** even though the API is running | Open `http://127.0.0.1:8000/api/health` directly. Check `VITE_API_URL`, the browser console, and `CORS_ALLOWED_ORIGINS`. Add `?api=off` only when you intentionally want local mode. |
| **Port 8000 is busy** | `Get-NetTCPConnection -LocalPort 8000` shows the owner. Stop that process or run the API on 8010 and set `VITE_API_URL`. Do not stop an unrelated service without checking. |
| **DB_UNAVAILABLE** | `docker compose ps` and `docker compose logs db`; for the embedded path, confirm `backend/.pg_url` matches the running server. |
| **Migrations are missing** | `python -m backend.scripts.migrate --status`, then apply them. The Docker command applies migrations automatically. |
| **npm install peer warnings** | The Vercel install command uses `--legacy-peer-deps` to keep installs reproducible across npm versions. |
| **Reset did not restore the seed** | In API mode, confirm the header badge is **PostgreSQL API**; in local mode, confirm the URL has `?api=off`. Reset is destructive in both modes. |
| **Upload rejected** | Only PNG, JPEG and PDF are accepted, up to 10 MB, and the bytes must match the declared type. SVG is rejected deliberately. |

---

## License and attribution

This hackathon prototype is provided for demonstration and evaluation. Portions of the React shell
retain their original Apache-2.0 SPDX notice in `src/App.tsx`; the LedgerPilot ledger, FastAPI
service, PostgreSQL schema and tests are part of this repository. All data is synthetic.
