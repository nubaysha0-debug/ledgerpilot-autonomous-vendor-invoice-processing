-- LedgerPilot 005_views.sql
-- Balances are derived only here. A pending transfer is committed but never
-- reduces the outstanding balance.
--
-- The as-of date is read from business_settings rather than now() so the
-- synthetic demo can show the same overdue figures after any date.

CREATE OR REPLACE VIEW invoice_balances AS
WITH s AS (
  SELECT a.invoice_id,
         SUM(a.amount) FILTER (WHERE p.status = 'paid_simulated') AS paid,
         SUM(a.amount) FILTER (
           WHERE p.status IN ('pending_approval', 'approved', 'failed')
         ) AS committed
  FROM payment_allocations a
  JOIN payments p ON p.id = a.payment_id
  GROUP BY a.invoice_id
), b AS (
  SELECT COALESCE(as_of, now())::date AS today FROM business_settings WHERE id = 'primary'
)
SELECT i.id AS invoice_id,
       i.vendor_id,
       i.lifecycle_status,
       i.total,
       COALESCE(s.paid, 0)::numeric(14,2) AS paid_amount,
       COALESCE(s.committed, 0)::numeric(14,2) AS committed_amount,
       (i.total - COALESCE(s.paid, 0))::numeric(14,2) AS outstanding,
       CASE
         WHEN COALESCE(s.paid, 0) = 0 THEN 'unpaid'
         WHEN COALESCE(s.paid, 0) < i.total THEN 'partially_paid'
         ELSE 'settled'
       END AS payment_status,
       COALESCE(
         i.due_date < (SELECT today FROM b)
         AND COALESCE(s.paid, 0) < i.total,
         false
       ) AS is_overdue
FROM invoices i
LEFT JOIN s ON s.invoice_id = i.id;

CREATE OR REPLACE VIEW invoice_flags AS
SELECT i.id AS invoice_id,
       (
         i.review_state = 'unreviewed'
         OR EXISTS (
           SELECT 1 FROM invoice_findings f
           WHERE f.invoice_id = i.id AND f.status = 'open'
             AND f.severity IN ('error', 'warning')
         )
       ) AS needs_review,
       EXISTS (
         SELECT 1 FROM invoice_findings f
         WHERE f.invoice_id = i.id AND f.status = 'open'
           AND f.severity = 'error'
       ) AS has_blocking_findings
FROM invoices i;
