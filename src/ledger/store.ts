import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AuditEvent,
  BusinessProfileInput,
  DemoState,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentRequestInput,
  Role,
  TeamMember,
} from './types';
import { buildInitialState } from './seed';
import { apiBaseUrl, ApiError, createApi, type LedgerApi } from './api';
import {
  fingerprintFor,
  getInvoiceView,
  getInvoiceViews,
  getTotals,
  isApprovalCurrent,
} from './rules';
import { computeGst, formatINR, sumPaise } from './money';
import {
  normalizeAsOf,
  parseBackup,
  previewImport,
  validateBusinessProfile,
  type ImportPreview,
  type WorkspaceImportInput,
} from './importer';

const STORAGE_KEY = 'ledgerpilot.demo.v1';
const SCHEMA_VERSION = 1;

function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 8);
}

function demoNow(state: DemoState): string {
  const baseline = new Date(state.business.asOf).getTime();
  const latest = state.audit.reduce(
    (max, event) => Math.max(max, new Date(event.at).getTime()),
    baseline,
  );
  // Emit IST-offset timestamps so they sort lexicographically with the seed
  // events, which all use +05:30. Mixing Z and +05:30 breaks same-day ordering.
  const shifted = new Date(latest + 60_000 + 5.5 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+05:30`
  );
}

function financialYearFor(value: string): string {
  const [yearText, monthText] = value.slice(0, 10).split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return '';
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function loadState(): DemoState {
  if (typeof window === 'undefined') return buildInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildInitialState();
    const parsed = JSON.parse(raw) as DemoState;
    if (
      parsed?.schemaVersion !== SCHEMA_VERSION ||
      !Array.isArray(parsed.invoices) ||
      !Array.isArray(parsed.payments) ||
      !Array.isArray(parsed.audit) ||
      !parsed.business
    ) {
      return buildInitialState();
    }
    return parsed;
  } catch {
    return buildInitialState();
  }
}

function actorFor(state: DemoState, role: Role): TeamMember {
  return (
    state.team.find((member) => member.role === role) ??
    state.team[0]
  );
}

function makeAudit(
  state: DemoState,
  actor: TeamMember,
  at: string,
  action: string,
  entityType: AuditEvent['entityType'],
  entityId: string,
  summary: string,
  detail?: string,
): AuditEvent {
  return {
    id: `aud-local-${Date.now()}-${randomSuffix()}`,
    at,
    actor: actor.name,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    summary,
    detail,
  };
}

function assertOwner(
  state: DemoState,
  action = 'approve, reject, or execute payments',
): TeamMember {
  if (state.role !== 'owner') {
    throw new Error(`Only the owner can ${action}.`);
  }
  return actorFor(state, 'owner');
}

function findPayment(state: DemoState, paymentId: string): Payment {
  const payment = state.payments.find((item) => item.id === paymentId);
  if (!payment) throw new Error('Payment was not found.');
  return payment;
}

function findInvoice(state: DemoState, invoiceId: string): Invoice {
  const invoice = state.invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw new Error('Invoice was not found.');
  return invoice;
}

function findVendorForInvoice(state: DemoState, invoice: Invoice) {
  const vendor = state.vendors.find((item) => item.id === invoice.vendorId);
  if (!vendor) throw new Error('Vendor was not found.');
  return vendor;
}

export interface ExecuteResult {
  payment: Payment;
  replayed: boolean;
  failed: boolean;
}

/** "api" means PostgreSQL through FastAPI; "local" is the browser fallback. */
export type LedgerMode = 'api' | 'local';

export type ApiStatus = 'connecting' | 'connected' | 'offline' | 'disabled';

export interface LedgerActions {
  setRole: (role: Role) => void;
  updateBusinessProfile: (input: BusinessProfileInput) => Promise<void>;
  importWorkspace: (input: WorkspaceImportInput) => Promise<ImportPreview>;
  restoreWorkspace: (backupJson: string) => Promise<DemoState>;
  recordPayment: (input: PaymentRequestInput) => Promise<Payment>;
  approvePayment: (paymentId: string) => Promise<Payment>;
  rejectPayment: (paymentId: string, reason: string) => Promise<Payment>;
  executePayment: (paymentId: string) => Promise<ExecuteResult>;
  retryPayment: (paymentId: string) => Promise<Payment>;
  reviseInvoice: (invoiceId: string) => Promise<Invoice>;
  verifyVendorBank: (vendorId: string) => Promise<void>;
  toggleForceFailure: () => Promise<boolean>;
  resetDemo: () => Promise<void>;
}

export function useLedger() {
  const [state, setState] = useState<DemoState>(loadState);
  const [mode, setMode] = useState<LedgerMode>('local');
  const [apiStatus, setApiStatus] = useState<ApiStatus>('connecting');
  const [syncError, setSyncError] = useState<string | null>(null);
  const modeRef = useRef<LedgerMode>('local');
  const apiRef = useRef<LedgerApi | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private windows. The demo still works in memory.
    }
  }, [state]);

  // Try the FastAPI service once at startup. If it answers, PostgreSQL becomes
  // the source of truth; otherwise the console keeps the local workspace.
  useEffect(() => {
    if (typeof window === 'undefined') {
      setApiStatus('disabled');
      return;
    }
    const override = new URLSearchParams(window.location.search).get('api');
    if (override === 'off') {
      modeRef.current = 'local';
      setMode('local');
      setApiStatus('disabled');
      return;
    }

    let cancelled = false;
    const api = createApi();
    apiRef.current = api;
    setApiStatus('connecting');

    api
      .bootstrap()
      .then((boot) => {
        if (cancelled) return;
        modeRef.current = 'api';
        setMode('api');
        setApiStatus('connected');
        setSyncError(null);
        setState((current) => {
          const roles = new Set(boot.workspace.team.map((member) => member.role));
          const role = roles.has(current.role) ? current.role : boot.workspace.role;
          return { ...boot.workspace, role };
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        modeRef.current = 'local';
        setMode('local');
        setApiStatus('offline');
        setSyncError(
          error instanceof Error
            ? error.message
            : 'The LedgerPilot API is not reachable. Using the browser workspace.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyWorkspace = (workspace: DemoState, options: { resetRole?: boolean } = {}) => {
    setState((current) => {
      const roles = new Set(workspace.team.map((member) => member.role));
      const preferred: Role = options.resetRole ? 'owner' : current.role;
      const role = roles.has(preferred) ? preferred : workspace.role;
      return { ...workspace, role };
    });
  };

  const runApi = async <T,>(work: (api: LedgerApi) => Promise<T>): Promise<T> => {
    const api = apiRef.current;
    if (!api) throw new Error('The API client is not ready. Reload the page.');
    try {
      const value = await work(api);
      setSyncError(null);
      return value;
    } catch (error) {
      // Validation, role and stale-approval errors are normal business
      // responses, not a lost connection. Only surface connectivity and
      // server faults as a sync banner; the action toast still shows the
      // specific 4xx message.
      const syncFault =
        !(error instanceof ApiError) ||
        error.unreachable ||
        error.status >= 500 ||
        error.code === 'API_BAD_RESPONSE';
      setSyncError(
        syncFault
          ? error instanceof Error
            ? error.message
            : 'The API call failed.'
          : null,
      );
      throw error;
    }
  };

  const views = useMemo(() => getInvoiceViews(state), [state]);
  const totals = useMemo(() => getTotals(state, views), [state, views]);

  const actions: LedgerActions = {
    setRole(role) {
      setState((current) => ({ ...current, role }));
    },

    async updateBusinessProfile(input) {
      assertOwner(state, 'change company settings');
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          await api.updateBusiness(input);
          applyWorkspace(await api.workspace());
        });
      }
      const actor = assertOwner(state, 'change company settings');
      const errors = validateBusinessProfile(input);
      if (errors.length > 0) throw new Error(errors[0]);

      const normalized = {
        name: input.name.trim(),
        gstin: input.gstin.trim().toUpperCase(),
        address: input.address.trim(),
        city: input.city.trim(),
        state: input.state.trim(),
        pincode: input.pincode.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        asOf: normalizeAsOf(input.asOf),
      };
      const nextBusiness = {
        ...state.business,
        ...normalized,
        legalName: normalized.name,
        fy: input.fy.trim() || financialYearFor(normalized.asOf),
      };
      const at = demoNow({ ...state, business: nextBusiness });
      const audit = makeAudit(
        state,
        actor,
        at,
        'Business profile updated',
        'system',
        'business-profile',
        `${actor.name} updated the company profile for ${nextBusiness.name}.`,
        `GSTIN ${nextBusiness.gstin} · ${nextBusiness.city}, ${nextBusiness.state} · as of ${nextBusiness.asOf}. The as-of date changes overdue calculations; the GSTIN state decides intra-state vs inter-state GST for new imports.`,
      );

      setState((current) => ({
        ...current,
        business: nextBusiness,
        audit: [...current.audit, audit],
      }));
    },

    async importWorkspace(input) {
      assertOwner(state, 'import a workspace');
      const at = demoNow(state);
      const preview = previewImport({
        ...input,
        business: state.business,
        importedAt: at,
      });
      if (preview.errorCount > 0) {
        throw new Error(
          `${preview.errorCount} blocking import error${preview.errorCount === 1 ? '' : 's'}. Fix the CSV and preview again.`,
        );
      }
      if (preview.vendorCount === 0) {
        throw new Error('No valid vendors were found in the CSV.');
      }

      const actor = assertOwner(state, 'import a workspace');
      const audit = makeAudit(
        state,
        actor,
        at,
        'Workspace imported',
        'system',
        'workspace-import',
        `Imported ${preview.vendorCount} vendors, ${preview.invoiceCount} invoices and ${preview.openingPaymentCount} opening payments from CSV.`,
        `Replaced the previous workspace. Invoice value ${formatINR(preview.invoiceValuePaise)}; opening paid ${formatINR(preview.openingPaidPaise)}. ${
          modeRef.current === 'api'
            ? 'Saved to the shared PostgreSQL workspace.'
            : 'Data is stored in this browser only.'
        }`,
      );

      if (modeRef.current === 'api' && apiRef.current) {
        const next: DemoState = {
          ...state,
          vendors: preview.vendors,
          invoices: preview.invoices,
          payments: preview.payments,
          audit: [audit],
          forceNextFailure: false,
          seededAt: at,
        };
        await runApi(async (api) => {
          applyWorkspace(await api.replaceWorkspace(next));
        });
        return preview;
      }

      setState((current) => ({
        ...current,
        vendors: preview.vendors,
        invoices: preview.invoices,
        payments: preview.payments,
        audit: [audit],
        forceNextFailure: false,
        seededAt: at,
      }));

      return preview;
    },

    async restoreWorkspace(backupJson) {
      assertOwner(state, 'restore a backup');
      const actor = assertOwner(state, 'restore a backup');
      const restored = parseBackup(backupJson);
      const at = demoNow(restored);
      const audit = makeAudit(
        restored,
        actor,
        at,
        'Workspace restored from backup',
        'system',
        'workspace-restore',
        `${actor.name} restored a workspace backup with ${restored.vendors.length} vendors and ${restored.invoices.length} invoices.`,
        'The backup replaced the vendors, invoices, payments and audit events stored in this workspace.',
      );
      const next: DemoState = {
        ...restored,
        role: state.role,
        forceNextFailure: false,
        audit: [...restored.audit, audit],
        seededAt: at,
      };

      if (modeRef.current === 'api' && apiRef.current) {
        const workspace = await runApi((api) => api.replaceWorkspace(next));
        applyWorkspace(workspace);
        return workspace;
      }

      setState(next);
      return next;
    },

    async recordPayment(input) {
      if (state.role === 'staff') {
        throw new Error('Staff can view invoices but cannot record payments.');
      }
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          const created = await api.createPayment(input, state.role);
          const workspace = await api.workspace();
          applyWorkspace(workspace);
          return findPayment(workspace, String(created.id));
        });
      }
      const invoice = findInvoice(state, input.invoiceId);
      const view = getInvoiceView(state, invoice);
      if (view.checks.some((check) => check.status === 'fail')) {
        throw new Error('Resolve the blocking exceptions before recording a payment.');
      }
      if (input.amountPaise <= 0) {
        throw new Error('Enter a payment amount greater than zero.');
      }
      if (input.amountPaise > view.availablePaise) {
        throw new Error(
          `Amount exceeds the available balance of ${formatINR(view.availablePaise)}.`,
        );
      }
      if (!input.reference.trim()) {
        throw new Error('Enter a payment reference.');
      }

      const actor = actorFor(state, state.role);
      const at = demoNow(state);
      const payment: Payment = {
        id: `pay-local-${Date.now()}-${randomSuffix()}`,
        invoiceId: invoice.id,
        amountPaise: input.amountPaise,
        mode: input.mode,
        reference: input.reference.trim(),
        requestedDate: input.requestedDate,
        recordedBy: actor.name,
        recordedAt: at,
        status: 'pending_approval',
        attempt: 1,
        note: input.note?.trim() || undefined,
      };

      const audit = makeAudit(
        state,
        actor,
        at,
        'Payment request recorded',
        'payment',
        payment.id,
        `${formatINR(payment.amountPaise)} ${payment.mode} request recorded against ${invoice.invoiceNumber}. Owner approval required.`,
      );

      setState((current) => ({
        ...current,
        payments: [...current.payments, payment],
        audit: [...current.audit, audit],
      }));

      return payment;
    },

    async approvePayment(paymentId) {
      assertOwner(state);
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          await api.approvePayment(paymentId);
          const workspace = await api.workspace();
          applyWorkspace(workspace);
          return findPayment(workspace, paymentId);
        });
      }
      const actor = assertOwner(state);
      const payment = findPayment(state, paymentId);
      const invoice = findInvoice(state, payment.invoiceId);
      const vendor = findVendorForInvoice(state, invoice);

      if (payment.status === 'simulated') {
        throw new Error('This payment has already been executed.');
      }
      if (payment.status === 'rejected') {
        throw new Error('This payment was rejected. Record a new request instead.');
      }

      const at = demoNow(state);
      const updated: Payment = {
        ...payment,
        status: 'approved',
        approvedBy: actor.name,
        approvedAt: at,
        approvalFingerprint: fingerprintFor(invoice, vendor),
        failureReason: undefined,
        rejectionReason: undefined,
        attempt: payment.status === 'failed' ? payment.attempt + 1 : payment.attempt,
      };

      const audit = makeAudit(
        state,
        actor,
        at,
        payment.status === 'approved' ? 'Payment re-approved' : 'Payment approved',
        'payment',
        payment.id,
        `${actor.name} approved the ${formatINR(payment.amountPaise)} ${payment.mode} to ${vendor.name}.`,
        `Invoice ${invoice.invoiceNumber}. Approval is tied to the current invoice amount and vendor bank account.`,
      );

      setState((current) => ({
        ...current,
        payments: current.payments.map((item) => (item.id === payment.id ? updated : item)),
        audit: [...current.audit, audit],
      }));

      return updated;
    },

    async rejectPayment(paymentId, reason) {
      assertOwner(state);
      if (!reason.trim()) {
        throw new Error('Enter a reason for rejecting the payment.');
      }
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          await api.rejectPayment(paymentId, reason.trim());
          const workspace = await api.workspace();
          applyWorkspace(workspace);
          return findPayment(workspace, paymentId);
        });
      }
      const actor = assertOwner(state);
      const payment = findPayment(state, paymentId);
      const invoice = findInvoice(state, payment.invoiceId);
      const vendor = findVendorForInvoice(state, invoice);

      if (payment.status === 'simulated') {
        throw new Error('An executed payment cannot be rejected.');
      }
      if (!reason.trim()) {
        throw new Error('Enter a reason for rejecting the payment.');
      }

      const updated: Payment = {
        ...payment,
        status: 'rejected',
        rejectionReason: reason.trim(),
        approvalFingerprint: undefined,
      };
      const at = demoNow(state);

      const audit = makeAudit(
        state,
        actor,
        at,
        'Payment rejected',
        'payment',
        payment.id,
        `${actor.name} rejected the ${formatINR(payment.amountPaise)} ${payment.mode} to ${vendor.name}.`,
        `Reason: ${reason.trim()}. Invoice ${invoice.invoiceNumber}.`,
      );

      setState((current) => ({
        ...current,
        payments: current.payments.map((item) => (item.id === payment.id ? updated : item)),
        audit: [...current.audit, audit],
      }));

      return updated;
    },

    async executePayment(paymentId) {
      assertOwner(state);
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          const current = findPayment(state, paymentId);
          const result = await api.executePayment(current);
          const workspace = await api.workspace();
          applyWorkspace(workspace);
          return {
            payment: findPayment(workspace, paymentId),
            replayed: result.replayed,
            failed: result.failed,
          };
        });
      }
      const actor = assertOwner(state);
      const payment = findPayment(state, paymentId);
      const invoice = findInvoice(state, payment.invoiceId);
      const vendor = findVendorForInvoice(state, invoice);

      if (payment.status === 'simulated') {
        return { payment, replayed: true, failed: false };
      }
      if (payment.status === 'failed') {
        throw new Error('This payment failed. Retry the payment before executing it again.');
      }
      if (payment.status !== 'approved') {
        throw new Error('Owner approval is required before execution.');
      }
      if (!isApprovalCurrent(payment, invoice, vendor)) {
        throw new Error('Approval is stale. Re-approve the revised invoice first.');
      }

      const alreadyPaid = sumPaise(
        state.payments
          .filter(
            (item) =>
              item.invoiceId === invoice.id &&
              item.status === 'simulated' &&
              item.id !== payment.id,
          )
          .map((item) => item.amountPaise),
      );
      if (alreadyPaid + payment.amountPaise > invoice.totalPaise) {
        throw new Error('This payment would over-allocate the invoice.');
      }

      const at = demoNow(state);

      if (state.forceNextFailure) {
        const failed: Payment = {
          ...payment,
          status: 'failed',
          failureReason: 'Mock gateway declined the transfer (forced demo failure).',
          attempt: payment.attempt + 1,
          executedAt: undefined,
          mockTxnId: undefined,
        };
        const audit = makeAudit(
          state,
          actor,
          at,
          'Mock gateway declined',
          'payment',
          payment.id,
          `The simulated ${payment.mode} of ${formatINR(payment.amountPaise)} to ${vendor.name} failed. No money was transferred.`,
          'Demo control was armed to force one failure. The approval remains valid for a safe retry.',
        );
        setState((current) => ({
          ...current,
          forceNextFailure: false,
          payments: current.payments.map((item) =>
            item.id === payment.id ? failed : item,
          ),
          audit: [...current.audit, audit],
        }));
        return { payment: failed, replayed: false, failed: true };
      }

      const txnSuffix = `${at.slice(0, 10).replace(/-/g, '')}-${randomSuffix().toUpperCase()}`;
      const executed: Payment = {
        ...payment,
        status: 'simulated',
        executedAt: at,
        mockTxnId: `MOCK-${payment.mode}-${txnSuffix}`,
        failureReason: undefined,
      };

      const audit = makeAudit(
        state,
        actor,
        at,
        'Mock payment executed',
        'payment',
        payment.id,
        `SIMULATED ${payment.mode} of ${formatINR(payment.amountPaise)} to ${vendor.name} completed as ${executed.mockTxnId}. No money was transferred.`,
        `Invoice ${invoice.invoiceNumber}.`,
      );

      setState((current) => ({
        ...current,
        payments: current.payments.map((item) =>
          item.id === payment.id ? executed : item,
        ),
        audit: [...current.audit, audit],
      }));

      return { payment: executed, replayed: false, failed: false };
    },

    async retryPayment(paymentId) {
      assertOwner(state);
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          await api.retryPayment(paymentId);
          const workspace = await api.workspace();
          applyWorkspace(workspace);
          return findPayment(workspace, paymentId);
        });
      }
      const actor = assertOwner(state);
      const payment = findPayment(state, paymentId);
      const invoice = findInvoice(state, payment.invoiceId);
      const vendor = findVendorForInvoice(state, invoice);

      if (payment.status !== 'failed') {
        throw new Error('Only a failed payment can be retried.');
      }

      const at = demoNow(state);
      const updated: Payment = {
        ...payment,
        status: 'approved',
        approvedBy: actor.name,
        approvedAt: at,
        approvalFingerprint: fingerprintFor(invoice, vendor),
        failureReason: undefined,
        attempt: payment.attempt + 1,
      };

      const audit = makeAudit(
        state,
        actor,
        at,
        'Retry authorised',
        'payment',
        payment.id,
        `${actor.name} authorised a retry of the ${formatINR(payment.amountPaise)} ${payment.mode} to ${vendor.name}.`,
        `Invoice ${invoice.invoiceNumber}. The previous attempt failed; the retry uses the same payment record.`,
      );

      setState((current) => ({
        ...current,
        payments: current.payments.map((item) => (item.id === payment.id ? updated : item)),
        audit: [...current.audit, audit],
      }));

      return updated;
    },

    async reviseInvoice(invoiceId) {
      assertOwner(state);
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          await api.reviseInvoice(invoiceId);
          const workspace = await api.workspace();
          applyWorkspace(workspace);
          const invoice = workspace.invoices.find((item) => item.id === invoiceId);
          if (!invoice) throw new Error('The revised invoice was not returned by the workspace.');
          return invoice;
        });
      }
      const actor = assertOwner(state);
      const invoice = findInvoice(state, invoiceId);
      if (invoice.duplicateOf) throw new Error('A duplicate copy cannot be revised.');
      if (invoice.version >= 4) {
        throw new Error('This demo invoice has already been revised several times.');
      }

      const revisionLine: InvoiceLine = {
        id: `${invoice.id}-rev-${invoice.version + 1}`,
        description: 'Additional freight (supplier revision)',
        hsn: '9965',
        qty: 1,
        unit: 'lot',
        ratePaise: 50000,
        totalPaise: 50000,
      };
      const lines = [...invoice.lines, revisionLine];
      const taxablePaise = sumPaise(lines.map((item) => item.totalPaise));
      const gst = computeGst(taxablePaise, invoice.gstType, invoice.gstRate ?? 18);
      const updated: Invoice = {
        ...invoice,
        lines,
        taxablePaise,
        cgstPaise: gst.cgstPaise,
        sgstPaise: gst.sgstPaise,
        igstPaise: gst.igstPaise,
        roundOffPaise: gst.roundOffPaise,
        totalPaise: gst.totalPaise,
        statedTotalPaise: gst.totalPaise,
        version: invoice.version + 1,
        notes: `${invoice.notes ?? ''} Supplier added ₹500.00 freight after approval.`.trim(),
      };

      const audit = makeAudit(
        state,
        actor,
        demoNow(state),
        'Invoice revised',
        'invoice',
        invoice.id,
        `${invoice.invoiceNumber} was revised by the supplier: ₹500.00 freight added. New total ${formatINR(updated.totalPaise)}.`,
        'Any existing payment approval no longer matches the invoice amount and will be treated as stale.',
      );

      setState((current) => ({
        ...current,
        invoices: current.invoices.map((item) =>
          item.id === invoice.id ? updated : item,
        ),
        audit: [...current.audit, audit],
      }));

      return updated;
    },

    async verifyVendorBank(vendorId) {
      assertOwner(state);
      if (modeRef.current === 'api' && apiRef.current) {
        await runApi(async (api) => {
          await api.verifyVendorBank(vendorId);
          applyWorkspace(await api.workspace());
        });
        return;
      }
      const actor = assertOwner(state);
      const vendor = state.vendors.find((item) => item.id === vendorId);
      if (!vendor) throw new Error('Vendor was not found.');
      if (vendor.bank.status === 'verified') {
        throw new Error('This vendor bank account is already verified.');
      }

      const audit = makeAudit(
        state,
        actor,
        demoNow(state),
        'Vendor bank verified',
        'vendor',
        vendor.id,
        `${actor.name} verified ${vendor.bank.accountMasked} for ${vendor.name} by phone. Payments are unblocked.`,
        `Previous account: ${vendor.bank.previousAccountMasked ?? 'not recorded'}.`,
      );

      setState((current) => ({
        ...current,
        vendors: current.vendors.map((item) =>
          item.id === vendor.id
            ? {
                ...item,
                status: 'active',
                bank: { ...item.bank, status: 'verified' },
              }
            : item,
        ),
        audit: [...current.audit, audit],
      }));
    },

    async toggleForceFailure() {
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          const armed = await api.toggleForceFailure();
          applyWorkspace(await api.workspace());
          return armed;
        });
      }
      const next = !state.forceNextFailure;
      setState((current) => ({
        ...current,
        forceNextFailure: !current.forceNextFailure,
      }));
      return next;
    },

    async resetDemo() {
      if (modeRef.current === 'api' && apiRef.current) {
        return runApi(async (api) => {
          const workspace = await api.resetDemo();
          applyWorkspace(workspace, { resetRole: true });
        });
      }
      setState(buildInitialState());
    },
  };

  return {
    state,
    views,
    totals,
    actions,
    mode,
    apiStatus,
    apiBaseUrl: apiRef.current?.baseUrl ?? apiBaseUrl(),
    syncError,
  };
}
