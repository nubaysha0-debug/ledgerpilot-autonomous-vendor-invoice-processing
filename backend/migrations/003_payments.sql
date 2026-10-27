-- LedgerPilot 003_payments.sql
-- Draft payments, allocations, approvals, mock attempts and the fake bank's
-- own ledger. No live payment adapter exists.

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  method_label text NOT NULL DEFAULT 'SIMULATED',
  payment_mode text NOT NULL DEFAULT 'NEFT'
    CHECK (payment_mode IN ('NEFT', 'UPI', 'RTGS', 'Cheque', 'Cash')),
  reference text NOT NULL,
  note text NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'rejected',
    'paid_simulated', 'failed', 'cancelled'
  )),
  idempotency_key text NOT NULL UNIQUE
    CHECK (length(idempotency_key) BETWEEN 16 AND 64),
  request_hash text NOT NULL,
  simulated boolean NOT NULL DEFAULT true CHECK (simulated = true),
  gateway_reference text NULL UNIQUE,
  paid_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 10),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'paid_simulated') = (
    gateway_reference IS NOT NULL AND paid_at IS NOT NULL
  ))
);

CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE INDEX IF NOT EXISTS payments_vendor_idx ON payments (vendor_id);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  UNIQUE (payment_id, invoice_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_alloc_per_payment_mvp
  ON payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS alloc_invoice_idx
  ON payment_allocations (invoice_id);

CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'invalidated')),
  requested_by uuid NOT NULL REFERENCES app_users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid NULL REFERENCES app_users(id),
  decided_at timestamptz NULL,
  reason text NULL,
  invalidated_reason text NULL,
  CHECK (status <> 'rejected' OR length(trim(reason)) > 0),
  CHECK (status IN ('pending', 'invalidated') OR (
    decided_by IS NOT NULL AND decided_at IS NOT NULL
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS one_open_approval
  ON approvals (payment_id) WHERE status IN ('pending', 'approved');

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  attempt_no integer NOT NULL CHECK (attempt_no BETWEEN 1 AND 10),
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  gateway_reference text NULL,
  error_code text NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, attempt_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_success_per_payment
  ON payment_attempts (payment_id) WHERE outcome = 'success';

CREATE TABLE IF NOT EXISTS mock_gateway_ledger (
  idempotency_key text NOT NULL,
  attempt_no integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  gateway_reference text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idempotency_key, attempt_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS gw_one_success
  ON mock_gateway_ledger (idempotency_key) WHERE outcome = 'success';
