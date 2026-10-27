import type {
  AgeingBucket,
  Check,
  DemoState,
  Invoice,
  InvoiceStatus,
  InvoiceView,
  LedgerTotals,
  Payment,
  Vendor,
} from './types';
import { computeGst, formatDate, formatINR, sumPaise, toPaise } from './money';

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const PO_THRESHOLD_PAISE = toPaise(25000);

export function getVendor(state: DemoState, vendorId: string): Vendor {
  const vendor = state.vendors.find((item) => item.id === vendorId);
  if (!vendor) throw new Error(`Vendor ${vendorId} was not found.`);
  return vendor;
}

export function fingerprintFor(invoice: Invoice, vendor: Vendor): string {
  return [
    invoice.id,
    invoice.version,
    invoice.totalPaise,
    vendor.id,
    vendor.bank.accountMasked,
  ].join('|');
}

export function isApprovalCurrent(payment: Payment, invoice: Invoice, vendor: Vendor): boolean {
  return payment.approvalFingerprint === fingerprintFor(invoice, vendor);
}

export function paymentsForInvoice(state: DemoState, invoiceId: string): Payment[] {
  return state.payments
    .filter((payment) => payment.invoiceId === invoiceId)
    .slice()
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export function getActivePayment(payments: Payment[]): Payment | undefined {
  return payments
    .filter(
      (payment) =>
        payment.status === 'pending_approval' ||
        payment.status === 'approved' ||
        payment.status === 'failed',
    )
    .slice()
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .at(-1);
}

export function computeChecks(state: DemoState, invoice: Invoice): Check[] {
  const vendor = getVendor(state, invoice.vendorId);
  const linesTotal = sumPaise(invoice.lines.map((item) => item.totalPaise));
  const expected = computeGst(linesTotal, invoice.gstType, invoice.gstRate ?? 18);
  const checks: Check[] = [];

  const storedTaxMatches =
    invoice.taxablePaise === linesTotal &&
    invoice.cgstPaise === expected.cgstPaise &&
    invoice.sgstPaise === expected.sgstPaise &&
    invoice.igstPaise === expected.igstPaise &&
    invoice.totalPaise === expected.totalPaise;
  const statedMatches = invoice.statedTotalPaise === invoice.totalPaise;

  if (storedTaxMatches && statedMatches) {
    const roundOff =
      invoice.roundOffPaise === 0
        ? ''
        : ` ${invoice.roundOffPaise > 0 ? '+' : ''}${formatINR(invoice.roundOffPaise)} round-off`;
    checks.push({
      id: 'arithmetic',
      label: 'Line items & GST arithmetic',
      status: 'pass',
      evidence: `Taxable ${formatINR(linesTotal)} + GST ${formatINR(expected.totalTaxPaise)}${roundOff} = ${formatINR(invoice.totalPaise)}.`,
    });
  } else if (invoice.taxablePaise !== linesTotal) {
    checks.push({
      id: 'arithmetic',
      label: 'Line items & GST arithmetic',
      status: 'fail',
      evidence: `Line items total ${formatINR(linesTotal)}, but the recorded taxable value is ${formatINR(invoice.taxablePaise)}.`,
    });
  } else if (!statedMatches) {
    const difference = invoice.statedTotalPaise - expected.totalPaise;
    checks.push({
      id: 'arithmetic',
      label: 'Line items & GST arithmetic',
      status: 'fail',
      evidence: `Line items and GST total ${formatINR(expected.totalPaise)}. Invoice states ${formatINR(invoice.statedTotalPaise)}. Difference ${formatINR(difference)}.`,
    });
  } else {
    checks.push({
      id: 'arithmetic',
      label: 'Line items & GST arithmetic',
      status: 'fail',
      evidence: `Recorded GST does not match the tax split for this invoice.`,
    });
  }

  if (invoice.duplicateOf) {
    const original = state.invoices.find((item) => item.id === invoice.duplicateOf);
    checks.push({
      id: 'duplicate',
      label: 'Duplicate invoice',
      status: 'fail',
      evidence: `Same vendor, number and amount as ${original?.invoiceNumber ?? 'an earlier invoice'}. This copy arrived ${formatDate(invoice.receivedDate)}.`,
    });
  } else {
    const linkedCopy = state.invoices.find((item) => item.duplicateOf === invoice.id);
    checks.push({
      id: 'duplicate',
      label: 'Duplicate invoice',
      status: 'pass',
      evidence: linkedCopy
        ? 'A duplicate upload is linked to this invoice and excluded from payables.'
        : 'No other invoice with the same vendor, number and amount was found.',
    });
  }

  if (!invoice.poNumber && invoice.taxablePaise >= PO_THRESHOLD_PAISE) {
    checks.push({
      id: 'po',
      label: 'Purchase order',
      status: 'warn',
      evidence: `No PO linked for a ${formatINR(invoice.totalPaise)} purchase. Owner approval is required before payment.`,
    });
  } else {
    checks.push({
      id: 'po',
      label: 'Purchase order',
      status: 'pass',
      evidence: invoice.poNumber
        ? `PO ${invoice.poNumber} linked${invoice.grnNumber ? ` · ${invoice.grnNumber}` : ''}.`
        : `Below the ₹25,000 PO threshold.`,
    });
  }

  if (vendor.bank.status === 'changed') {
    checks.push({
      id: 'bank',
      label: 'Vendor bank account',
      status: 'fail',
      evidence: `Account changed on ${formatDate(vendor.bank.changedAt ?? invoice.receivedDate)} from ${vendor.bank.previousAccountMasked} to ${vendor.bank.accountMasked}. Verify with the vendor by phone before paying.`,
    });
  } else {
    checks.push({
      id: 'bank',
      label: 'Vendor bank account',
      status: 'pass',
      evidence: `${vendor.bank.bankName} ${vendor.bank.accountMasked} matches the vendor master.`,
    });
  }

  const gstinValid = GSTIN_PATTERN.test(vendor.gstin);
  checks.push({
    id: 'gstin',
    label: 'Vendor GSTIN',
    status: gstinValid ? 'pass' : 'fail',
    evidence: gstinValid
      ? `${vendor.gstin} is a valid 15-character GSTIN.`
      : `${vendor.gstin} is not a valid GSTIN.`,
  });

  return checks;
}

function deriveStatus(
  invoice: Invoice,
  vendor: Vendor,
  payments: Payment[],
  checks: Check[],
  paidPaise: number,
  outstandingPaise: number,
): InvoiceStatus {
  if (invoice.duplicateOf) return 'Needs review';
  if (outstandingPaise <= 0) return 'Paid';

  const active = getActivePayment(payments);
  if (active?.status === 'failed') return 'Payment failed';
  if (active?.status === 'approved' && !isApprovalCurrent(active, invoice, vendor)) {
    return 'Approval stale';
  }
  if (active?.status === 'pending_approval') return 'Pending approval';
  if (active?.status === 'approved') return 'Approved';
  if (active?.status === 'rejected') return paidPaise > 0 ? 'Part-paid' : 'Rejected';
  if (checks.some((check) => check.status === 'fail')) return 'Needs review';
  if (paidPaise > 0) return 'Part-paid';
  if (checks.some((check) => check.status === 'warn')) return 'Needs review';
  return 'Ready for approval';
}

export function getInvoiceView(state: DemoState, invoice: Invoice): InvoiceView {
  const vendor = getVendor(state, invoice.vendorId);
  const payments = paymentsForInvoice(state, invoice.id);
  const checks = computeChecks(state, invoice);
  const paidPaise = sumPaise(
    payments.filter((payment) => payment.status === 'simulated').map((payment) => payment.amountPaise),
  );
  const reservedPaise = sumPaise(
    payments
      .filter(
        (payment) =>
          payment.status === 'pending_approval' || payment.status === 'approved',
      )
      .map((payment) => payment.amountPaise),
  );
  const outstandingPaise = Math.max(0, invoice.totalPaise - paidPaise);
  const availablePaise = Math.max(0, outstandingPaise - reservedPaise);
  const activePayment = getActivePayment(payments);
  const approvalStale =
    activePayment?.status === 'approved' &&
    !isApprovalCurrent(activePayment, invoice, vendor);

  const asOf = state.business.asOf;
  const dueDate = invoice.dueDate;
  const isOverdue = dueDate < asOf.slice(0, 10) && outstandingPaise > 0;
  const overdueDays = isOverdue
    ? Math.max(0, daysBetween(dueDate, asOf))
    : 0;
  const dueInDays = !isOverdue && outstandingPaise > 0
    ? Math.max(0, daysBetween(asOf, dueDate))
    : 0;

  return {
    invoice,
    vendor,
    payments,
    paidPaise,
    reservedPaise,
    outstandingPaise,
    availablePaise,
    checks,
    status: deriveStatus(invoice, vendor, payments, checks, paidPaise, outstandingPaise),
    overdueDays,
    dueInDays,
    activePayment,
    approvalStale,
  };
}

export function getInvoiceViews(state: DemoState): InvoiceView[] {
  return state.invoices
    .map((invoice) => getInvoiceView(state, invoice))
    .sort((a, b) => b.invoice.issueDate.localeCompare(a.invoice.issueDate));
}

export function getTotals(state: DemoState, views: InvoiceView[]): LedgerTotals {
  const billable = views.filter(
    (view) =>
      !view.invoice.duplicateOf &&
      view.status !== 'Paid' &&
      view.status !== 'Rejected',
  );
  const overdue = billable.filter((view) => view.overdueDays > 0);
  const dueSoon = billable.filter(
    (view) =>
      view.overdueDays === 0 &&
      view.dueInDays >= 0 &&
      view.dueInDays <= 7 &&
      view.outstandingPaise > 0,
  );
  const pending = state.payments.filter((payment) => payment.status === 'pending_approval');
  const approved = state.payments.filter((payment) => payment.status === 'approved');
  const month = state.business.asOf.slice(0, 7);
  const simulated = state.payments.filter((payment) => payment.status === 'simulated');

  return {
    payablePaise: sumPaise(billable.map((view) => view.outstandingPaise)),
    overduePaise: sumPaise(overdue.map((view) => view.outstandingPaise)),
    overdueCount: overdue.length,
    dueSoonPaise: sumPaise(dueSoon.map((view) => view.outstandingPaise)),
    dueSoonCount: dueSoon.length,
    pendingApprovalCount: pending.length,
    pendingApprovalPaise: sumPaise(pending.map((payment) => payment.amountPaise)),
    approvedToPayPaise: sumPaise(approved.map((payment) => payment.amountPaise)),
    approvedToPayCount: approved.length,
    exceptionCount: views.filter(
      (view) =>
        view.outstandingPaise > 0 &&
        view.checks.some((check) => check.status !== 'pass'),
    ).length,
    paidThisMonthPaise: sumPaise(
      simulated
        .filter((payment) => payment.executedAt?.slice(0, 7) === month)
        .map((payment) => payment.amountPaise),
    ),
    simulatedPaymentCount: simulated.length,
  };
}

export function getAgeingBuckets(views: InvoiceView[]): AgeingBucket[] {
  const billable = views.filter(
    (view) =>
      !view.invoice.duplicateOf &&
      view.status !== 'Paid' &&
      view.status !== 'Rejected' &&
      view.outstandingPaise > 0,
  );

  const buckets: AgeingBucket[] = [
    { label: 'Not due', amountPaise: 0, count: 0 },
    { label: '0-15 days', amountPaise: 0, count: 0 },
    { label: '16-30 days', amountPaise: 0, count: 0 },
    { label: '31-60 days', amountPaise: 0, count: 0 },
    { label: '60+ days', amountPaise: 0, count: 0 },
  ];

  billable.forEach((view) => {
    let index = 0;
    if (view.overdueDays > 60) index = 4;
    else if (view.overdueDays > 30) index = 3;
    else if (view.overdueDays > 15) index = 2;
    else if (view.overdueDays > 0) index = 1;
    buckets[index].amountPaise += view.outstandingPaise;
    buckets[index].count += 1;
  });

  return buckets;
}

export function getVendorOpenInvoices(views: InvoiceView[], vendorId: string): InvoiceView[] {
  return views.filter(
    (view) =>
      view.vendor.id === vendorId &&
      !view.invoice.duplicateOf &&
      view.status !== 'Paid' &&
      view.status !== 'Rejected',
  );
}

export function getVendorOutstanding(views: InvoiceView[], vendorId: string): number {
  return sumPaise(
    getVendorOpenInvoices(views, vendorId).map((view) => view.outstandingPaise),
  );
}

export function getVendorOverdue(views: InvoiceView[], vendorId: string): number {
  return sumPaise(
    getVendorOpenInvoices(views, vendorId)
      .filter((view) => view.overdueDays > 0)
      .map((view) => view.outstandingPaise),
  );
}

// Kept local so this module does not depend on the UI layer.
function daysBetween(from: string, to: string): number {
  const fromDate = from.slice(0, 10).split('-').map(Number);
  const toDate = to.slice(0, 10).split('-').map(Number);
  const fromUtc = Date.UTC(fromDate[0], fromDate[1] - 1, fromDate[2]);
  const toUtc = Date.UTC(toDate[0], toDate[1] - 1, toDate[2]);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}
