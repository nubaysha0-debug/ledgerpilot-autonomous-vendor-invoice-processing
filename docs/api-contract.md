# LedgerPilot API contract

Status: **contract v1** · API version **1.0.0** · FastAPI on **`http://localhost:8000`**

This is the HTTP contract used by the React console. The live, generated schema is always
available at:

- Swagger UI: [`http://localhost:8000/docs`](http://localhost:8000/docs)
- OpenAPI JSON: [`http://localhost:8000/openapi.json`](http://localhost:8000/openapi.json)

All data is synthetic and every payment is **simulated**. There is no bank, UPI, card or payment
gateway integration. The response field `simulated` is always `true`, and payment responses carry
the label `SIMULATED — no money transferred`.

---

## 1. Conventions

### Base URL and CORS

The API listens on port **8000**. During local development the React console normally runs on
`http://localhost:3000` and calls the API directly at `http://127.0.0.1:8000`.

Allowed browser origins are configured with `CORS_ALLOWED_ORIGINS` and default to:

```text
http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
```

Unknown origins receive no `Access-Control-Allow-Origin` header. Preflight requests are supported
for `X-Actor-Id`, `Idempotency-Key`, `X-Correlation-Id` and `Content-Type`.

### Headers

| Header | Required | Purpose |
| --- | --- | --- |
| `X-Actor-Id` | Mutating endpoints | UUID of the acting user from `GET /api/users`. This demo has no login; the header identifies the role. |
| `Idempotency-Key` | Payment draft and execute | 16–64 characters. Reusing the same key with the same request returns the existing result; reusing it with a different request returns `409 IDEMPOTENCY_KEY_REUSED`. |
| `X-Correlation-Id` | No | Optional client trace id. If it is a UUID, the API echoes it; otherwise the API generates one. Always returned as `X-Correlation-Id`. |
| `Content-Type` | POST/PATCH/PUT with JSON | `application/json`. Upload is `multipart/form-data`. |
| `X-Demo-Fault` | No | Demo/test only. `after_gateway` injects one crash after the mock gateway records a success, to prove replay recovery. Only honoured when `DEMO_MODE=true`. |

### Roles

The synthetic users are returned by `GET /api/users`:

| Role | Can read | Can create/update vendors and invoices | Record payment | Approve / reject | Execute / retry | Change profile / reset |
| --- | --- | --- | --- | --- | --- | --- |
| `owner` | Yes | Yes | Yes | Yes | Yes | Yes |
| `accountant` | Yes | Yes | Yes | No | No | No |
| `staff` | Yes | Findings can be acknowledged | No | No | No | No |
| `system` | Read-only seed actor | No | No | No | No | No |

Role checks are enforced in the service layer, not only in the UI. A request with a missing or
unknown `X-Actor-Id` returns `401 ACTOR_REQUIRED`; a known user with the wrong role returns
`403 ROLE_NOT_ALLOWED`.

### Money

- All JSON money fields are **strings with exactly two decimal places**, for example `"12500.00"`.
- The currency is **INR**. Do not send floats such as `12500` or `12500.0` when a decimal string is
  expected.
- The React adapter stores integer **paise** internally and converts at the HTTP boundary.
- Invoice totals, balances and dashboard totals are computed deterministically in PostgreSQL and
  reconciled to the paisa. The API never trusts a client-supplied balance.

### Identifiers and dates

- IDs are UUID strings.
- Dates are ISO `YYYY-MM-DD`.
- Timestamps are ISO-8601 with an IST offset, for example `2026-10-27T18:40:00+05:30`.
- The demo "as of" timestamp is `business.asOf`; it drives ageing and due-date calculations.

### Error envelope

Every non-2xx response has this shape:

```json
{
  "error": {
    "code": "OVER_ALLOCATION",
    "message": "Only ₹7,500.00 is available on this invoice.",
    "details": {
      "available": "7500.00",
      "outstanding": "12500.00",
      "committed": "5000.00",
      "requested": "8000.00"
    },
    "correlation_id": "9f6f2a8c-8d9a-4f7d-b8d9-5f2b6a1c2d3e"
  }
}
```

`details` is always present (possibly `{}`). Log the `correlation_id`; the API also returns it in
the `X-Correlation-Id` response header.

### Lists

List endpoints return:

```json
{ "items": [], "next_cursor": null }
```

`limit` is accepted by the larger lists and is capped at 200. The audit endpoint accepts `cursor`.
The demo dataset is small enough that cursor paging is usually `null`.

---

## 2. Endpoint map

### System, workspace and demo

| Method | Path | Actor | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | None | Liveness, migration count, seed state and adapter labels. |
| `GET` | `/api/users` | None | Synthetic users used for `X-Actor-Id`. |
| `GET` | `/api/business` | None | Company profile. |
| `PATCH` | `/api/business` | Owner | Update company profile. |
| `GET` | `/api/workspace` | None | Full workspace in the React `DemoState` shape. |
| `PUT` | `/api/workspace` | Owner | Replace the whole workspace from a JSON backup. |
| `POST` | `/api/workspace/import` | Owner | Same replacement semantics as `PUT /api/workspace`. |
| `POST` | `/api/demo/reset` | None | Restore the deterministic seed. Only when demo mode is on. |
| `POST` | `/api/demo/force-failure` | Owner | Toggle the one-shot mock gateway failure. |
| `GET` | `/api/dashboard/summary` | None | Dues, overdue, pending approval, review counts and drill-down links. |
| `GET` | `/api/audit` | None | Audit timeline, filterable by entity or run. |

#### `GET /api/health`

```json
{
  "status": "ok",
  "api_version": "1.0.0",
  "database": "ok",
  "migrations": 6,
  "seeded": true,
  "adapters": { "extractor": "mock", "llm": "mock", "payments": "mock" },
  "simulated": true,
  "label": "SIMULATED — no money transferred"
}
```

If PostgreSQL is unreachable, the API returns `503 DB_UNAVAILABLE`. The React console treats a
failed health probe as "API unavailable" and keeps the browser-local workspace.

#### `GET /api/workspace`

Returns the complete state the console renders: `business`, `team`, `vendors`, `invoices`,
`payments`, `audit`, `role`, `forceNextFailure` and `seededAt`. Payment objects include their
server-issued `idempotencyKey`, which the console must send to execute the payment. Do not invent a
new key at execute time.

#### `PUT /api/workspace` and `POST /api/workspace/import`

Body: the workspace shape (a JSON backup or a CSV-derived workspace). The API validates vendors,
invoices, GSTINs, totals, duplicate links and payment allocations, then replaces the domain tables
in one transaction. A failed replacement changes nothing. The response is the canonical workspace.

#### `POST /api/demo/reset`

Restores the deterministic seed: 12 vendors, 16 invoices, 10 payments, 19 audit events and Ramesh
Patil as owner. **Destructive** for the current demo workspace. Disabled when `DEMO_MODE=false`.

#### `GET /api/dashboard/summary`

```json
{
  "as_of": "2026-10-27",
  "currency": "INR",
  "totals": {
    "total_dues": "383870.00",
    "overdue_amount": "101088.00",
    "pending_approval_amount": "7434.00"
  },
  "counts": {
    "open_invoices": 11,
    "overdue_invoices": 4,
    "pending_approvals": 1,
    "needs_review": 3
  },
  "by_vendor": [],
  "links": {
    "overdue": "/api/invoices?filter=overdue",
    "needs_review": "/api/invoices?filter=needs_review",
    "pending_approval": "/api/approvals?status=pending",
    "open": "/api/invoices?filter=open"
  }
}
```

The status buckets come from the same `invoice_balances` view as the list endpoints, so dashboard
numbers and drill-downs reconcile to the paisa.

---

### Vendors

| Method | Path | Actor | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/vendors?q=&limit=` | None | Search by name or GSTIN. |
| `GET` | `/api/vendors/{vendor_id}` | None | One vendor with bank state. |
| `POST` | `/api/vendors` | Owner, accountant | Create a vendor. |
| `PATCH` | `/api/vendors/{vendor_id}` | Owner, accountant | Update a vendor. |
| `POST` | `/api/vendors/{vendor_id}/verify-bank` | Owner | Clear a changed-bank block after phone verification. |

Create body fields include `name` (required), `gstin`, contact fields, `terms_days`,
`bank_name`, `bank_account_masked`, `bank_ifsc`, `bank_upi_id`, `bank_status` (`verified` or
`changed`) and `status` (`active` or `verify`). Response uses snake_case keys such as
`bank.account_masked`, `bank_status`, `terms_days`.

A vendor whose `bank.status` is `changed` cannot receive a new payment until an owner calls
`verify-bank`. The approval fingerprint includes the bank account, so changing it after approval
also makes the approval stale.

---

### Invoices

| Method | Path | Actor | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/invoices?filter=&vendor_id=&q=&limit=` | None | List invoice summaries. |
| `POST` | `/api/invoices` | Owner, accountant | Create an invoice with optional lines. |
| `POST` | `/api/invoices/upload` | Owner, accountant | Upload an image/PDF, keep the original, run mock extraction. |
| `GET` | `/api/invoices/{invoice_id}` | None | Full invoice with lines, findings, payments and balance. |
| `PATCH` | `/api/invoices/{invoice_id}` | Owner, accountant | Optimistic-version edit; can mark reviewed. |
| `POST` | `/api/invoices/{invoice_id}/validate` | None | Re-run deterministic checks and persist findings. |
| `GET` | `/api/invoices/{invoice_id}/payments` | None | Payment history for one invoice. |
| `POST` | `/api/invoices/{invoice_id}/payments` | Owner, accountant | Create a payment draft. Requires `Idempotency-Key`. |
| `POST` | `/api/invoices/{invoice_id}/revise` | Owner | Simulate a supplier revision; invalidates stale approvals. |
| `POST` | `/api/invoices/{invoice_id}/explain` | None | Evidence-backed explanation, rules-first. |

`filter` accepts `open`, `overdue`, `settled`, `pending_approval` and `needs_review`. An unknown
filter returns `422 FILTER_INVALID`. `vendor_id` filters by vendor and `q` searches invoice numbers.
The list response uses summaries; open the detail endpoint for `lines`, `findings`, `payments` and
`duplicate_candidates`.

#### Create invoice

```http
POST /api/invoices
X-Actor-Id: <accountant-uuid>
Content-Type: application/json

{
  "vendor_id": "175666be-6d85-5280-bc95-8f4fc9c06eca",
  "invoice_number": "ABC/26-27/0184",
  "invoice_date": "2026-10-12",
  "due_date": "2026-11-11",
  "gst_type": "intra",
  "gst_rate": "18.00",
  "subtotal": "10593.22",
  "cgst": "953.39",
  "sgst": "953.39",
  "tax_total": "1906.78",
  "total": "12500.00",
  "stated_total": "12500.00",
  "mark_reviewed": true,
  "lines": [
    {
      "description": "PVC insulated copper wire 2.5 sq mm",
      "quantity": "100",
      "unit": "m",
      "unit_rate": "105.93",
      "line_amount": "10593.22"
    }
  ]
}
```

A successful create is `201`. The detail response includes `version`, `status`,
`lifecycle_status`, `review_state`, `needs_review`, `has_blocking_findings`,
`balance.paid_amount`, `balance.committed_amount`, `balance.outstanding`,
`balance.payment_status`, `findings` and `duplicate_candidates`.

`PATCH` must include the current `version`. A stale version returns `409 VERSION_CONFLICT` with the
current record in `details.current`. Clients cannot set payment status through the payment patch
route; an attempt returns `422 FORGED_FIELD`.

#### Upload

```http
POST /api/invoices/upload
Content-Type: multipart/form-data
X-Actor-Id: <accountant-uuid>

file=<image-or-pdf>
vendor_id=<optional-uuid>
extractor=mock|off|garbage
```

Accepted files are PNG, JPEG and PDF up to `MAX_UPLOAD_MB` (10 MB by default), with magic-byte
checking. A mismatched extension/content pair returns `422 FILE_CONTENT_MISMATCH`; SVG and other
unsupported types return `415 UNSUPPORTED_FILE_TYPE`; an oversized file returns `413
FILE_TOO_LARGE`. Original filenames are sanitised and stored under a random name.

A successful upload is `201` and includes:

```json
{
  "invoice_id": "...",
  "lifecycle_status": "draft",
  "review_state": "unreviewed",
  "source_file": {
    "id": "...",
    "original_filename": "bill-241.png",
    "content_type": "image/png",
    "size_bytes": 12345,
    "sha256": "...",
    "url": "/api/files/..."
  },
  "extraction": {
    "engine": "mock",
    "status": "ok",
    "fields": {},
    "errors": [],
    "attempts": 1,
    "run_id": "..."
  },
  "invoice": {}
}
```

`extractor=off` records a skipped extraction and leaves a draft for manual entry.
`extractor=garbage` is a demo-only way to prove malformed model output is rejected three times and
falls back to manual entry. The original file remains available until the workspace is replaced.

#### Payment draft

```http
POST /api/invoices/{invoice_id}/payments
X-Actor-Id: <accountant-uuid>
Idempotency-Key: 3f6f9c4e-7b1d-4a2e-9c7f-2f7b6a1c2d3e
Content-Type: application/json

{
  "amount": "5000.00",
  "payment_date": "2026-10-27",
  "mode": "NEFT",
  "reference": "NEFT-ABC-0184",
  "note": "Part payment against running account"
}
```

`mode` is one of `NEFT`, `UPI`, `RTGS`, `Cheque`, `Cash`. A new draft returns `201`; replaying the
same key and body returns `200` with the existing payment. The draft is blocked by
`409 INVOICE_NOT_ACTIVE`, `409 INVOICE_UNREVIEWED`, `409 OVER_ALLOCATION` or
`409 INVOICE_HAS_BLOCKING_FINDINGS` where applicable. `OVER_ALLOCATION` subtracts paid, pending,
approved and failed-but-reserved amounts; `details` returns `available`, `outstanding`,
`committed` and `requested`.

The draft response has `status: "draft"`, `simulated: true`, `label`, `allocations`,
`idempotency_key`, `if_paid.outstanding_after` and an audit event `payment.created`. Recording a
draft does **not** move money.

#### Explain

```http
POST /api/invoices/{invoice_id}/explain
Content-Type: application/json

{ "simulate": "invented_number" }
```

Returns `explanation`, `source` (`rules` or `llm`), `label`, and optionally `rejected_ai` when a
model-proposed figure failed the deterministic guard. The demo path is rules-only and does not
require an API key. `simulate=invented_number` is a demo hook that proves invented figures are
discarded.

---

### Payments, approvals and runs

| Method | Path | Actor | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/payments?status=&limit=` | None | List payments. |
| `GET` | `/api/payments/{payment_id}` | None | One payment with approval and attempts. |
| `PATCH` | `/api/payments/{payment_id}` | Owner, accountant | Edit amount/date/note or cancel; invalidates approval. |
| `POST` | `/api/payments/{payment_id}/execute` | Owner | Atomically execute a simulated payment. Requires the original `Idempotency-Key`. |
| `POST` | `/api/payments/{payment_id}/retry` | Owner | Re-open a failed payment for a safe retry. |
| `POST` | `/api/runs` | Owner, accountant | Start the durable approval run for a draft. |
| `GET` | `/api/runs/{run_id}` | None | Run state, retry count, last error and steps. |
| `GET` | `/api/runs/{run_id}/trace` | None | Plain-language step trace. |
| `GET` | `/api/approvals?status=pending` | None | Approval queue. |
| `POST` | `/api/approvals/{approval_id}/decision` | Owner | Approve or reject with the current fingerprint. |

#### Run and approval flow

```http
POST /api/runs
X-Actor-Id: <accountant-uuid>

{ "payment_id": "<payment-uuid>" }
```

A successful run is `201` and returns the run id, `waiting_approval` status, the approval id and
fingerprint, and a summary including vendor, invoice number, amount and current outstanding. The
payment moves from `draft` to `pending_approval`.

```http
GET /api/approvals?status=pending
```

Each item includes `id`, `payment_id`, `status`, `fingerprint`, `requested_by`, `requested_at` and
`summary` (`vendor`, `invoice_number`, `amount`). The owner must send the **current** fingerprint:

```http
POST /api/approvals/{approval_id}/decision
X-Actor-Id: <owner-uuid>

{
  "decision": "approve",
  "fingerprint": "<current-fingerprint>"
}
```

Rejection requires a non-empty `reason`; omitting it returns `422 REASON_REQUIRED`. Approving or
rejecting with an old fingerprint returns `409 APPROVAL_STALE`. Approving moves the payment to
`approved`; rejecting moves it to `rejected` and permanently blocks execution.

#### Execute

```http
POST /api/payments/{payment_id}/execute
X-Actor-Id: <owner-uuid>
Idempotency-Key: <the payment's stored idempotency_key>
Content-Type: application/json

{}
```

- First success: `200`, `payment.status = "paid_simulated"`, `replayed: false`, a mock
  `gateway_reference`, `invoice_balance`, and one success attempt.
- Repeated execute with the same key: `200`, `replayed: true`, and the **same** gateway reference;
  no second attempt and no double allocation.
- Missing approval: `409 APPROVAL_REQUIRED`.
- Changed invoice/payment after approval: `409 APPROVAL_STALE`.
- Wrong or missing key: `400 IDEMPOTENCY_KEY_REQUIRED` or `409 IDEMPOTENCY_KEY_MISMATCH`.
- Forced/declined mock gateway: `502 GATEWAY_FAILED`, payment becomes `failed`, one failure attempt
  is recorded, and the balance is unchanged. Retry reuses the same payment record.
- Demo crash injection (`X-Demo-Fault: after_gateway`): `503 FAULT_INJECTED` after the mock gateway
  has recorded a success. Executing again with the same key recovers the original reference.

The execute transaction locks the payment and invoice, re-checks the owner role, the approval
fingerprint and the remaining balance immediately before charging the mock gateway, then writes the
attempt, allocation and audit event atomically. Ten parallel executes with the same key must produce
one success.

#### Retry

```http
POST /api/payments/{payment_id}/retry
X-Actor-Id: <owner-uuid>
```

Only a `failed` payment can be retried. The retry does not create a new payment or a new reference;
it moves the existing payment back to `approved` so the owner can execute it again. Retries are
bounded by `MAX_EXECUTE_ATTEMPTS` (3 by default).

---

### Findings, files and assistant

| Method | Path | Actor | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/findings/{finding_id}/acknowledge` | Owner, accountant, staff | Record a human acknowledgement note. |
| `GET` | `/api/files/{file_id}` | None | Stream the original uploaded file with `nosniff` and `no-store`. |
| `POST` | `/api/assistant/ask` | None | Grounded question answering over PostgreSQL. |

Acknowledgement body: `{ "note": "Supplier confirmed the difference on the phone." }`. A blocking
finding stops payment until it is either corrected on the invoice or acknowledged with a reason.
Duplicates are warnings and do not block.

The assistant is rules-first and falls back safely. A malformed retrieval query returns
`answer: "I can't determine that right now."` with `source: "none"` rather than inventing a figure.
The response includes `figures` with exact decimal strings and the invoice ids used.

---

## 3. Core end-to-end example

The console implements exactly this sequence in API mode.

```text
1. GET  /api/health                  -> seeded? if not, POST /api/demo/reset
2. GET  /api/users                   -> map owner/accountant/staff to UUIDs
3. GET  /api/workspace               -> render the console
4. POST /api/invoices/{id}/payments  -> draft, with Idempotency-Key
5. POST /api/runs                    -> pending_approval + approval fingerprint
6. POST /api/approvals/{id}/decision -> owner approves with fingerprint
7. POST /api/payments/{id}/execute   -> owner executes with the stored key
8. GET  /api/workspace               -> refresh balances, statuses and audit trail
```

Example result after step 7:

```json
{
  "payment": {
    "id": "...",
    "status": "paid_simulated",
    "amount": "5000.00",
    "simulated": true,
    "label": "SIMULATED — no money transferred",
    "gateway_reference": "SIM-20261027-1A2B3C4D",
    "attempts": [
      {
        "attempt_no": 1,
        "outcome": "success",
        "gateway_reference": "SIM-20261027-1A2B3C4D"
      }
    ]
  },
  "attempt": { "attempt_no": 1, "outcome": "success" },
  "replayed": false,
  "invoice_balance": {
    "total": "12500.00",
    "paid_amount": "5000.00",
    "committed_amount": "0.00",
    "outstanding": "7500.00",
    "payment_status": "partially_paid",
    "is_overdue": false
  }
}
```

---

## 4. Status values

| Domain | Values |
| --- | --- |
| Invoice lifecycle | `draft`, `active`, `void` |
| Invoice review | `unreviewed`, `reviewed` |
| Invoice display status | `Ready for approval`, `Needs review`, `Part-paid`, `Paid`, `Pending approval`, `Approved`, `Rejected`, `Payment failed` |
| Payment | `draft`, `pending_approval`, `approved`, `paid_simulated`, `failed`, `rejected`, `cancelled` |
| Approval | `pending`, `approved`, `rejected`, `invalidated` |
| Workflow run | `running`, `waiting_approval`, `waiting_execution`, `executing`, `succeeded`, `failed`, `cancelled`, `rejected` |

Allowed payment transitions are enforced server-side. `paid_simulated`, `rejected` and
`cancelled` are terminal. A failed payment is reopened only through `/retry`. Editing an amount
invalidates pending/approved approvals and cancels the live run.

---

## 5. Error codes

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Draft/execute request is missing a key, or it is outside 16–64 characters. |
| 400 | `IDEMPOTENCY_KEY_INVALID` | Key format is not acceptable. |
| 401 | `ACTOR_REQUIRED` | Missing, malformed or unknown `X-Actor-Id`. |
| 403 | `ROLE_NOT_ALLOWED` | The acting user cannot perform this action. |
| 404 | `INVOICE_NOT_FOUND`, `VENDOR_NOT_FOUND`, `PAYMENT_NOT_FOUND`, `RUN_NOT_FOUND`, `FILE_NOT_FOUND`, `APPROVAL_NOT_FOUND` | The referenced record does not exist. |
| 409 | `OVER_ALLOCATION` | Payment would exceed the available balance. |
| 409 | `INVOICE_NOT_ACTIVE` / `INVOICE_UNREVIEWED` | Invoice is a draft, void, or not human-reviewed. |
| 409 | `INVOICE_HAS_BLOCKING_FINDINGS` | A blocking exception must be corrected or acknowledged first. |
| 409 | `APPROVAL_REQUIRED` | No current owner approval exists. |
| 409 | `APPROVAL_STALE` | The invoice or vendor bank changed after approval. |
| 409 | `APPROVAL_NOT_PENDING` | The approval was already decided or invalidated. |
| 409 | `IDEMPOTENCY_KEY_REUSED` | The key was used for a different draft request. |
| 409 | `IDEMPOTENCY_KEY_MISMATCH` | Execute key differs from the payment's stored key. |
| 409 | `RUN_ALREADY_ACTIVE` | A live run already exists for this payment. |
| 409 | `VERSION_CONFLICT` | Optimistic concurrency check failed. |
| 409 | `PAYMENT_NOT_EDITABLE` / `PAYMENT_NOT_RETRYABLE` | The payment is in a terminal or non-retryable state. |
| 413 | `FILE_TOO_LARGE` | Upload exceeds `MAX_UPLOAD_MB`. |
| 415 | `UNSUPPORTED_FILE_TYPE` | Extension, MIME type or magic bytes are not allowed. |
| 422 | `VALIDATION_ERROR` | Request body/query did not match the schema; `details.errors` lists fields. |
| 422 | `FILE_CONTENT_MISMATCH` | The file bytes do not match the declared type. |
| 422 | `FORGED_FIELD` | Client attempted to set a server-owned field such as payment status. |
| 422 | `REASON_REQUIRED` | Rejection was requested without a reason. |
| 422 | `WORKSPACE_INVALID` | Imported/restored workspace failed validation. |
| 502 | `GATEWAY_FAILED` | The mock gateway declined. Nothing was paid; retry is safe. |
| 503 | `DB_UNAVAILABLE` | PostgreSQL is not reachable. Nothing was saved. |
| 503 | `FAULT_INJECTED` | Demo crash injection after the gateway. Replay the same key to recover. |
| 503 | `SEED_REQUIRED` | The workspace is empty; run `POST /api/demo/reset`. |

Unexpected server errors use `500 INTERNAL_ERROR` and the same envelope. Database outages never
partially commit: the service uses transactions and returns `DB_UNAVAILABLE` without changing state.

---

## 6. Demo-only behaviour

These hooks exist to make the hackathon demo observable and are intentionally small:

| Hook | Where | Effect |
| --- | --- | --- |
| `POST /api/demo/reset` | System | Restores the seed. Destructive. |
| `POST /api/demo/force-failure` | System | Arms the next mock transfer to fail once. |
| `extractor=off` | Upload form field | Skips extraction; leaves a manual-entry draft. |
| `extractor=garbage` | Upload form field | Simulates three malformed model outputs; manual fallback remains. |
| `simulate=fail_once` | Execute JSON | Declines once in the mock gateway without the DB toggle. |
| `X-Demo-Fault: after_gateway` | Execute header | Crashes after the mock gateway success to prove replay recovery. |
| `simulate=invented_number` | Explain JSON | Shows an invented model figure being rejected by the rules guard. |

None of these hooks touch a real payment network.

---

## 7. React integration notes

- The console calls `GET /api/health` once at startup. If it succeeds, PostgreSQL is the source of
  truth; otherwise the console continues with the browser-local demo.
- Add `?api=off` to the URL to force browser-local mode.
- `VITE_API_URL` overrides the default `http://127.0.0.1:8000`.
- Mutation helpers send `X-Actor-Id` for the currently selected role, then refetch
  `GET /api/workspace` so balances, approvals and audit events stay canonical.
- The payment object returned in the workspace includes `idempotencyKey`; the adapter sends it on
  execute. If it is missing (for example, a hand-edited localStorage record), the console refuses
  to execute and asks for a reset.
- CSV parsing and preview still happen in the browser. In API mode the validated workspace is sent
  to `PUT /api/workspace`; in local mode it stays in `localStorage`. A JSON backup is the exact
  workspace shape and works in both modes.
- The browser-local fallback is retained deliberately so the demo survives a missing database or a
  failed Wi-Fi connection.

---

## 8. Verification

From the repository root:

```powershell
python -m pip install -r backend/requirements-dev.txt
python -m pytest backend/tests -q
```

The suite starts an isolated PostgreSQL cluster with `embedded-postgres` (or uses
`LP_TEST_DATABASE_URL` if it ends in `_test`), applies the real migrations, starts the real FastAPI
process on a free port, and exercises T01–T31 over HTTP. `T29b` is skipped unless
`OLD_GEMINI_API_KEY` is set; it is an optional proof that the old Google key was revoked.

For an external disposable database:

```powershell
$env:LP_TEST_DATABASE_URL = "postgresql://ledger:ledger_demo_only@127.0.0.1:5432/ledgerpilot_test"
python -m pytest backend/tests -q
```

The test harness refuses a database URL whose name does not end in `_test`.
