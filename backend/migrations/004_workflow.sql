-- LedgerPilot 004_workflow.sql
-- Durable workflow state and append-only-by-default audit history.

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL
    CHECK (run_type IN ('payment_request', 'invoice_extraction')),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN (
    'running', 'waiting_approval', 'waiting_execution', 'executing',
    'completed', 'rejected', 'cancelled', 'failed'
  )),
  current_step text NULL,
  context jsonb NOT NULL DEFAULT '{}',
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 5),
  last_error text NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_live_run_per_entity
  ON workflow_runs (run_type, entity_id)
  WHERE status IN ('running', 'waiting_approval', 'waiting_execution', 'executing');

CREATE TABLE IF NOT EXISTS workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  step_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'done', 'failed', 'skipped')),
  input_json jsonb NULL,
  output_json jsonb NULL,
  error text NULL,
  explanation text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  UNIQUE (run_id, step_no)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  summary text NOT NULL,
  before_json jsonb NULL,
  after_json jsonb NULL,
  run_id uuid NULL,
  correlation_id uuid NULL,
  prev_hash text NULL,
  row_hash text NULL
);

CREATE INDEX IF NOT EXISTS audit_entity_idx
  ON audit_logs (entity_type, entity_id, id);
CREATE INDEX IF NOT EXISTS audit_run_idx ON audit_logs (run_id);
CREATE INDEX IF NOT EXISTS audit_time_idx ON audit_logs (occurred_at DESC);
