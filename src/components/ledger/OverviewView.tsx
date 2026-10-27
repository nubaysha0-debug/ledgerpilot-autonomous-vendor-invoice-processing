import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type {
  DemoState,
  InvoiceView,
  LedgerTotals,
} from '../../ledger/types';
import {
  formatDateTime,
  formatINR,
  dueLabel,
} from '../../ledger/money';
import { getAgeingBuckets, getVendorOutstanding } from '../../ledger/rules';
import {
  Button,
  Card,
  Money,
  PaymentStatusBadge,
  SectionHeading,
  StatusBadge,
} from './ui';

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: 'ink' | 'amber' | 'blue' | 'red';
  onClick?: () => void;
}) {
  const tones = {
    ink: 'bg-[#eef1ee] text-[#1f5c45]',
    amber: 'bg-[#fdf1e2] text-[#a15c12]',
    blue: 'bg-[#eef5fb] text-[#245b89]',
    red: 'bg-[#fbeceb] text-[#a3261f]',
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-[#e2e0d8] bg-white p-4 text-left shadow-[0_1px_2px_rgba(28,36,32,0.04)] transition-colors hover:border-[#c8c6bb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5c45]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-[#66706a]">
          {label}
        </span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 font-mono text-[22px] font-semibold tracking-tight text-[#1c2420] tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-[#66706a]">{hint}</div>
    </button>
  );
}

export function OverviewView({
  state,
  views,
  totals,
  onOpenInvoice,
  onGoToInvoices,
  onGoToPayments,
  onGoToVendors,
}: {
  state: DemoState;
  views: InvoiceView[];
  totals: LedgerTotals;
  onOpenInvoice: (invoiceId: string) => void;
  onGoToInvoices: (filter?: string) => void;
  onGoToPayments: () => void;
  onGoToVendors: () => void;
}) {
  const openInvoices = views.filter(
    (view) =>
      !view.invoice.duplicateOf &&
      view.status !== 'Paid' &&
      view.status !== 'Rejected',
  );
  const pendingPayments = state.payments
    .filter(
      (payment) =>
        payment.status === 'pending_approval' || payment.status === 'approved',
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending_approval' ? -1 : 1;
      return b.recordedAt.localeCompare(a.recordedAt);
    })
    .slice(0, 4);

  const exceptions = views
    .filter(
      (view) =>
        view.outstandingPaise > 0 &&
        view.checks.some((check) => check.status !== 'pass'),
    )
    .sort((a, b) => {
      const aFail = a.checks.filter((check) => check.status === 'fail').length;
      const bFail = b.checks.filter((check) => check.status === 'fail').length;
      return bFail - aFail;
    })
    .slice(0, 4);

  const ageing = getAgeingBuckets(views);
  const ageingMax = Math.max(1, ...ageing.map((bucket) => bucket.amountPaise));
  const recent = [...state.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  const vendorOutstanding = state.vendors
    .map((vendor) => ({
      vendor,
      amountPaise: getVendorOutstanding(views, vendor.id),
    }))
    .filter((item) => item.amountPaise > 0)
    .sort((a, b) => b.amountPaise - a.amountPaise)
    .slice(0, 5);
  const vendorMax = Math.max(1, ...vendorOutstanding.map((item) => item.amountPaise));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1f5c45]">
            Payables workspace
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[#1c2420]">
            Overview
          </h1>
          <p className="mt-1 text-[12.5px] text-[#66706a]">
            As of {formatDateTime(state.business.asOf)} IST · {state.invoices.length} invoices ·{' '}
            {state.vendors.length} vendors · synthetic data
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onGoToPayments}>
            Payments
          </Button>
          <Button onClick={() => onGoToInvoices('Needs review')}>
            Review exceptions
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total payable"
          value={formatINR(totals.payablePaise)}
          hint={`${openInvoices.length} open invoices, including part-paid`}
          icon={<Wallet className="h-3.5 w-3.5" />}
          tone="ink"
          onClick={() => onGoToInvoices('All')}
        />
        <KpiCard
          label="Overdue"
          value={formatINR(totals.overduePaise)}
          hint={`${totals.overdueCount} invoices past the due date`}
          icon={<Clock className="h-3.5 w-3.5" />}
          tone="amber"
          onClick={() => onGoToInvoices('Overdue')}
        />
        <KpiCard
          label="Needs owner approval"
          value={String(totals.pendingApprovalCount)}
          hint={`${formatINR(totals.pendingApprovalPaise)} waiting for Ramesh`}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          tone="blue"
          onClick={onGoToPayments}
        />
        <KpiCard
          label="Open exceptions"
          value={String(totals.exceptionCount)}
          hint="Arithmetic, duplicate, bank or PO issues"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          tone="red"
          onClick={() => onGoToInvoices('Needs review')}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#eeede8] px-4 py-3">
            <SectionHeading
              title="Needs your approval"
              subtitle="Only the owner can approve a payment"
            />
            <button
              type="button"
              onClick={onGoToPayments}
              className="text-[11px] font-medium text-[#1f5c45] hover:underline"
            >
              View all
            </button>
          </div>
          <div className="flex-1 divide-y divide-[#f2f1ec]">
            {pendingPayments.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-[#66706a]">
                No payments waiting for approval.
              </div>
            ) : (
              pendingPayments.map((payment) => {
                const view = views.find((item) => item.invoice.id === payment.invoiceId);
                if (!view) return null;
                return (
                  <button
                    key={payment.id}
                    type="button"
                    onClick={() => onOpenInvoice(view.invoice.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fafaf7]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[12.5px] font-medium text-[#1c2420]">
                          {view.vendor.name}
                        </span>
                        <PaymentStatusBadge status={payment.status} />
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[#66706a]">
                        {view.invoice.invoiceNumber} · {payment.mode} ·{' '}
                        {dueLabel(view.invoice.dueDate, state.business.asOf)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money paise={payment.amountPaise} className="text-[12.5px] font-semibold text-[#1c2420]" />
                      <div className="mt-0.5 text-[10.5px] text-[#8a938d]">
                        {payment.status === 'approved' ? 'Ready to execute' : 'Awaiting approval'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-start gap-2 border-t border-[#eeede8] bg-[#fafaf7] px-4 py-2.5 text-[10.5px] leading-relaxed text-[#66706a]">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8a938d]" />
            Sunita records requests. Ramesh approves and executes. Execution writes a mock
            transaction id, never a bank transfer.
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#eeede8] px-4 py-3">
            <SectionHeading
              title="Exceptions to review"
              subtitle="Evidence is shown before any payment"
            />
            <button
              type="button"
              onClick={() => onGoToInvoices('Needs review')}
              className="text-[11px] font-medium text-[#1f5c45] hover:underline"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-[#f2f1ec]">
            {exceptions.map((view) => {
              const issue = view.checks.find((check) => check.status !== 'pass');
              return (
                <button
                  key={view.invoice.id}
                  type="button"
                  onClick={() => onOpenInvoice(view.invoice.id)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fafaf7]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[12.5px] font-medium text-[#1c2420]">
                        {view.vendor.name}
                      </span>
                      <StatusBadge status={view.status} />
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#66706a]">
                      {issue?.label}: {issue?.evidence}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money paise={view.outstandingPaise} className="text-[12.5px] font-semibold text-[#1c2420]" />
                    <div className="mt-0.5 text-[10.5px] text-[#8a938d]">
                      {view.invoice.invoiceNumber}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="border-b border-[#eeede8] px-4 py-3">
            <SectionHeading
              title="Payables ageing"
              subtitle="Outstanding amount by days past due"
            />
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {ageing.map((bucket, index) => (
                <div key={bucket.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-[#4e5a52]">
                      {bucket.label}
                      <span className="ml-1.5 text-[#8a938d]">({bucket.count})</span>
                    </span>
                    <Money paise={bucket.amountPaise} className="text-[#1c2420]" />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#f1f0ea]">
                    <div
                      className={
                        index === 0
                          ? 'h-full rounded-full bg-[#1f5c45]'
                          : index === 1
                            ? 'h-full rounded-full bg-[#c57a1c]'
                            : 'h-full rounded-full bg-[#a3261f]'
                      }
                      style={{ width: `${Math.max(2, (bucket.amountPaise / ageingMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[#eeede8] pt-4 sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#8a938d]">
                  Due in 7 days
                </div>
                <Money paise={totals.dueSoonPaise} className="mt-0.5 block text-[12px] font-semibold" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#8a938d]">
                  Approved to pay
                </div>
                <Money paise={totals.approvedToPayPaise} className="mt-0.5 block text-[12px] font-semibold" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#8a938d]">
                  Paid this month
                </div>
                <Money paise={totals.paidThisMonthPaise} className="mt-0.5 block text-[12px] font-semibold" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#8a938d]">
                  Simulated transfers
                </div>
                <div className="mt-0.5 text-[12px] font-semibold text-[#1c2420]">
                  {totals.simulatedPaymentCount}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="border-b border-[#eeede8] px-4 py-3">
            <SectionHeading title="Top vendor balances" subtitle="Open payables by supplier" />
          </div>
          <div className="divide-y divide-[#f2f1ec]">
            {vendorOutstanding.map((item) => (
              <button
                key={item.vendor.id}
                type="button"
                onClick={onGoToVendors}
                className="block w-full px-4 py-3 text-left transition-colors hover:bg-[#fafaf7]"
              >
                <div className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="truncate font-medium text-[#1c2420]">{item.vendor.name}</span>
                  <Money paise={item.amountPaise} className="shrink-0 text-[#1c2420]" />
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#f1f0ea]">
                  <div
                    className="h-full rounded-full bg-[#1f5c45]/70"
                    style={{ width: `${Math.max(3, (item.amountPaise / vendorMax) * 100)}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#eeede8] px-4 py-3">
          <SectionHeading
            title="Recent activity"
            subtitle="Every action is written to the audit trail"
          />
          <Button variant="ghost" size="sm" onClick={onGoToPayments}>
            Payments
          </Button>
        </div>
        <div className="divide-y divide-[#f2f1ec]">
          {recent.map((event) => (
            <div key={event.id} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f0ea] text-[9px] font-semibold text-[#4e5a52]">
                {event.actorRole === 'system' ? 'SYS' : event.actor.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-[#1c2420]">{event.summary}</span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-[#8a938d]">
                  {event.actor} · {event.action} · {formatDateTime(event.at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
