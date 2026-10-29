-- LedgerPilot 007_auth.sql
-- Authentication, workspace isolation, and team invite tables.
-- Works alongside the existing schema; all new tables live in the public
-- schema while per-workspace tables are in ws_<uuid> schemas.

-- ── Global auth tables (not per-workspace) ───────────────────────────────

-- One account per email address (password OR Google, extensible)
CREATE TABLE IF NOT EXISTS accounts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,
  password_hash text        NULL,       -- NULL = Google/SSO-only account
  full_name     text        NOT NULL CHECK (length(trim(full_name)) > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_ci ON accounts (lower(email));

-- Active browser sessions (HttpOnly cookie carries the token)
CREATE TABLE IF NOT EXISTS sessions (
  token         text        PRIMARY KEY,
  account_id    uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workspace_id  uuid        NOT NULL,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_account_idx   ON sessions (account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx   ON sessions (expires_at);

-- One row per workspace (the root object for data isolation)
CREATE TABLE IF NOT EXISTS workspaces (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name text  NOT NULL UNIQUE,   -- e.g. "ws_a1b2c3d4"
  owner_id    uuid  NOT NULL REFERENCES accounts(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Maps accounts → workspaces with a role inside that workspace
CREATE TABLE IF NOT EXISTS workspace_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  ledger_role  text NOT NULL CHECK (ledger_role IN ('owner','accountant','staff')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, account_id)
);

CREATE INDEX IF NOT EXISTS wm_workspace_idx ON workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS wm_account_idx   ON workspace_members (account_id);

-- Pending email invites
CREATE TABLE IF NOT EXISTS invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invited_by   uuid NOT NULL REFERENCES accounts(id),
  email        text NOT NULL,
  ledger_role  text NOT NULL CHECK (ledger_role IN ('accountant','staff')),
  token        text NOT NULL UNIQUE,         -- generated in Python via secrets.token_hex
  accepted     boolean NOT NULL DEFAULT false,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invites_token_idx ON invites (token) WHERE NOT accepted;
