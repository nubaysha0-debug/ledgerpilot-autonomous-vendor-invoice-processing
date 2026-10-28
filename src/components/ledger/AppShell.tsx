import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Database,
  FileText,
  LayoutDashboard,
  Lock,
  ScrollText,
  Settings2,
  Wallet,
} from 'lucide-react';
import type { BusinessProfileInput, PaymentRequestInput, Role } from '../../ledger/types';
import type { WorkspaceImportInput } from '../../ledger/importer';
import { formatDateTime, formatINR } from '../../ledger/money';
import { useLedger } from '../../ledger/store';
import {
  Avatar,
  Button,
  ConfirmDialog,
  type ConfirmState,
  ReasonDialog,
  type ReasonState,
  ToastView,
  type ToastData,
  type ToastTone,
  cn,
} from './ui';
import { OverviewView } from './OverviewView';
import { InvoicesView } from './InvoicesView';
import { VendorsView } from './VendorsView';
import { PaymentsView } from './PaymentsView';
import { AuditView } from './AuditView';
import { InvoiceDrawer } from './InvoiceDrawer';
import { PaymentDialog } from './PaymentDialog';
import { DemoControls } from './DemoControls';
import { DataView } from './DataView';

type WorkspaceView = 'overview' | 'invoices' | 'vendors' | 'payments' | 'audit' | 'data';

const NAV: Array<{
  key: WorkspaceView;
  label: string;
  caption: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: 'overview', label: 'Overview', caption: 'Payables dashboard', icon: LayoutDashboard },
  { key: 'invoices', label: 'Invoices', caption: 'Review and pay', icon: FileText },
  { key: 'vendors', label: 'Vendors', caption: 'Supplier master', icon: Building2 },
  { key: 'payments', label: 'Payments', caption: 'Approval queue', icon: Wallet },
  { key: 'audit', label: 'Audit trail', caption: 'Controls log', icon: ScrollText },
  { key: 'data', label: 'Data', caption: 'CSV & backups', icon: Database },
];

const VIEW_LABEL: Record<WorkspaceView, string> = {
  overview: 'Overview',
  invoices: 'Invoices',
  vendors: 'Vendors',
  payments: 'Payments',
  audit: 'Audit trail',
  data: 'Data & backups',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function AppShell() {
  const { state, views, totals, actions, mode, apiStatus, apiBaseUrl, syncError } = useLedger();
  const [view, setView] = useState<WorkspaceView>('overview');
  const [invoiceFilter, setInvoiceFilter] = useState('All');
  const [vendorFilter, setVendorFilter] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [dataEpoch, setDataEpoch] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [reason, setReason] = useState<ReasonState | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((tone: ToastTone, message: string, detail?: string) => {
    setToast({ id: Date.now(), tone, message, detail });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  const activeMember =
    state.team.find((member) => member.role === state.role) ?? state.team[0];
  const openView = openInvoiceId
    ? views.find((item) => item.invoice.id === openInvoiceId)
    : undefined;
  const paymentView = paymentInvoiceId
    ? views.find((item) => item.invoice.id === paymentInvoiceId)
    : undefined;
  const importedWorkspace =
    state.invoices.some((invoice) => invoice.importedAt) ||
    state.audit.some(
      (event) =>
        event.action === 'Workspace imported' ||
        event.action === 'Workspace restored from backup',
    );

  const ensureOwner = () => {
    if (state.role !== 'owner') {
      notify(
        'error',
        'Owner approval required',
        `${activeMember.name} cannot approve, reject, or execute payments. Switch to Ramesh Patil in Demo controls.`,
      );
      return false;
    }
    return true;
  };

  const navigate = (next: WorkspaceView) => {
    setView(next);
    if (next === 'invoices') {
      setInvoiceFilter('All');
      setVendorFilter(null);
    }
    setControlsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToInvoices = (filter?: string) => {
    setVendorFilter(null);
    setInvoiceFilter(filter ?? 'All');
    setView('invoices');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showVendorInvoices = (vendorId: string) => {
    setVendorFilter(vendorId);
    setInvoiceFilter('All');
    setView('invoices');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setRole = (role: Role) => {
    actions.setRole(role);
    const member = state.team.find((item) => item.role === role);
    setConfirm(null);
    setReason(null);
    setPaymentInvoiceId(null);
    notify(
      'info',
      `Acting as ${member?.name ?? role}`,
      role === 'owner'
        ? 'Owner rights: approve, reject, execute, revise and verify bank accounts.'
        : role === 'accountant'
          ? 'Accountant rights: record payment requests and review invoices. Approval is blocked.'
          : 'Staff rights: view only. All payment changes are blocked.',
    );
  };

  const recordPayment = async (input: PaymentRequestInput) => {
    const payment = await actions.recordPayment(input);
    setPaymentInvoiceId(null);
    notify(
      'success',
      'Payment request recorded',
      `${formatINR(payment.amountPaise)} ${payment.mode} is now waiting for owner approval.`,
    );
  };

  const approve = (paymentId: string) => {
    if (!ensureOwner()) return;
    const payment = state.payments.find((item) => item.id === paymentId);
    const itemView = views.find((item) => item.invoice.id === payment?.invoiceId);
    if (!payment || !itemView) return;

    setConfirm({
      title: 'Approve this payment?',
      body: `Approve ${formatINR(payment.amountPaise)} by ${payment.mode} to ${itemView.vendor.name} for invoice ${itemView.invoice.invoiceNumber}.`,
      detail:
        'The approval is tied to the invoice total and the vendor bank account. If either changes, the approval becomes stale and execution is blocked.',
      confirmLabel: 'Approve payment',
      onConfirm: async () => {
        try {
          await actions.approvePayment(paymentId);
          notify(
            'success',
            'Payment approved',
            `${formatINR(payment.amountPaise)} is ready for simulated execution.`,
          );
        } catch (error) {
          notify('error', 'Approval failed', errorMessage(error));
        }
      },
    });
  };

  const reject = (paymentId: string) => {
    if (!ensureOwner()) return;
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment) return;
    setReason({
      title: 'Reject this payment?',
      label: 'Reason for rejection',
      placeholder: 'For example: vendor invoice is under dispute; re-record after the credit note.',
      confirmLabel: 'Reject payment',
      onConfirm: async (text) => {
        try {
          await actions.rejectPayment(paymentId, text);
          notify(
            'info',
            'Payment rejected',
            `${formatINR(payment.amountPaise)} request rejected. The reason is in the audit trail.`,
          );
        } catch (error) {
          notify('error', 'Rejection failed', errorMessage(error));
        }
      },
    });
  };

  const execute = (paymentId: string) => {
    if (!ensureOwner()) return;
    const payment = state.payments.find((item) => item.id === paymentId);
    const itemView = views.find((item) => item.invoice.id === payment?.invoiceId);
    if (!payment || !itemView) return;

    if (itemView.approvalStale && itemView.activePayment?.id === payment.id) {
      notify(
        'error',
        'Approval is stale',
        'The invoice or vendor bank account changed after approval. Re-approve before executing.',
      );
      return;
    }

    setConfirm({
      title: 'Execute simulated payment?',
      body: `Run the mock ${payment.mode} of ${formatINR(payment.amountPaise)} to ${itemView.vendor.name}. LedgerPilot will write a mock transaction id and an audit event.`,
      detail:
        'No bank connection is used and no money is transferred. Execution is idempotent: replaying the same payment returns the existing mock transaction.',
      confirmLabel: 'Execute simulation',
      onConfirm: async () => {
        try {
          const result = await actions.executePayment(paymentId);
          if (result.replayed) {
            notify(
              'info',
              'Payment already executed',
              `${result.payment.mockTxnId ?? 'Mock transaction'} was returned. No duplicate transfer was created.`,
            );
          } else if (result.failed) {
            notify(
              'error',
              'Mock gateway declined',
              'The forced failure was recorded. The payment is now Failed; retry reuses the same record.',
            );
          } else {
            notify(
              'success',
              'Simulated payment executed',
              `${result.payment.mockTxnId ?? 'Mock transaction'} · No money was transferred.`,
            );
          }
        } catch (error) {
          notify('error', 'Execution blocked', errorMessage(error));
        }
      },
    });
  };

  const retry = (paymentId: string) => {
    if (!ensureOwner()) return;
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment) return;
    setConfirm({
      title: 'Retry this payment?',
      body: `Re-authorise the ${formatINR(payment.amountPaise)} ${payment.mode} after the mock failure. The same payment record and reference are reused.`,
      detail:
        'Retry moves the payment back to Approved. The owner still has to execute it, so no automatic retry loop can move money.',
      confirmLabel: 'Authorise retry',
      onConfirm: async () => {
        try {
          await actions.retryPayment(paymentId);
          notify(
            'success',
            'Retry authorised',
            'The payment is Approved again. Execute it to complete the simulation.',
          );
        } catch (error) {
          notify('error', 'Retry failed', errorMessage(error));
        }
      },
    });
  };

  const revise = (invoiceId: string) => {
    if (!ensureOwner()) return;
    const itemView = views.find((item) => item.invoice.id === invoiceId);
    if (!itemView) return;
    setConfirm({
      title: 'Record a supplier revision?',
      body: `Add ₹500.00 freight to ${itemView.invoice.invoiceNumber} and recompute GST. This simulates the vendor sending a revised invoice after the original was approved.`,
      detail:
        'The invoice total changes, so any existing approval fingerprint no longer matches. Execution will be blocked until the owner re-approves.',
      confirmLabel: 'Add revision',
      onConfirm: async () => {
        try {
          const updated = await actions.reviseInvoice(invoiceId);
          notify(
            'info',
            'Invoice revised',
            `New total ${formatINR(updated.totalPaise)}. Existing approvals are now stale.`,
          );
        } catch (error) {
          notify('error', 'Revision failed', errorMessage(error));
        }
      },
    });
  };

  const verifyBank = (vendorId: string) => {
    if (!ensureOwner()) return;
    const vendor = state.vendors.find((item) => item.id === vendorId);
    if (!vendor) return;
    setConfirm({
      title: 'Verify the new bank account?',
      body: `Confirm that you called ${vendor.name} on the number already on file and verified ${vendor.bank.accountMasked} before unblocking payments.`,
      detail: `Previous account: ${vendor.bank.previousAccountMasked ?? 'not recorded'}. Never verify a bank change using contact details supplied in the same email.`,
      confirmLabel: 'Verify account',
      onConfirm: async () => {
        try {
          await actions.verifyVendorBank(vendorId);
          notify('success', 'Vendor bank verified', `Payments to ${vendor.name} are unblocked.`);
        } catch (error) {
          notify('error', 'Verification failed', errorMessage(error));
        }
      },
    });
  };

  const requestReset = () => {
    setControlsOpen(false);
    setConfirm({
      title: 'Reset the demo?',
      subtitle: 'Demo reset',
      body: `Restore the seeded vendors, invoices, payments and audit events. Anything recorded in ${
        mode === 'api' ? 'the PostgreSQL workspace' : 'this browser session'
      } will be discarded.`,
      detail:
        'The seed is deterministic: 12 vendors, 16 invoices, 10 payment records and 19 audit events as of 27 Oct 2026.',
      note:
        mode === 'api'
          ? 'Reset replaces the workspace stored in PostgreSQL through the FastAPI service. It does not contact any bank or vendor.'
          : 'Reset deletes the workspace saved in this browser. It does not contact any bank or vendor.',
      confirmLabel: 'Reset demo data',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await actions.resetDemo();
          setOpenInvoiceId(null);
          setPaymentInvoiceId(null);
          setInvoiceFilter('All');
          setVendorFilter(null);
          setDataEpoch((value) => value + 1);
          notify('info', 'Demo reset', 'Seed data restored. You are acting as Ramesh Patil.');
        } catch (error) {
          notify('error', 'Reset failed', errorMessage(error));
        }
      },
    });
  };

  const saveProfile = async (input: BusinessProfileInput) => {
    if (!ensureOwner()) return;
    try {
      await actions.updateBusinessProfile(input);
      notify(
        'success',
        'Business profile saved',
        `${input.name} · GSTIN ${input.gstin} · as of ${formatDateTime(input.asOf)} IST.`,
      );
    } catch (error) {
      notify('error', 'Profile not saved', errorMessage(error));
    }
  };

  const requestImport = (
    input: WorkspaceImportInput,
    summary: { vendorCount: number; invoiceCount: number; warningCount: number },
  ) => {
    if (!ensureOwner()) return;
    setConfirm({
      title: 'Replace this workspace?',
      subtitle: 'CSV import',
      body: `Replace the current vendors, invoices, payments and audit events with ${summary.vendorCount} vendors and ${summary.invoiceCount} invoices from the CSV files.`,
      detail: `${
        summary.warningCount > 0
          ? `${summary.warningCount} warning${summary.warningCount === 1 ? '' : 's'} appeared in the preview. `
          : ''
      }Vendor bank accounts are treated as verified unless the CSV marks them for verification. Download a JSON backup first if you need to keep the current state.`,
      note:
        mode === 'api'
          ? 'This replaces the workspace stored in PostgreSQL. It does not contact any bank or vendor.'
          : 'This replaces data stored in this browser. It does not contact any bank or vendor.',
      confirmLabel: 'Import and replace',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const result = await actions.importWorkspace(input);
          setOpenInvoiceId(null);
          setPaymentInvoiceId(null);
          setInvoiceFilter('All');
          setVendorFilter(null);
          setDataEpoch((value) => value + 1);
          notify(
            'success',
            'Workspace imported',
            `${result.vendorCount} vendors · ${result.invoiceCount} invoices · ${formatINR(result.invoiceValuePaise)} invoice value.`,
          );
        } catch (error) {
          notify('error', 'Import failed', errorMessage(error));
        }
      },
    });
  };

  const requestRestore = (
    backupJson: string,
    summary: { vendorCount: number; invoiceCount: number },
  ) => {
    if (!ensureOwner()) return;
    setConfirm({
      title: 'Restore this backup?',
      subtitle: 'Workspace restore',
      body: `Replace ${
        mode === 'api' ? 'the PostgreSQL workspace' : 'everything in this browser'
      } with the backup containing ${summary.vendorCount} vendors and ${summary.invoiceCount} invoices.`,
      detail:
        'Payments, audit events and the team stored in the backup are restored. The current acting role is kept so the owner does not silently become a different user.',
      note: 'Only restore a backup you created or trust. Backup files contain vendor and payment data in plain text.',
      confirmLabel: 'Restore backup',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const restored = await actions.restoreWorkspace(backupJson);
          const restoredValue = restored.invoices.reduce(
            (total, invoice) => total + invoice.totalPaise,
            0,
          );
          setOpenInvoiceId(null);
          setPaymentInvoiceId(null);
          setInvoiceFilter('All');
          setVendorFilter(null);
          setDataEpoch((value) => value + 1);
          notify(
            'success',
            'Backup restored',
            `${restored.vendors.length} vendors · ${restored.invoices.length} invoices · ${formatINR(restoredValue)} invoice value.`,
          );
        } catch (error) {
          notify('error', 'Restore failed', errorMessage(error));
        }
      },
    });
  };

  const openPaymentDialog = () => {
    if (!openView) return;
    if (state.role === 'staff') {
      notify(
        'error',
        'View-only role',
        'Amit Jadhav cannot record payments. Switch to Sunita Deshmukh in Demo controls.',
      );
      return;
    }
    if (openView.availablePaise <= 0) {
      notify('error', 'No available balance', 'This invoice has nothing left to pay.');
      return;
    }
    setPaymentInvoiceId(openView.invoice.id);
  };

  const paymentQueueCount =
    totals.pendingApprovalCount +
    totals.approvedToPayCount +
    state.payments.filter((payment) => payment.status === 'failed').length;

  return (
    <div className="min-h-screen bg-lp-canvas text-lp-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-lp-line bg-lp-surface-muted lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-lp-line-soft px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-lp-primary text-[10.5px] font-bold tracking-tight text-white">
            LP
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight text-lp-ink">
              LedgerPilot
            </div>
            <div className="text-[9.5px] uppercase tracking-[0.1em] text-lp-ink-faint">
              Payables console
            </div>
          </div>
        </div>

        <div className="px-3 pt-3">
          <div className="rounded-lg border border-lp-line bg-white p-2.5">
            <div className="text-[11.5px] font-semibold leading-snug text-lp-ink">
              {state.business.name}
            </div>
            <div className="mt-1 text-[10px] leading-relaxed text-lp-ink-muted">
              {state.business.city}, {state.business.state}
              <br />
              <span className="font-mono text-[9.5px]">{state.business.gstin}</span>
            </div>
            <div className="mt-1.5 inline-flex rounded bg-lp-surface-sunken px-1.5 py-0.5 text-[9px] font-medium text-lp-ink-muted">
              FY {state.business.fy}
            </div>
          </div>
        </div>

        <nav className="mt-3 flex-1 overflow-y-auto px-2">
          <div className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-lp-ink-faint">
            Workspace
          </div>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            const count =
              item.key === 'invoices'
                ? views.length
                : item.key === 'payments'
                  ? paymentQueueCount
                  : null;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                className={cn(
                  'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  active
                    ? 'bg-lp-success-wash text-lp-primary'
                    : 'text-lp-ink-muted hover:bg-lp-surface-sunken hover:text-lp-ink',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-lp-primary' : 'text-lp-ink-faint')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium">{item.label}</span>
                  <span className="block text-[9.5px] text-lp-ink-faint">{item.caption}</span>
                </span>
                {count != null ? (
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[9.5px] font-semibold',
                      active ? 'bg-lp-primary text-white' : 'bg-lp-surface-sunken text-lp-ink-muted',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-lp-line-soft p-3">
          <div className="rounded-lg border border-lp-line bg-white p-2.5">
            <div className="flex items-center gap-2">
              <Avatar initials={activeMember?.initials ?? 'RP'} name={activeMember?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-semibold text-lp-ink">
                  {activeMember?.name}
                </div>
                <div
                  className="truncate text-[9.5px] text-lp-ink-faint"
                  title={`${activeMember?.role} · ${activeMember?.title}`}
                >
                  {activeMember?.title}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setControlsOpen(true)}
              className="mt-2 flex w-full items-center justify-between rounded-md border border-lp-line bg-lp-surface-muted px-2 py-1.5 text-[10.5px] font-medium text-lp-ink-muted hover:bg-lp-surface-sunken"
            >
              <span className="inline-flex items-center gap-1.5">
                <Settings2 className="h-3.5 w-3.5" />
                Demo controls
              </span>
              <span className="text-[9px] text-lp-ink-faint">Role & failure</span>
            </button>
          </div>
          <p className="mt-2 px-0.5 text-[9px] leading-relaxed text-lp-ink-faint">
            {mode === 'api'
              ? 'PostgreSQL workspace via the local FastAPI service. Payments are simulated.'
              : importedWorkspace
                ? 'Local workspace data in this browser. Not connected to any bank, GST portal or vendor.'
                : 'Synthetic demo data in this browser. Not connected to any bank, GST portal or vendor.'}
          </p>
        </div>
      </aside>

      <div className="lg:pl-60">
        <div className="sticky top-0 z-30">
          <div className="flex items-center justify-between gap-3 bg-lp-primary-deep px-4 py-1.5 text-[10.5px] text-lp-on-deep sm:px-6">
            <div
              role="note"
              aria-label="DEMO - Payments are simulated. No money is transferred."
              className="flex min-w-0 items-center gap-2"
            >
              <span className="shrink-0 rounded bg-lp-amber-badge px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.12em] text-lp-on-amber">
                DEMO
              </span>
              <span className="truncate">
                Payments are simulated. No money is transferred.
              </span>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 text-[9.5px] text-lp-on-deep-muted sm:flex">
              <Lock className="h-3 w-3" />
              No bank or vendor connection
            </span>
          </div>

          <header className="border-b border-lp-line bg-lp-surface-muted/95 backdrop-blur">
            <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-lp-primary text-[10px] font-bold text-white lg:hidden">
                  LP
                </span>
                <div className="hidden items-center gap-2 text-[11px] text-lp-ink-faint lg:flex">
                  <span>Workspace</span>
                  <span>/</span>
                  <span className="font-medium text-lp-ink">{VIEW_LABEL[view]}</span>
                </div>
                <div className="text-[12px] font-semibold text-lp-ink lg:hidden">
                  {VIEW_LABEL[view]}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  title={
                    apiStatus === 'connected'
                      ? `${apiBaseUrl} · PostgreSQL workspace`
                      : syncError ?? 'Browser localStorage fallback'
                  }
                  className={cn(
                    'hidden items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.07em] sm:inline-flex',
                    apiStatus === 'connected'
                      ? 'border-lp-success-border bg-lp-success-wash text-lp-primary'
                      : apiStatus === 'connecting'
                        ? 'border-lp-neutral-border bg-lp-neutral-wash text-lp-ink-muted'
                        : 'border-lp-line bg-lp-surface-muted text-lp-ink-faint',
                  )}
                >
                  <Database className="h-3 w-3" />
                  {apiStatus === 'connected'
                    ? 'PostgreSQL API'
                    : apiStatus === 'connecting'
                      ? 'Connecting'
                      : 'Browser-local'}
                </span>
                <div className="hidden items-center gap-1.5 text-[10px] text-lp-ink-muted xl:flex">
                  <CalendarDays className="h-3.5 w-3.5 text-lp-ink-faint" />
                  As of {formatDateTime(state.business.asOf)} IST
                </div>
                <label className="flex items-center gap-1.5 rounded-lg border border-lp-line-strong bg-white py-1 pl-2 pr-1">
                  <span className="hidden text-[9px] font-semibold uppercase tracking-[0.08em] text-lp-ink-faint sm:inline">
                    Acting as
                  </span>
                  <select
                    value={state.role}
                    onChange={(event) => setRole(event.target.value as Role)}
                    aria-label="Acting role"
                    className="max-w-[150px] cursor-pointer bg-transparent text-[11px] font-medium text-lp-ink outline-none"
                  >
                    {state.team.map((member) => (
                      <option key={member.id} value={member.role}>
                        {member.name.split(' ')[0]} · {member.role}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setControlsOpen(true)}
                  aria-label="Open demo controls"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Demo controls</span>
                </Button>
              </div>
            </div>
          </header>
        </div>

        {mode === 'api' && syncError ? (
          <div className="flex items-start gap-2 border-b border-lp-danger-border bg-lp-danger-wash px-4 py-2 text-[11px] leading-relaxed text-lp-danger sm:px-6">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Server sync problem: {syncError} The last loaded workspace is still shown; retry
              the action after the API is back.
            </span>
          </div>
        ) : null}

        <nav className="flex gap-1 overflow-x-auto border-b border-lp-line bg-lp-surface-muted px-3 py-1.5 no-scrollbar lg:hidden">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[10.5px] font-medium',
                  active
                    ? 'bg-lp-primary text-white'
                    : 'text-lp-ink-muted hover:bg-lp-surface-sunken hover:text-lp-ink',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
          {view === 'overview' ? (
            <OverviewView
              state={state}
              views={views}
              totals={totals}
              onOpenInvoice={setOpenInvoiceId}
              onGoToInvoices={goToInvoices}
              onGoToPayments={() => navigate('payments')}
              onGoToVendors={() => navigate('vendors')}
            />
          ) : null}

          {view === 'invoices' ? (
            <InvoicesView
              state={state}
              views={views}
              initialFilter={invoiceFilter}
              vendorFilter={vendorFilter}
              onClearVendorFilter={() => setVendorFilter(null)}
              onOpenInvoice={setOpenInvoiceId}
            />
          ) : null}

          {view === 'vendors' ? (
            <VendorsView
              state={state}
              views={views}
              onShowVendorInvoices={showVendorInvoices}
              onVerifyBank={verifyBank}
            />
          ) : null}

          {view === 'payments' ? (
            <PaymentsView
              state={state}
              views={views}
              onOpenInvoice={setOpenInvoiceId}
              onApprove={approve}
              onReject={reject}
              onExecute={execute}
              onRetry={retry}
            />
          ) : null}

          {view === 'audit' ? (
            <AuditView state={state} onOpenInvoice={setOpenInvoiceId} />
          ) : null}

          {view === 'data' ? (
            <DataView
              key={dataEpoch}
              state={state}
              mode={mode}
              canEdit={state.role === 'owner'}
              onSaveProfile={saveProfile}
              onImport={requestImport}
              onRestore={requestRestore}
              onReset={requestReset}
              onNotify={notify}
            />
          ) : null}

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-lp-line pt-3 text-[9.5px] leading-relaxed text-lp-ink-faint">
            <span>
              {importedWorkspace ? 'Local workspace data' : 'Synthetic demo data'} ·{' '}
              {state.business.name} · GSTIN{' '}
              <span className="font-mono">{state.business.gstin}</span>
            </span>
            <span>FY {state.business.fy} · not for GST filing</span>
          </footer>
        </main>
      </div>

      {openView ? (
        <InvoiceDrawer
          key={`${openView.invoice.id}-${openView.invoice.version}`}
          state={state}
          view={openView}
          onClose={() => setOpenInvoiceId(null)}
          onRecordPayment={openPaymentDialog}
          onApprove={approve}
          onReject={reject}
          onExecute={execute}
          onRetry={retry}
          onRevise={() => revise(openView.invoice.id)}
          onVerifyBank={() => verifyBank(openView.vendor.id)}
        />
      ) : null}

      {paymentView ? (
        <PaymentDialog
          key={paymentView.invoice.id}
          state={state}
          view={paymentView}
          onClose={() => setPaymentInvoiceId(null)}
          onSubmit={recordPayment}
        />
      ) : null}

      <DemoControls
        open={controlsOpen}
        state={state}
        onClose={() => setControlsOpen(false)}
        onSetRole={setRole}
        onToggleForceFailure={async () => {
          try {
            const armed = await actions.toggleForceFailure();
            notify(
              'info',
              armed ? 'Failure path armed' : 'Failure path disarmed',
              armed
                ? 'The next execution will be declined once by the mock gateway.'
                : 'The next simulated transfer will run normally.',
            );
          } catch (error) {
            notify('error', 'Failure path not changed', errorMessage(error));
          }
        }}
        onReset={requestReset}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <ReasonDialog state={reason} onClose={() => setReason(null)} />
      <ToastView toast={toast} />
    </div>
  );
}
