import { useMemo, useState } from 'react';
import { ArrowUpRight, ScrollText, Search, ShieldCheck } from 'lucide-react';
import type { AuditEvent, DemoState } from '../../ledger/types';
import { formatDate, formatTime } from '../../ledger/money';
import { Button, Card, EmptyState, SimulatedStamp, cn } from './ui';

type AuditFilter = 'All' | 'invoice' | 'payment' | 'vendor' | 'system';

const FILTERS: Array<{ key: AuditFilter; label: string }> = [
  { key: 'All', label: 'All events' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'payment', label: 'Payments' },
  { key: 'vendor', label: 'Vendors' },
  { key: 'system', label: 'System' },
];

const ROLE_STYLES: Record<string, string> = {
  owner: 'bg-lp-accent-wash text-lp-primary',
  accountant: 'bg-lp-info-wash text-lp-info',
  staff: 'bg-lp-surface-sunken text-lp-neutral',
  system: 'bg-lp-surface-sunken text-lp-neutral',
};

function eventLabel(event: AuditEvent): string {
  if (event.entityType === 'invoice') return 'Invoice';
  if (event.entityType === 'payment') return 'Payment';
  if (event.entityType === 'vendor') return 'Vendor';
  return 'System';
}

export function AuditView({
  state,
  onOpenInvoice,
}: {
  state: DemoState;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const [filter, setFilter] = useState<AuditFilter>('All');
  const [search, setSearch] = useState('');

  const events = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...state.audit]
      .filter((event) => {
        if (filter === 'system') {
          if (event.actorRole !== 'system') return false;
        } else if (filter !== 'All' && event.entityType !== filter) {
          return false;
        }
        if (!query) return true;
        return [
          event.actor,
          event.action,
          event.summary,
          event.detail ?? '',
          event.entityId,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [state.audit, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, AuditEvent[]>();
    events.forEach((event) => {
      const day = event.at.slice(0, 10);
      const bucket = map.get(day) ?? [];
      bucket.push(event);
      map.set(day, bucket);
    });
    return Array.from(map.entries());
  }, [events]);

  const openEntity = (event: AuditEvent) => {
    if (event.entityType === 'invoice') {
      onOpenInvoice(event.entityId);
      return;
    }
    if (event.entityType === 'payment') {
      const payment = state.payments.find((item) => item.id === event.entityId);
      if (payment) onOpenInvoice(payment.invoiceId);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-lp-primary">
            Controls & traceability
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-lp-ink">
            Audit trail
          </h1>
          <p className="mt-1 text-[12.5px] text-lp-ink-muted">
            {state.audit.length} immutable events · every approval and simulated transfer is recorded
          </p>
          <SimulatedStamp className="mt-2" />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-lp-success-border bg-lp-success-wash px-3 py-2 text-[11px] font-medium text-lp-success">
          <ShieldCheck className="h-4 w-4" />
          Append-only in this demo session
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-lp-line-soft p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-lp-ink-faint" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search actor, action, invoice or reason"
              className="w-full rounded-lg border border-lp-line-strong bg-lp-surface-muted py-2 pl-9 pr-3 text-[12px] text-lp-ink outline-none placeholder:text-lp-ink-faint focus:border-lp-primary focus:bg-white focus:ring-1 focus:ring-lp-primary"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cn(
                  'shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  filter === item.key
                    ? 'bg-lp-primary text-white'
                    : 'bg-lp-surface-sunken text-lp-ink-muted hover:bg-lp-surface-sunken hover:text-lp-ink',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {events.length === 0 ? (
          <EmptyState
            title="No audit events match"
            description="Try a different search term or filter."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setFilter('All');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-lp-line-soft">
            {groups.map(([day, dayEvents]) => (
              <div key={day}>
                <div className="flex items-center gap-3 bg-lp-surface-muted px-4 py-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-lp-ink-muted">
                    {formatDate(day)}
                  </span>
                  <span className="h-px flex-1 bg-lp-line-soft" />
                  <span className="text-[10px] text-lp-ink-faint">{dayEvents.length} events</span>
                </div>
                <ol>
                  {dayEvents.map((event) => {
                    const canOpen =
                      event.entityType === 'invoice' ||
                      (event.entityType === 'payment' &&
                        Boolean(state.payments.find((item) => item.id === event.entityId)));
                    const actorInitials =
                      event.actorRole === 'system'
                        ? 'SYS'
                        : event.actor
                            .split(' ')
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join('');
                    return (
                      <li
                        key={event.id}
                        className="group flex items-start gap-3 border-b border-lp-surface-sunken px-4 py-3 last:border-0 hover:bg-lp-surface-muted"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tracking-wide',
                            ROLE_STYLES[event.actorRole] ?? ROLE_STYLES.staff,
                          )}
                        >
                          {actorInitials}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12px] font-semibold text-lp-ink">
                              {event.action}
                            </span>
                            <span className="rounded border border-lp-line bg-white px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.06em] text-lp-ink-faint">
                              {eventLabel(event)}
                            </span>
                            <span className="text-[10.5px] text-lp-ink-faint">
                              {formatTime(event.at)} IST
                            </span>
                          </div>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-lp-ink">
                            {event.summary}
                          </p>
                          {event.detail ? (
                            <p className="mt-0.5 text-[10.5px] leading-relaxed text-lp-ink-faint">
                              {event.detail}
                            </p>
                          ) : null}
                          <div className="mt-1 text-[10px] text-lp-ink-faint">
                            {event.actor}
                            {event.actorRole !== 'system' ? ` · ${event.actorRole}` : ''} ·{' '}
                            <span className="font-mono">{event.entityId}</span>
                          </div>
                        </div>
                        {canOpen ? (
                          <button
                            type="button"
                            onClick={() => openEntity(event)}
                            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-lp-primary opacity-0 transition-opacity hover:bg-lp-success-wash group-hover:opacity-100 focus:opacity-100"
                          >
                            Open
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-lp-line-soft bg-lp-surface-muted px-3.5 py-2.5 text-[11px] text-lp-ink-muted">
          <ScrollText className="h-3.5 w-3.5 text-lp-ink-faint" />
          Showing {events.length} of {state.audit.length} events. New events are appended during the
          demo and survive a page refresh via local storage.
        </div>
      </Card>
    </div>
  );
}
