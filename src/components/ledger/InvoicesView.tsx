import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Building2,
  FileText,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { DemoState, InvoiceView } from '../../ledger/types';
import { dueLabel, formatDate, formatINR } from '../../ledger/money';
import {
  Button,
  Card,
  CheckSummary,
  EmptyState,
  Money,
  StatusBadge,
  cn,
} from './ui';

type FilterKey =
  | 'All'
  | 'Needs review'
  | 'Ready for approval'
  | 'Pending approval'
  | 'Approved'
  | 'Part-paid'
  | 'Paid'
  | 'Overdue';

type SortKey = 'dueDate' | 'amount' | 'vendor' | 'issueDate';

const FILTERS: FilterKey[] = [
  'All',
  'Needs review',
  'Overdue',
  'Ready for approval',
  'Pending approval',
  'Approved',
  'Part-paid',
  'Paid',
];

export function InvoicesView({
  state,
  views,
  initialFilter,
  vendorFilter,
  onClearVendorFilter,
  onOpenInvoice,
}: {
  state: DemoState;
  views: InvoiceView[];
  initialFilter?: string;
  vendorFilter?: string | null;
  onClearVendorFilter: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>('All');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (initialFilter) setFilter(initialFilter as FilterKey);
  }, [initialFilter]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return views
      .filter((view) => {
        if (vendorFilter && view.vendor.id !== vendorFilter) return false;
        if (filter === 'Overdue' && (view.overdueDays <= 0 || view.invoice.duplicateOf)) return false;
        if (
          filter !== 'All' &&
          filter !== 'Overdue' &&
          view.status !== filter
        ) {
          return false;
        }
        if (!query) return true;
        return [
          view.vendor.name,
          view.vendor.gstin,
          view.invoice.invoiceNumber,
          view.invoice.poNumber ?? '',
          view.invoice.notes ?? '',
          view.invoice.source,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortKey === 'dueDate') comparison = a.invoice.dueDate.localeCompare(b.invoice.dueDate);
        else if (sortKey === 'issueDate') comparison = a.invoice.issueDate.localeCompare(b.invoice.issueDate);
        else if (sortKey === 'amount') comparison = a.invoice.totalPaise - b.invoice.totalPaise;
        else comparison = a.vendor.name.localeCompare(b.vendor.name);
        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [views, filter, search, sortKey, sortDirection, vendorFilter]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { All: views.length };
    FILTERS.forEach((key) => {
      if (key === 'All') return;
      result[key] =
        key === 'Overdue'
          ? views.filter((view) => view.overdueDays > 0 && !view.invoice.duplicateOf).length
          : views.filter((view) => view.status === key).length;
    });
    return result;
  }, [views]);

  const payablePaise = useMemo(
    () =>
      views
        .filter(
          (view) =>
            !view.invoice.duplicateOf &&
            view.status !== 'Paid' &&
            view.status !== 'Rejected',
        )
        .reduce((sum, view) => sum + view.outstandingPaise, 0),
    [views],
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'dueDate' || key === 'issueDate' ? 'asc' : 'desc');
    }
  };

  const vendor = vendorFilter
    ? state.vendors.find((item) => item.id === vendorFilter)
    : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-lp-primary">
            Payables
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-lp-ink">
            Invoices
          </h1>
          <p className="mt-1 text-[12.5px] text-lp-ink-muted">
            {views.length} invoices · {formatINR(payablePaise)} open payable · GST included
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-lp-ink-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Click a row to inspect checks, payments and the document
        </div>
      </div>

      {vendor && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-lp-success-border bg-lp-success-wash px-2.5 py-1 text-[11px] font-medium text-lp-primary">
            Vendor: {vendor.name}
            <button
              type="button"
              onClick={onClearVendorFilter}
              aria-label="Clear vendor filter"
              className="rounded-full p-0.5 hover:bg-lp-success-border"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-lp-line-soft p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-lp-ink-faint" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search vendor, invoice number, GSTIN or PO"
              className="w-full rounded-lg border border-lp-line-strong bg-lp-surface-muted py-2 pl-9 pr-3 text-[12px] text-lp-ink outline-none placeholder:text-lp-ink-faint focus:border-lp-primary focus:bg-white focus:ring-1 focus:ring-lp-primary"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            {FILTERS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  filter === key
                    ? 'bg-lp-primary text-white'
                    : 'bg-lp-surface-sunken text-lp-ink-muted hover:bg-lp-surface-sunken hover:text-lp-ink',
                )}
              >
                {key}
                <span
                  className={cn(
                    'ml-1.5 rounded px-1 py-0.5 text-[9.5px]',
                    filter === key ? 'bg-white/15 text-white' : 'bg-white text-lp-ink-faint',
                  )}
                >
                  {counts[key] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No invoices match these filters"
            description="Clear the search or choose another status to see the demo ledger."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setFilter('All');
                  onClearVendorFilter();
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-lp-line-soft bg-lp-surface-muted text-[10px] font-semibold uppercase tracking-[0.08em] text-lp-ink-faint">
                  <th className="px-3.5 py-2.5">Invoice</th>
                  <th className="px-3.5 py-2.5">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('vendor')}>
                      Vendor <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('dueDate')}>
                      Due <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 text-right">
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => toggleSort('amount')}>
                      Total <ArrowUpDown className="h-3 w-3 opacity-60" />
                    </button>
                  </th>
                  <th className="px-3.5 py-2.5 text-right">Balance</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5">Checks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-lp-line-soft">
                {filtered.map((view) => (
                  <tr
                    key={view.invoice.id}
                    onClick={() => onOpenInvoice(view.invoice.id)}
                    className="cursor-pointer transition-colors hover:bg-lp-surface-muted"
                  >
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-[11.5px] font-medium text-lp-ink">
                        <FileText className="h-3.5 w-3.5 text-lp-primary/70" />
                        {view.invoice.invoiceNumber}
                      </div>
                      <div className="mt-0.5 text-[10px] text-lp-ink-faint">
                        {view.invoice.source} · {view.invoice.poNumber ?? 'No PO'}
                        {view.invoice.duplicateOf ? ' · duplicate copy' : ''}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-lp-ink">
                        <Building2 className="h-3.5 w-3.5 text-lp-ink-faint" />
                        <span className="max-w-[190px] truncate">{view.vendor.name}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-[9.5px] text-lp-ink-faint">{view.vendor.gstin}</div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="text-[11.5px] text-lp-ink">{formatDate(view.invoice.dueDate)}</div>
                      <div
                        className={cn(
                          'mt-0.5 text-[10px]',
                          view.status === 'Paid'
                            ? 'text-lp-ink-faint'
                            : view.overdueDays > 0
                              ? 'font-medium text-lp-danger'
                              : view.dueInDays <= 7
                                ? 'font-medium text-lp-warning'
                                : 'text-lp-ink-faint',
                        )}
                      >
                        {view.status === 'Paid'
                          ? 'Settled'
                          : dueLabel(view.invoice.dueDate, state.business.asOf)}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <Money paise={view.invoice.totalPaise} className="text-[12px] font-semibold text-lp-ink" />
                      <div className="mt-0.5 text-[10px] text-lp-ink-faint">
                        {view.invoice.gstType === 'intra' ? 'CGST + SGST' : 'IGST'}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <Money
                        paise={view.outstandingPaise}
                        className={cn(
                          'text-[12px] font-semibold',
                          view.outstandingPaise === 0 ? 'text-lp-ink-faint' : 'text-lp-ink',
                        )}
                      />
                      <div className="mt-0.5 text-[10px] text-lp-ink-faint">
                        {view.paidPaise > 0 ? `${formatINR(view.paidPaise)} paid` : 'Unpaid'}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <StatusBadge status={view.status} />
                    </td>
                    <td className="px-3.5 py-3">
                      {view.status === 'Paid' ? (
                        <span className="text-[11px] text-lp-ink-faint">Closed</span>
                      ) : (
                        <CheckSummary checks={view.checks} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-lp-line-soft bg-lp-surface-muted px-3.5 py-2.5 text-[11px] text-lp-ink-muted">
          <span>
            Showing <strong className="text-lp-ink">{filtered.length}</strong> of{' '}
            <strong className="text-lp-ink">{views.length}</strong> invoices
          </span>
          <span>Click a row to inspect the invoice, checks, payments and document.</span>
        </div>
      </Card>
    </div>
  );
}
