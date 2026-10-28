import { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Landmark,
  Search,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { DemoState, InvoiceView, Vendor } from '../../ledger/types';
import { formatDate } from '../../ledger/money';
import {
  getVendorOpenInvoices,
  getVendorOutstanding,
  getVendorOverdue,
} from '../../ledger/rules';
import { Button, Card, EmptyState, Money, cn } from './ui';

function VendorBank({ vendor, onVerify }: { vendor: Vendor; onVerify: () => void }) {
  if (vendor.bank.status === 'changed') {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-lp-warning">
          <ShieldAlert className="h-3.5 w-3.5" />
          Account changed
        </div>
        <div className="mt-0.5 text-[10.5px] leading-relaxed text-lp-ink-muted">
          {vendor.bank.previousAccountMasked} → {vendor.bank.accountMasked}
          {vendor.bank.changedAt ? ` on ${formatDate(vendor.bank.changedAt)}` : ''}
        </div>
        <button
          type="button"
          onClick={onVerify}
          className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-lp-warning-border bg-lp-warning-wash px-2 py-1 text-[10.5px] font-medium text-lp-warning hover:bg-lp-warning-wash"
        >
          <ShieldCheck className="h-3 w-3" />
          Verify by phone
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11.5px] text-lp-ink">
        <Landmark className="h-3.5 w-3.5 text-lp-ink-faint" />
        {vendor.bank.bankName}
      </div>
      <div className="mt-0.5 font-mono text-[10.5px] text-lp-ink-muted">
        {vendor.bank.accountMasked} · {vendor.bank.ifsc}
      </div>
      <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-lp-success">
        <CheckCircle2 className="h-3 w-3" />
        Verified
      </div>
    </div>
  );
}

export function VendorsView({
  state,
  views,
  onShowVendorInvoices,
  onVerifyBank,
}: {
  state: DemoState;
  views: InvoiceView[];
  onShowVendorInvoices: (vendorId: string) => void;
  onVerifyBank: (vendorId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [onlyWithBalance, setOnlyWithBalance] = useState(false);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return state.vendors
      .map((vendor) => {
        const open = getVendorOpenInvoices(views, vendor.id);
        return {
          vendor,
          openCount: open.length,
          outstandingPaise: getVendorOutstanding(views, vendor.id),
          overduePaise: getVendorOverdue(views, vendor.id),
          lastPayment: open
            .flatMap((view) => view.payments)
            .filter((payment) => payment.status === 'simulated')
            .map((payment) => payment.executedAt ?? payment.recordedAt)
            .sort()
            .at(-1),
        };
      })
      .filter((row) => {
        if (onlyWithBalance && row.outstandingPaise <= 0) return false;
        if (!query) return true;
        return [
          row.vendor.name,
          row.vendor.category,
          row.vendor.city,
          row.vendor.gstin,
          row.vendor.bank.bankName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (b.outstandingPaise !== a.outstandingPaise) {
          return b.outstandingPaise - a.outstandingPaise;
        }
        return a.vendor.name.localeCompare(b.vendor.name);
      });
  }, [state.vendors, views, search, onlyWithBalance]);

  const withBalance = state.vendors.filter(
    (vendor) => getVendorOutstanding(views, vendor.id) > 0,
  ).length;
  const needsVerification = state.vendors.filter(
    (vendor) => vendor.bank.status === 'changed',
  ).length;
  const totalOverdue = rows.reduce((sum, row) => sum + row.overduePaise, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-lp-primary">
            Supplier master
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-lp-ink">
            Vendors
          </h1>
          <p className="mt-1 text-[12.5px] text-lp-ink-muted">
            {state.vendors.length} vendors · {withBalance} with open balances ·{' '}
            {needsVerification} bank change awaiting verification
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-lp-line bg-white px-4 py-2.5">
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-lp-ink-faint">Open payables</div>
            <Money
              paise={rows.reduce((sum, row) => sum + row.outstandingPaise, 0)}
              className="text-[13px] font-semibold text-lp-ink"
            />
          </div>
          <div className="h-7 w-px bg-lp-line-soft" />
          <div>
            <div className="text-[9.5px] uppercase tracking-[0.08em] text-lp-ink-faint">Overdue</div>
            <Money paise={totalOverdue} className="text-[13px] font-semibold text-lp-danger" />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-lp-line-soft p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-lp-ink-faint" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search vendor, category, city or GSTIN"
              className="w-full rounded-lg border border-lp-line-strong bg-lp-surface-muted py-2 pl-9 pr-3 text-[12px] text-lp-ink outline-none placeholder:text-lp-ink-faint focus:border-lp-primary focus:bg-white focus:ring-1 focus:ring-lp-primary"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[11.5px] text-lp-ink-muted">
            <input
              type="checkbox"
              checked={onlyWithBalance}
              onChange={(event) => setOnlyWithBalance(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-lp-line-strong accent-lp-primary"
            />
            Only vendors with an open balance
          </label>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No vendors match"
            description="Try a different name or clear the open-balance filter."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setOnlyWithBalance(false);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] border-collapse text-left">
              <thead>
                <tr className="border-b border-lp-line-soft bg-lp-surface-muted text-[10px] font-semibold uppercase tracking-[0.08em] text-lp-ink-faint">
                  <th className="px-3.5 py-2.5">Vendor</th>
                  <th className="px-3.5 py-2.5">Terms</th>
                  <th className="px-3.5 py-2.5">Bank account</th>
                  <th className="px-3.5 py-2.5 text-right">Open</th>
                  <th className="px-3.5 py-2.5 text-right">Outstanding</th>
                  <th className="px-3.5 py-2.5 text-right">Overdue</th>
                  <th className="px-3.5 py-2.5">Last simulated payment</th>
                  <th className="px-3.5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-lp-line-soft">
                {rows.map((row) => (
                  <tr key={row.vendor.id} className="transition-colors hover:bg-lp-surface-muted">
                    <td className="px-3.5 py-3">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-lp-success-wash text-lp-primary">
                          <Building2 className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-lp-ink">
                            {row.vendor.name}
                          </div>
                          <div className="mt-0.5 text-[10.5px] text-lp-ink-muted">
                            {row.vendor.category} · {row.vendor.city}
                          </div>
                          <div className="mt-0.5 font-mono text-[9.5px] text-lp-ink-faint">
                            {row.vendor.gstin}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="text-[11.5px] text-lp-ink">{row.vendor.termsLabel}</div>
                      <div className="mt-0.5 text-[10px] text-lp-ink-faint">
                        {row.vendor.termsDays} days
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <VendorBank
                        vendor={row.vendor}
                        onVerify={() => onVerifyBank(row.vendor.id)}
                      />
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <span
                        className={cn(
                          'inline-flex min-w-6 justify-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                          row.openCount > 0
                            ? 'bg-lp-success-wash text-lp-primary'
                            : 'bg-lp-surface-sunken text-lp-ink-faint',
                        )}
                      >
                        {row.openCount}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <Money
                        paise={row.outstandingPaise}
                        className={cn(
                          'text-[12px] font-semibold',
                          row.outstandingPaise > 0 ? 'text-lp-ink' : 'text-lp-ink-faint',
                        )}
                      />
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      {row.overduePaise > 0 ? (
                        <Money
                          paise={row.overduePaise}
                          className="text-[12px] font-semibold text-lp-danger"
                        />
                      ) : (
                        <span className="text-[11px] text-lp-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="text-[11px] text-lp-ink">
                        {row.lastPayment ? formatDate(row.lastPayment) : 'No payment yet'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-lp-ink-faint">
                        {row.lastPayment ? 'SIMULATED' : '—'}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onShowVendorInvoices(row.vendor.id)}
                        disabled={row.openCount === 0}
                      >
                        View invoices
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-lp-line-soft bg-lp-surface-muted px-3.5 py-2.5 text-[11px] text-lp-ink-muted">
          Bank changes block new payment requests until an owner verifies the account by phone.
          Amounts are outstanding balances, excluding duplicate copies.
        </div>
      </Card>
    </div>
  );
}
