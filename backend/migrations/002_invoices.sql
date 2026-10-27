-- LedgerPilot 002_invoices.sql
-- Bills, lines and deterministic findings. Duplicates are stored and flagged,
-- never blocked or merged.

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NULL REFERENCES vendors(id),
  invoice_number text NULL,
  invoice_number_norm text NULL,
  invoice_date date NULL,
  received_date date NULL,
  due_date date NULL,
  currency char(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  terms_days integer NULL CHECK (terms_days IS NULL OR terms_days BETWEEN 0 AND 365),
  po_number text NULL,
  grn_number text NULL,
  place_of_supply text NULL,
  gst_type text NOT NULL DEFAULT 'intra' CHECK (gst_type IN ('intra', 'inter')),
  gst_rate numeric(5,2) NULL CHECK (gst_rate IS NULL OR gst_rate BETWEEN 0 AND 100),
  subtotal numeric(14,2) NULL CHECK (subtotal >= 0),
  cgst numeric(14,2) NOT NULL DEFAULT 0 CHECK (cgst >= 0),
  sgst numeric(14,2) NOT NULL DEFAULT 0 CHECK (sgst >= 0),
  igst numeric(14,2) NOT NULL DEFAULT 0 CHECK (igst >= 0),
  tax_total numeric(14,2) NULL CHECK (tax_total >= 0),
  round_off numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NULL CHECK (total > 0),
  stated_total numeric(14,2) NULL CHECK (stated_total >= 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'upload', 'email')),
  duplicate_of uuid NULL REFERENCES invoices(id),
  notes text NULL,
  source_file_id uuid NULL REFERENCES uploaded_files(id),
  extraction_json jsonb NULL,
  review_state text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_state IN ('unreviewed', 'reviewed')),
  lifecycle_status text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_status IN ('draft', 'active', 'void')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_date IS NULL OR invoice_date IS NULL OR due_date >= invoice_date),
  CHECK (lifecycle_status = 'draft' OR (
    vendor_id IS NOT NULL AND invoice_number IS NOT NULL AND invoice_date IS NOT NULL
    AND total IS NOT NULL AND review_state = 'reviewed'
  ))
);

CREATE INDEX IF NOT EXISTS invoices_dup_idx
  ON invoices (vendor_id, invoice_number_norm);
CREATE INDEX IF NOT EXISTS invoices_dup_amt_idx
  ON invoices (vendor_id, total, invoice_date);
CREATE INDEX IF NOT EXISTS invoices_due_idx
  ON invoices (due_date) WHERE lifecycle_status = 'active';
CREATE INDEX IF NOT EXISTS invoices_vendor_idx
  ON invoices (vendor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no > 0),
  description text NOT NULL,
  hsn text NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit text NULL,
  unit_rate numeric(14,2) NOT NULL CHECK (unit_rate >= 0),
  line_amount numeric(14,2) NOT NULL CHECK (line_amount >= 0),
  gst_rate numeric(5,2) NULL CHECK (gst_rate IS NULL OR gst_rate BETWEEN 0 AND 100),
  UNIQUE (invoice_id, line_no)
);

CREATE TABLE IF NOT EXISTS invoice_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  message text NOT NULL,
  evidence_json jsonb NOT NULL,
  evidence_hash text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved')),
  acknowledged_by uuid NULL REFERENCES app_users(id),
  acknowledged_note text NULL,
  acknowledged_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, rule_code, evidence_hash),
  CHECK (status <> 'acknowledged' OR (
    acknowledged_by IS NOT NULL AND length(trim(acknowledged_note)) > 0
  ))
);

CREATE INDEX IF NOT EXISTS findings_open_idx
  ON invoice_findings (invoice_id) WHERE status = 'open';
