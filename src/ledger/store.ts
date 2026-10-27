import { useEffect, useMemo, useState } from 'react';
import type {
  AuditEvent,
  DemoState,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentRequestInput,
  Role,
  TeamMember,
} from './types';
import { buildInitialState } from './seed';
import {
  fingerprintFor,
  getInvoiceView,
  getInvoiceViews,
  getTotals,
  isApprovalCurrent,
} from './rules';
import { computeGst, formatINR, sumPaise } from './money';

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

function assertOwner(state: DemoState): TeamMember {
  if (state.role !== 'owner') {
    throw new Error('Only the owner can approve, reject, or execute payments.');
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

export interface LedgerActions {
  setRole: (role: Role) => void;
  recordPayment: (input: PaymentRequestInput) => Payment;
  approvePayment: (paymentId: string) => Payment;
  rejectPayment: (paymentId: string, reason: string) => Payment;
  executePayment: (paymentId: string) => ExecuteResult;
  retryPayment: (paymentId: string) => Payment;
  reviseInvoice: (invoiceId: string) => Invoice;
  verifyVendorBank: (vendorId: string) => void;
  toggleForceFailure: () => void;
  resetDemo: () => void;
}

export function useLedger() {
  const [state, setState] = useState<DemoState>(loadState);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable in private windows. The demo still works in memory.
    }
  }, [state]);

  const views = useMemo(() => getInvoiceViews(state), [state]);
  const totals = useMemo(() => getTotals(state, views), [state, views]);

  const actions: LedgerActions = {
    setRole(role) {
      setState((current) => ({ ...current, role }));
    },

    recordPayment(input) {
      if (state.role === 'staff') {
        throw new Error('Staff can view invoices but cannot record payments.');
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

    approvePayment(paymentId) {
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

    rejectPayment(paymentId, reason) {
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

    executePayment(paymentId) {
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

    retryPayment(paymentId) {
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

    reviseInvoice(invoiceId) {
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
      const gst = computeGst(taxablePaise, invoice.gstType);
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

    verifyVendorBank(vendorId) {
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

    toggleForceFailure() {
      setState((current) => ({
        ...current,
        forceNextFailure: !current.forceNextFailure,
      }));
    },

    resetDemo() {
      setState(buildInitialState());
    },
  };

  return { state, views, totals, actions };
}
