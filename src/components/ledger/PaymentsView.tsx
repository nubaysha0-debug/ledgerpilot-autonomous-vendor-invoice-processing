import type { ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Ban,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import type { DemoState, InvoiceView, Payment } from '../../ledger/types';
import { formatDate, formatDateTime, formatINR } from '../../ledger/money';
import {
  Button,
  Card,
  EmptyState,
  Money,
  PaymentStatusBadge,
  SectionHeading,
  SimulatedStamp,
} from './ui';

function QueueRow({
  payment,
  view,
  children,
}: {
  payment: Payment;
  view: InvoiceView;
  children: ReactNode;
}) {
  const stale =
    view.approvalStale && view.activePayment?.id === payment.id;

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-[#1c2420]">{view.vendor.name}</span>
          <PaymentStatusBadge status={payment.status} />
          {stale ? (
            <span className="rounded-md border border-[#efd0b2] bg-[#fdf1e5] px-1.5 py-0.5 text-[10px] font-medium text-[#9a4a0d]">
              Approval stale
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#66706a]">
          <span className="font-mono text-[10.5px]">{view.invoice.invoiceNumber}</span>
          <span>·</span>
          <span>{payment.mode}</span>
          <span>·</span>
          <span className="font-mono text-[10.5px]">{payment.reference}</span>
        </div>
        <div className="mt-0.5 text-[10.5px] text-[#8a938d]">
          Requested {formatDate(payment.recordedAt)} · {payment.recordedBy}
          {payment.approvedBy ? ` · Approved by ${payment.approvedBy}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:pl-4">
        <Money paise={payment.amountPaise} className="text-[14px] font-semibold text-[#1c2420]" />
        <div className="flex items-center gap-1.5">{children}</div>
      </div>
    </div>
  );
}

export function PaymentsView({
  state,
  views,
  onOpenInvoice,
  onApprove,
  onReject,
  onExecute,
  onRetry,
}: {
  state: DemoState;
  views: InvoiceView[];
  onOpenInvoice: (invoiceId: string) => void;
  onApprove: (paymentId: string) => void;
  onReject: (paymentId: string) => void;
  onExecute: (paymentId: string) => void;
  onRetry: (paymentId: string) => void;
}) {
  const viewFor = (payment: Payment) =>
    views.find((view) => view.invoice.id === payment.invoiceId);

  const pending = state.payments
    .filter((payment) => payment.status === 'pending_approval')
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const approved = state.payments
    .filter((payment) => payment.status === 'approved')
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const failed = state.payments
    .filter((payment) => payment.status === 'failed')
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const history = [...state.payments].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const approvedTotal = approved.reduce((sum, payment) => sum + payment.amountPaise, 0);
  const simulatedTotal = state.payments
    .filter((payment) => payment.status === 'simulated')
    .reduce((sum, payment) => sum + payment.amountPaise, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1f5c45]">
            Maker-checker queue
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[#1c2420]">
            Payments
          </h1>
          <p className="mt-1 text-[12.5px] text-[#66706a]">
            {state.payments.length} payment records · simulated only · no bank connection
          </p>
          <SimulatedStamp className="mt-2" />
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-[#e2e0d8] bg-white px-4 py-2.5">
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8a938d]">Awaiting approval</div>
            <Money
              paise={pending.reduce((sum, payment) => sum + payment.amountPaise, 0)}
              className="text-[13px] font-semibold text-[#245b89]"
            />
          </div>
          <div className="h-7 w-px bg-[#eeede8]" />
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8a938d]">Approved to pay</div>
            <Money paise={approvedTotal} className="text-[13px] font-semibold text-[#1f5c45]" />
          </div>
          <div className="h-7 w-px bg-[#eeede8]" />
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-[#8a938d]">Simulated paid</div>
            <Money paise={simulatedTotal} className="text-[13px] font-semibold text-[#1c2420]" />
          </div>
        </div>
      </div>

      {state.role !== 'owner' ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#efd7ad] bg-[#fdf8ee] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#7a4a12]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You are acting as{' '}
            <strong>{state.team.find((member) => member.role === state.role)?.name}</strong>. Only
            Ramesh Patil (owner) can approve, reject, or execute payments. Switch role in the header
            to run the maker-checker flow.
          </span>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#eeede8] px-4 py-3">
            <SectionHeading
              title="Awaiting owner approval"
              subtitle="Accountant submits. Owner approves. Nothing is auto-paid."
            />
            <span className="rounded-md bg-[#eef5fb] px-2 py-0.5 text-[11px] font-semibold text-[#245b89]">
              {pending.length}
            </span>
          </div>
          <div className="divide-y divide-[#f2f1ec]">
            {pending.length === 0 ? (
              <EmptyState
                title="No requests waiting"
                description="New payment requests recorded by the accountant will appear here."
              />
            ) : (
              pending.map((payment) => {
                const view = viewFor(payment);
                if (!view) return null;
                return (
                  <QueueRow key={payment.id} payment={payment} view={view}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenInvoice(view.invoice.id)}
                    >
                      Details
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-[#8f2a23]"
                      onClick={() => onReject(payment.id)}
                    >
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => onApprove(payment.id)}>
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                  </QueueRow>
                );
              })
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#eeede8] px-4 py-3">
            <SectionHeading
              title="Approved, ready to execute"
              subtitle="Execution is the simulated disbursement step"
            />
            <span className="rounded-md bg-[#edf6ef] px-2 py-0.5 text-[11px] font-semibold text-[#1f5c45]">
              {approved.length}
            </span>
          </div>
          <div className="divide-y divide-[#f2f1ec]">
            {approved.length === 0 ? (
              <EmptyState
                title="Nothing approved"
                description="Approved payments wait here until the owner executes the simulated transfer."
              />
            ) : (
              approved.map((payment) => {
                const view = viewFor(payment);
                if (!view) return null;
                const stale = view.approvalStale && view.activePayment?.id === payment.id;
                return (
                  <QueueRow key={payment.id} payment={payment} view={view}>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenInvoice(view.invoice.id)}
                    >
                      Details
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
                  </QueueRow>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {failed.length > 0 ? (
        <Card className="overflow-hidden border-[#efc9c5]">
          <div className="flex items-center justify-between border-b border-[#f5dedb] bg-[#fdf4f3] px-4 py-3">
            <SectionHeading
              title="Failed payments"
              subtitle="The mock gateway declined these transfers. Retry is safe."
            />
            <span className="rounded-md bg-[#fbeceb] px-2 py-0.5 text-[11px] font-semibold text-[#a3261f]">
              {failed.length}
            </span>
          </div>
          <div className="divide-y divide-[#f2f1ec]">
            {failed.map((payment) => {
              const view = viewFor(payment);
              if (!view) return null;
              return (
                <QueueRow key={payment.id} payment={payment} view={view}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenInvoice(view.invoice.id)}
                  >
                    Details
                  </Button>
                  <Button size="sm" onClick={() => onRetry(payment.id)}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                </QueueRow>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#eeede8] px-4 py-3">
          <SectionHeading
            title="All payment records"
            subtitle="Highest-risk controls: approval, fingerprint, idempotent execution"
          />
          <Button variant="ghost" size="sm" onClick={() => onOpenInvoice(history[0]?.invoiceId ?? '')}>
            Open latest
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#eeede8] bg-[#fafaf7] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a938d]">
                <th className="px-3.5 py-2.5">Payment</th>
                <th className="px-3.5 py-2.5">Vendor & invoice</th>
                <th className="px-3.5 py-2.5">Mode</th>
                <th className="px-3.5 py-2.5 text-right">Amount</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5">Approved / executed</th>
                <th className="px-3.5 py-2.5">Mock transaction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f1ec]">
              {history.map((payment) => {
                const view = viewFor(payment);
                if (!view) return null;
                return (
                  <tr
                    key={payment.id}
                    onClick={() => onOpenInvoice(view.invoice.id)}
                    className="cursor-pointer transition-colors hover:bg-[#fafaf7]"
                  >
                    <td className="px-3.5 py-3">
                      <div className="font-mono text-[10.5px] font-medium text-[#1c2420]">
                        {payment.reference}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#8a938d]">
                        #{payment.attempt} · {payment.recordedBy}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="max-w-[200px] truncate text-[11.5px] font-medium text-[#1c2420]">
                        {view.vendor.name}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-[#8a938d]">
                        {view.invoice.invoiceNumber}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-[11px] text-[#3e4742]">{payment.mode}</td>
                    <td className="px-3.5 py-3 text-right">
                      <Money paise={payment.amountPaise} className="text-[11.5px] font-semibold text-[#1c2420]" />
                    </td>
                    <td className="px-3.5 py-3">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                    <td className="px-3.5 py-3 text-[10.5px] leading-relaxed text-[#66706a]">
                      {payment.approvedAt ? (
                        <div>
                          Approved {formatDateTime(payment.approvedAt)}
                          <br />
                          {payment.approvedBy}
                        </div>
                      ) : (
                        <div>Not approved</div>
                      )}
                      {payment.executedAt ? (
                        <div className="text-[#2f7a54]">Executed {formatDateTime(payment.executedAt)}</div>
                      ) : null}
                      {payment.failureReason ? (
                        <div className="text-[#a3261f]">{payment.failureReason}</div>
                      ) : null}
                    </td>
                    <td className="px-3.5 py-3">
                      {payment.mockTxnId ? (
                        <span className="font-mono text-[10px] text-[#4e5a52]">{payment.mockTxnId}</span>
                      ) : (
                        <span className="text-[10.5px] text-[#8a938d]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eeede8] bg-[#fafaf7] px-3.5 py-2.5 text-[11px] text-[#66706a]">
          <span className="inline-flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5 text-[#8a938d]" />
            No payment leaves this demo. Execution writes a mock transaction id and an audit event.
          </span>
          <span className="font-mono text-[10px] text-[#8a938d]">
            Paid to date {formatINR(simulatedTotal)}
          </span>
        </div>
      </Card>
    </div>
  );
}
