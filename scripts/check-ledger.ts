import { buildInitialState, invoices, payments, vendors } from '../src/ledger/seed';
import {
  computeGst,
  formatINR,
  sumPaise,
  toPaise,
} from '../src/ledger/money';
import {
  GSTIN_PATTERN,
  fingerprintFor,
  getAgeingBuckets,
  getInvoiceView,
  getInvoiceViews,
  getTotals,
  isApprovalCurrent,
} from '../src/ledger/rules';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail?: string) {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const state = buildInitialState();
const views = getInvoiceViews(state);
const totals = getTotals(state, views);

section('Seed shape');
check('12 vendors', vendors.length === 12, `found ${vendors.length}`);
check('16 invoices', invoices.length === 16, `found ${invoices.length}`);
check('10 payment records', payments.length === 10, `found ${payments.length}`);
check(
  'all vendor GSTINs are valid',
  vendors.every((vendor) => GSTIN_PATTERN.test(vendor.gstin)),
);
check('business GSTIN is valid', GSTIN_PATTERN.test(state.business.gstin));

section('Invoice arithmetic');
invoices.forEach((invoice) => {
  const lineTotal = sumPaise(invoice.lines.map((line) => line.totalPaise));
  const gst = computeGst(lineTotal, invoice.gstType);
  check(
    `${invoice.invoiceNumber}: line sum = taxable`,
    lineTotal === invoice.taxablePaise,
    `${formatINR(lineTotal)} vs ${formatINR(invoice.taxablePaise)}`,
  );
  check(
    `${invoice.invoiceNumber}: GST total = recorded total`,
    gst.totalPaise === invoice.totalPaise,
    `${formatINR(gst.totalPaise)} vs ${formatINR(invoice.totalPaise)}`,
  );
  if (invoice.id === 'inv-sharma-0412') {
    check(
      'Sharma stated total differs by exactly ₹135.00',
      invoice.statedTotalPaise - invoice.totalPaise === toPaise(135),
      `delta ${formatINR(invoice.statedTotalPaise - invoice.totalPaise)}`,
    );
  } else {
    check(
      `${invoice.invoiceNumber}: stated total matches`,
      invoice.statedTotalPaise === invoice.totalPaise,
    );
  }
});

section('Demo storyline');
const abc = views.find((view) => view.invoice.id === 'inv-abc-0184');
check('ABC invoice exists', Boolean(abc));
check('ABC total is ₹12,500.00', abc?.invoice.totalPaise === toPaise(12500));
check('ABC paid is ₹5,000.00', abc?.paidPaise === toPaise(5000));
check('ABC balance is ₹7,500.00', abc?.outstandingPaise === toPaise(7500));
check('ABC status is Part-paid', abc?.status === 'Part-paid');

const trimurti = views.find((view) => view.invoice.id === 'inv-trimurti-0341');
check('Trimurti has two completed partials', trimurti?.payments.filter((p) => p.status === 'simulated').length === 2);
check('Trimurti paid is ₹7,000.00', trimurti?.paidPaise === toPaise(7000));
check('Trimurti balance is ₹7,632.00', trimurti?.outstandingPaise === toPaise(7632));

const sharma = views.find((view) => view.invoice.id === 'inv-sharma-0412');
check(
  'Sharma arithmetic check fails',
  Boolean(sharma?.checks.find((c) => c.id === 'arithmetic' && c.status === 'fail')),
);
check(
  'Sharma exception evidence contains ₹135.00',
  Boolean(sharma?.checks.find((c) => c.evidence.includes('₹135.00'))),
);

const duplicate = views.find((view) => view.invoice.id === 'inv-sahyadri-0771-dup');
check(
  'Duplicate check fails on the second Sahyadri copy',
  Boolean(duplicate?.checks.find((c) => c.id === 'duplicate' && c.status === 'fail')),
);
check('Duplicate is excluded from payables', Boolean(duplicate?.invoice.duplicateOf));

const nashik = views.find((view) => view.invoice.id === 'inv-nashik-0288');
check(
  'Nashik Lighting bank change blocks payment',
  Boolean(nashik?.checks.find((c) => c.id === 'bank' && c.status === 'fail')),
);

const omsai = views.find((view) => view.invoice.id === 'inv-omsai-0507');
check(
  'Om Sai missing PO is a warning',
  Boolean(omsai?.checks.find((c) => c.id === 'po' && c.status === 'warn')),
);

section('Balances');
views.forEach((view) => {
  check(
    `${view.invoice.invoiceNumber}: balance is not negative`,
    view.outstandingPaise >= 0,
  );
  const simulated = sumPaise(
    view.payments.filter((p) => p.status === 'simulated').map((p) => p.amountPaise),
  );
  check(
    `${view.invoice.invoiceNumber}: allocated amount does not exceed total`,
    simulated <= view.invoice.totalPaise,
  );
});

check(
  'debit approvals are current for seeded approved payments',
  state.payments
    .filter((payment) => payment.status === 'approved')
    .every((payment) => {
      const invoice = state.invoices.find((item) => item.id === payment.invoiceId);
      const vendor = state.vendors.find((item) => item.id === invoice?.vendorId);
      return Boolean(invoice && vendor && isApprovalCurrent(payment, invoice, vendor));
    }),
);

const deccan = state.invoices.find((invoice) => invoice.id === 'inv-deccan-0559');
const deccanVendor = vendors.find((vendor) => vendor.id === deccan?.vendorId);
const deccanPayment = payments.find((payment) => payment.id === 'pay-deccan-0559');
check(
  'Deccan approval is current',
  Boolean(
    deccan &&
      deccanVendor &&
      deccanPayment &&
      isApprovalCurrent(deccanPayment, deccan, deccanVendor),
  ),
);
if (deccan && deccanVendor && deccanPayment) {
  const revised = {
    ...deccan,
    version: deccan.version + 1,
    totalPaise: deccan.totalPaise + toPaise(500),
  };
  check(
    'Changing the invoice makes the Deccan approval stale',
    !isApprovalCurrent(deccanPayment, revised, deccanVendor),
  );
  check(
    'Fingerprint changes when the invoice is revised',
    fingerprintFor(deccan, deccanVendor) !== fingerprintFor(revised, deccanVendor),
  );
}

section('Dashboard totals');
check(
  'Total payable is ₹3,83,870.00',
  totals.payablePaise === toPaise(383870),
  formatINR(totals.payablePaise),
);
check(
  'Overdue is ₹1,01,088.00',
  totals.overduePaise === toPaise(101088),
  formatINR(totals.overduePaise),
);
check('Overdue count is 4', totals.overdueCount === 4, String(totals.overdueCount));
check(
  'Due in 7 days is ₹11,151.00',
  totals.dueSoonPaise === toPaise(11151),
  formatINR(totals.dueSoonPaise),
);
check('Pending approval count is 1', totals.pendingApprovalCount === 1);
check('Approved to pay count is 2', totals.approvedToPayCount === 2);
check(
  'Approved to pay is ₹1,76,056.00',
  totals.approvedToPayPaise === toPaise(176056),
  formatINR(totals.approvedToPayPaise),
);
check('Exception count is 4', totals.exceptionCount === 4, String(totals.exceptionCount));
check(
  'Paid this month is ₹1,02,388.00',
  totals.paidThisMonthPaise === toPaise(102388),
  formatINR(totals.paidThisMonthPaise),
);
check('7 simulated payments', totals.simulatedPaymentCount === 7);

section('Ageing');
const buckets = getAgeingBuckets(views);
check(
  'Overdue bucket is ₹1,01,088.00',
  buckets[1].amountPaise === toPaise(101088),
  formatINR(buckets[1].amountPaise),
);
check(
  'Ageing totals reconcile to payable',
  sumPaise(buckets.map((bucket) => bucket.amountPaise)) === totals.payablePaise,
);

section('Formatting');
check('INR uses Indian digit grouping', formatINR(toPaise(383870)).includes('3,83,870'));

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`\n${failures} ledger check(s) failed.`);
  throw new Error('Ledger checks failed.');
}
console.log('Ledger checks passed. Demo numbers are internally consistent.');
