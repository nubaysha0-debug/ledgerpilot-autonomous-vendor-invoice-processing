import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Building2,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  Landmark,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import type { DemoState, InvoiceView, Payment } from '../../ledger/types';
import {
  dueLabel,
  formatDate,
  formatDateTime,
  formatINR,
} from '../../ledger/money';
import { InvoiceDocument } from './InvoiceDocument';
import {
  Button,
  CheckRow,
  Money,
  PaymentStatusBadge,
  SimulatedStamp,
  StatusBadge,
  cn,
} from './ui';

type DrawerTab = 'summary' | 'document' | 'activity';

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.09em] text-lp-ink-faint">
        {label}
      </div>
      <div className="mt-0.5 text-[11.5px] leading-relaxed text-lp-ink">{value}</div>
    </div>
  );
}

function PaymentCard({
  payment,
  view,
  onApprove,
  onReject,
  onExecute,
  onRetry,
}: {
  payment: Payment;
  view: InvoiceView;
  onApprove: (paymentId: string) => void;
  onReject: (paymentId: string) => void;
  onExecute: (paymentId: string) => void;
  onRetry: (paymentId: string) => void;
}) {
  const stale = payment.status === 'approved' && view.approvalStale && view.activePayment?.id === payment.id;

  return (
    <div className="rounded-lg border border-lp-line bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Money paise={payment.amountPaise} className="text-[14px] font-semibold text-lp-ink" />
            <span className="text-[10.5px] text-lp-ink-faint">{payment.mode}</span>
            <PaymentStatusBadge status={payment.status} />
            {stale ? (
              <span className="rounded border border-lp-warning-border bg-lp-warning-wash px-1.5 py-0.5 text-[9.5px] font-medium text-lp-warning">
                stale approval
              </span>
            ) : null}
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-lp-ink-muted">{payment.reference}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {payment.status === 'pending_approval' ? (
            <>
              <Button size="sm" variant="secondary" className="text-lp-danger" onClick={() => onReject(payment.id)}>
                Reject
              </Button>
              <Button size="sm" onClick={() => onApprove(payment.id)}>
                <BadgeCheck className="h-3.5 w-3.5" />
                Approve
              </Button>
            </>
          ) : null}
          {payment.status === 'approved' ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                className="text-lp-danger"
                onClick={() => onReject(payment.id)}
              >
                Reject
              </Button>
              {stale ? (
                <Button size="sm" variant="secondary" onClick={() => onApprove(payment.id)}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-approve
                </Button>
              ) : (
                <Button size="sm" onClick={() => onExecute(payment.id)}>
                  <Zap className="h-3.5 w-3.5" />
                  Execute
                </Button>
              )}
            </>
          ) : null}
          {payment.status === 'failed' ? (
            <Button size="sm" onClick={() => onRetry(payment.id)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 grid gap-x-4 gap-y-1 border-t border-lp-line-soft pt-2 text-[10.5px] text-lp-ink-muted sm:grid-cols-2">
        <div>
          Recorded by {payment.recordedBy} · {formatDateTime(payment.recordedAt)}
        </div>
        <div>
          {payment.approvedAt
            ? `Approved ${formatDateTime(payment.approvedAt)} · ${payment.approvedBy}`
            : 'Not approved yet'}
        </div>
        {payment.executedAt ? (
          <div className="text-lp-success">
            Simulated {formatDateTime(payment.executedAt)}
            {payment.mockTxnId ? ` · ${payment.mockTxnId}` : ''}
          </div>
        ) : null}
        {payment.note ? <div className="sm:col-span-2">Note: {payment.note}</div> : null}
        {payment.failureReason ? (
          <div className="text-lp-danger sm:col-span-2">{payment.failureReason}</div>
        ) : null}
        {payment.rejectionReason ? (
          <div className="text-lp-danger sm:col-span-2">Rejected: {payment.rejectionReason}</div>
        ) : null}
      </div>
    </div>
  );
}

export function InvoiceDrawer({
  state,
  view,
  onClose,
  onRecordPayment,
  onApprove,
  onReject,
  onExecute,
  onRetry,
  onRevise,
  onVerifyBank,
}: {
  state: DemoState;
  view: InvoiceView;
  onClose: () => void;
  onRecordPayment: () => void;
  onApprove: (paymentId: string) => void;
  onReject: (paymentId: string) => void;
  onExecute: (paymentId: string) => void;
  onRetry: (paymentId: string) => void;
  onRevise: () => void;
  onVerifyBank: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>('summary');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const blocked = view.checks.filter((check) => check.status === 'fail');
  const canRecord =
    view.availablePaise > 0 &&
    blocked.length === 0 &&
    !view.invoice.duplicateOf &&
    view.status !== 'Paid' &&
    view.status !== 'Rejected';
  const paymentIds = view.payments.map((payment) => payment.id);
  const activity = [...state.audit]
    .filter(
      (event) =>
        event.entityId === view.invoice.id ||
        paymentIds.includes(event.entityId) ||
        (event.entityType === 'vendor' && event.entityId === view.vendor.id),
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  const recordReason = view.invoice.duplicateOf
    ? 'Duplicate copies cannot be paid.'
    : view.status === 'Paid'
      ? 'This invoice is fully paid.'
      : view.status === 'Rejected'
        ? 'This invoice was rejected.'
        : blocked.length > 0
          ? 'Resolve the blocking exceptions first.'
          : view.availablePaise <= 0
            ? 'No available balance to pay.'
            : '';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-lp-overlay/40 backdrop-blur-[2px]"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Invoice ${view.invoice.invoiceNumber}`}
    >
      <div
        className="flex h-full w-full max-w-3xl flex-col border-l border-lp-line bg-lp-canvas shadow-[-12px_0_40px_rgba(15,23,18,0.18)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-lp-line bg-lp-surface-muted">
          <div className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-lp-ink-faint">
                  Invoice
                </span>
                <span className="font-mono text-[11.5px] font-semibold text-lp-ink">
                  {view.invoice.invoiceNumber}
                </span>
                <StatusBadge status={view.status} />
                {view.invoice.version > 1 ? (
                  <span className="rounded border border-lp-line bg-white px-1.5 py-0.5 text-[9.5px] font-medium text-lp-ink-faint">
                    Rev {view.invoice.version}
                  </span>
                ) : null}
                {view.invoice.importedAt ? (
                  <span className="inline-flex items-center gap-1 rounded border border-lp-info-border bg-lp-info-wash px-1.5 py-0.5 text-[9.5px] font-medium text-lp-info">
                    <FileSpreadsheet className="h-2.5 w-2.5" />
                    Imported
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-lp-ink">
                  <Building2 className="h-3.5 w-3.5 text-lp-ink-faint" />
                  {view.vendor.name}
                </span>
                <span className="text-[10.5px] text-lp-ink-faint">
                  {view.vendor.category} · {view.vendor.city}
                </span>
              </div>
              <div className="mt-0.5 text-[10.5px] text-lp-ink-muted">
                {dueLabel(view.invoice.dueDate, state.business.asOf)} ·{' '}
                {view.invoice.importedAt
                  ? 'Imported from CSV'
                  : view.invoice.source === 'email'
                    ? 'Received by email'
                    : view.invoice.source === 'upload'
                      ? 'Uploaded by the team'
                      : 'Entered manually'}
                {view.invoice.duplicateOf ? ' · duplicate copy' : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice"
              className="rounded-md p-1.5 text-lp-ink-muted transition-colors hover:bg-lp-surface-sunken hover:text-lp-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-1 px-3 pb-0 sm:px-5">
            {(
              [
                ['summary', 'Summary'],
                ['document', 'Invoice document'],
                ['activity', `Activity (${activity.length})`],
              ] as Array<[DrawerTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'border-b-2 px-3 py-2 text-[11.5px] font-medium transition-colors',
                  tab === key
                    ? 'border-lp-primary text-lp-primary'
                    : 'border-transparent text-lp-ink-muted hover:text-lp-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {tab === 'summary' ? (
            <div className="space-y-4">
              {view.invoice.importedAt ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-lp-info-border bg-lp-info-wash p-3 text-[11.5px] leading-relaxed text-lp-info">
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Imported from CSV</div>
                    <div className="mt-0.5">
                      Loaded into this browser on{' '}
                      {formatDateTime(view.invoice.importedAt)}. The fields were supplied in the
                      import file, not read from the supplier&apos;s PDF. Check the original
                      invoice, GSTIN and bank details before paying.
                    </div>
                  </div>
                </div>
              ) : null}

              {view.approvalStale ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-lp-warning-border bg-lp-warning-wash p-3 text-[11.5px] leading-relaxed text-lp-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Approval no longer matches the invoice</div>
                    <div className="mt-0.5">
                      The invoice amount or the vendor bank account changed after approval. The
                      owner must re-approve before this payment can be executed.
                    </div>
                  </div>
                </div>
              ) : null}

              {view.invoice.duplicateOf ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-lp-danger-border bg-lp-danger-wash p-3 text-[11.5px] leading-relaxed text-lp-danger">
                  <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">Duplicate copy excluded from payables</div>
                    <div className="mt-0.5">
                      Same vendor, invoice number and amount as another invoice in the ledger. This
                      copy is retained for evidence and cannot be paid.
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-lg border border-lp-line bg-white p-2.5">
                  <div className="text-[9px] uppercase tracking-[0.08em] text-lp-ink-faint">Invoice total</div>
                  <Money paise={view.invoice.totalPaise} className="mt-0.5 block text-[13px] font-semibold text-lp-ink" />
                </div>
                <div className="rounded-lg border border-lp-line bg-white p-2.5">
                  <div className="text-[9px] uppercase tracking-[0.08em] text-lp-ink-faint">Paid</div>
                  <Money paise={view.paidPaise} className="mt-0.5 block text-[13px] font-semibold text-lp-success" />
                </div>
                <div className="rounded-lg border border-lp-line bg-white p-2.5">
                  <div className="text-[9px] uppercase tracking-[0.08em] text-lp-ink-faint">In approval</div>
                  <Money paise={view.reservedPaise} className="mt-0.5 block text-[13px] font-semibold text-lp-info" />
                </div>
                <div className="rounded-lg border border-lp-line bg-white p-2.5">
                  <div className="text-[9px] uppercase tracking-[0.08em] text-lp-ink-faint">Available</div>
                  <Money paise={view.availablePaise} className="mt-0.5 block text-[13px] font-semibold text-lp-primary" />
                </div>
              </div>

              <div className="rounded-lg border border-lp-line bg-white p-3.5">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-lp-ink">
                  <FileText className="h-3.5 w-3.5 text-lp-primary" />
                  Invoice details
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Detail label="Invoice date" value={formatDate(view.invoice.issueDate)} />
                  <Detail label="Received" value={formatDate(view.invoice.receivedDate)} />
                  <Detail
                    label="Due date"
                    value={
                      <span className={view.overdueDays > 0 ? 'font-medium text-lp-danger' : ''}>
                        {formatDate(view.invoice.dueDate)}
                      </span>
                    }
                  />
                  <Detail label="Payment terms" value={`${view.invoice.termsDays} days`} />
                  <Detail label="Purchase order" value={view.invoice.poNumber ?? 'Not linked'} />
                  <Detail label="Goods receipt" value={view.invoice.grnNumber ?? 'Not recorded'} />
                  <Detail label="Place of supply" value={view.invoice.placeOfSupply} />
                  <Detail
                    label="Tax split"
                    value={
                      view.invoice.gstType === 'intra'
                        ? `CGST ${(view.invoice.gstRate ?? 18) / 2}% + SGST ${(view.invoice.gstRate ?? 18) / 2}%`
                        : `IGST ${view.invoice.gstRate ?? 18}%`
                    }
                  />
                  <Detail
                    label="Vendor GSTIN"
                    value={<span className="font-mono">{view.vendor.gstin}</span>}
                  />
                  {view.invoice.poNumber ? null : (
                    <Detail label="PO exception" value="No PO linked for this purchase" />
                  )}
                </div>
                {view.invoice.notes ? (
                  <p className="mt-3 rounded-md bg-lp-surface-muted p-2 text-[10.5px] leading-relaxed text-lp-ink-muted">
                    {view.invoice.notes}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-lp-line bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-lp-ink">
                    <Landmark className="h-3.5 w-3.5 text-lp-primary" />
                    Vendor bank account
                  </div>
                  {view.vendor.bank.status === 'changed' ? (
                    <Button size="sm" variant="secondary" onClick={onVerifyBank}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Verify by phone
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-lp-success">
                      <ShieldCheck className="h-3 w-3" />
                      Verified
                    </span>
                  )}
                </div>
                <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-3">
                  <Detail label="Bank" value={view.vendor.bank.bankName} />
                  <Detail label="Account" value={<span className="font-mono">{view.vendor.bank.accountMasked}</span>} />
                  <Detail label="IFSC" value={<span className="font-mono">{view.vendor.bank.ifsc}</span>} />
                </div>
                {view.vendor.bank.status === 'changed' ? (
                  <p className="mt-2 rounded-md border border-lp-warning-border bg-lp-warning-wash p-2 text-[10.5px] leading-relaxed text-lp-warning">
                    Changed from {view.vendor.bank.previousAccountMasked} on{' '}
                    {formatDate(view.vendor.bank.changedAt ?? view.invoice.receivedDate)}. Call the
                    vendor on the number already on file before unblocking payment.
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-lp-line bg-white p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-lp-ink">
                    <ShieldCheck className="h-3.5 w-3.5 text-lp-primary" />
                    Deterministic checks
                  </div>
                  <span className="text-[10px] text-lp-ink-faint">{view.checks.length} checks run</span>
                </div>
                <div className="space-y-2">
                  {view.checks.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-lp-line bg-white p-3.5">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-lp-ink">
                    <ReceiptText className="h-3.5 w-3.5 text-lp-primary" />
                    Payment requests
                  </div>
                  <span className="text-[10px] text-lp-ink-faint">
                    {view.payments.length} record{view.payments.length === 1 ? '' : 's'}
                  </span>
                </div>
                <SimulatedStamp className="mb-2.5" />
                {view.payments.length === 0 ? (
                  <div className="rounded-md border border-dashed border-lp-line-strong px-3 py-5 text-center text-[11px] text-lp-ink-faint">
                    No payment recorded against this invoice.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...view.payments].reverse().map((payment) => (
                      <PaymentCard
                        key={payment.id}
                        payment={payment}
                        view={view}
                        onApprove={onApprove}
                        onReject={onReject}
                        onExecute={onExecute}
                        onRetry={onRetry}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-lp-line-soft pt-2">
                  <span className="text-[10px] text-lp-ink-faint">
                    Maker-checker: recording, approving and executing are separate actions.
                  </span>
                  {!view.invoice.duplicateOf && view.invoice.version < 4 ? (
                    <button
                      type="button"
                      onClick={onRevise}
                      className="text-[10.5px] font-medium text-lp-link hover:underline"
                    >
                      Record supplier revision
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-lg border border-lp-line bg-white p-2.5 text-[10.5px] leading-relaxed text-lp-ink-muted">
                  <CalendarDays className="mb-1 h-3.5 w-3.5 text-lp-ink-faint" />
                  Invoice {formatDate(view.invoice.issueDate)}
                  <br />
                  Due {formatDate(view.invoice.dueDate)}
                  <br />
                  <span className={view.overdueDays > 0 ? 'text-lp-danger' : ''}>
                    {dueLabel(view.invoice.dueDate, state.business.asOf)}
                  </span>
                </div>
                <div className="rounded-lg border border-lp-line bg-white p-2.5 text-[10.5px] leading-relaxed text-lp-ink-muted">
                  <Wallet className="mb-1 h-3.5 w-3.5 text-lp-ink-faint" />
                  Open balance
                  <br />
                  <span className="font-mono text-[12px] font-semibold text-lp-ink">
                    {formatINR(view.outstandingPaise)}
                  </span>
                  <br />
                  {view.paidPaise > 0 ? `${formatINR(view.paidPaise)} already paid` : 'No payments yet'}
                </div>
                <div className="rounded-lg border border-lp-line bg-white p-2.5 text-[10.5px] leading-relaxed text-lp-ink-muted">
                  <ShieldCheck className="mb-1 h-3.5 w-3.5 text-lp-ink-faint" />
                  Audit coverage
                  <br />
                  {activity.length} linked events
                  <br />
                  Approval tied to total + bank
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'document' ? (
            <InvoiceDocument
              invoice={view.invoice}
              vendor={view.vendor}
              business={state.business}
            />
          ) : null}

          {tab === 'activity' ? (
            <div className="rounded-lg border border-lp-line bg-white">
              {activity.length === 0 ? (
                <div className="px-4 py-8 text-center text-[11.5px] text-lp-ink-faint">
                  No activity recorded for this invoice.
                </div>
              ) : (
                <ol className="divide-y divide-lp-line-soft">
                  {activity.map((event) => (
                    <li key={event.id} className="flex items-start gap-3 px-3.5 py-3">
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-lp-primary/60" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11.5px] font-semibold text-lp-ink">
                            {event.action}
                          </span>
                          <span className="text-[10px] text-lp-ink-faint">
                            {formatDateTime(event.at)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-lp-ink-muted">
                          {event.summary}
                        </p>
                        {event.detail ? (
                          <p className="mt-0.5 text-[10px] leading-relaxed text-lp-ink-faint">
                            {event.detail}
                          </p>
                        ) : null}
                        <div className="mt-0.5 text-[9.5px] text-lp-ink-faint">
                          {event.actor} · {event.actorRole}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-lp-line bg-lp-surface-muted px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[9.5px] uppercase tracking-[0.08em] text-lp-ink-faint">
                Available to pay
              </div>
              <div className="text-[13px] font-semibold text-lp-ink">
                {formatINR(view.availablePaise)}
                {view.reservedPaise > 0 ? (
                  <span className="ml-2 text-[10px] font-normal text-lp-info">
                    {formatINR(view.reservedPaise)} in approval
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {view.vendor.bank.status === 'changed' ? (
                <Button variant="secondary" size="sm" onClick={onVerifyBank}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verify bank first
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={onRecordPayment}
                disabled={!canRecord}
                title={recordReason || 'Record a payment request'}
              >
                <Plus className="h-3.5 w-3.5" />
                Record payment
              </Button>
            </div>
          </div>
          {recordReason ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-lp-ink-faint">
              <AlertTriangle className="h-3 w-3" />
              {recordReason}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
