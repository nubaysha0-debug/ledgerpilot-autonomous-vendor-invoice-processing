-- LedgerPilot 006_audit.sql
-- Audit rows are append-only by default. A database owner can drop the trigger;
-- this is tamper-evident-by-default, never "tamper-proof".

CREATE OR REPLACE FUNCTION audit_logs_append_only()
RETURNS trigger
LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END
$$;

DROP TRIGGER IF EXISTS audit_logs_no_change ON audit_logs;
CREATE TRIGGER audit_logs_no_change
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Public has no write rights by default in a fresh database, but this makes the
-- intent explicit for deployments that create a shared application role.
REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
