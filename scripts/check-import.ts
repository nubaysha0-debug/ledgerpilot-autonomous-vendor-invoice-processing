import { buildInitialState } from '../src/ledger/seed';
import { computeGst, formatINR, sumPaise, toPaise } from '../src/ledger/money';
import { getInvoiceViews, getTotals } from '../src/ledger/rules';
import {
  INVOICE_CSV_TEMPLATE,
  VENDOR_CSV_TEMPLATE,
  invoicesToCsv,
  parseBackup,
  parseCsv,
  parseDateValue,
  parseMoneyValue,
  previewImport,
  serializeBackup,
  validateBusinessProfile,
  vendorsToCsv,
} from '../src/ledger/importer';

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
const business = state.business;

section('CSV parser');
const parsed = parseCsv(
  '\uFEFFvendor_name,gstin,notes\r\n"ABC, Ltd",27AACCA9123B1Z4,"He said ""hello"""\r\n',
);
check('BOM is stripped from the header', parsed.headers[0] === 'vendor_name');
check('quoted comma stays inside the field', parsed.records[0]?.values.vendor_name === 'ABC, Ltd');
check(
  'escaped quotes are unescaped',
  parsed.records[0]?.values.notes === 'He said "hello"',
  parsed.records[0]?.values.notes,
);
check('data row line numbers are 2', parsed.records[0]?.line === 2);

const semicolon = parseCsv('vendor_name;gstin\nABC;27AACCA9123B1Z4\n');
check('semicolon-delimited files are detected', semicolon.delimiter === ';');
check('semicolon rows parse', semicolon.records[0]?.values.gstin === '27AACCA9123B1Z4');

section('Value parsers');
check('date ISO', parseDateValue('2026-10-27') === '2026-10-27');
check('date DD/MM/YYYY', parseDateValue('27/10/2026') === '2026-10-27');
check('date DD-MMM-YYYY', parseDateValue('27-Oct-2026') === '2026-10-27');
check('impossible date rejected', parseDateValue('2026-02-30') === null);
check('money with rupee sign and commas', parseMoneyValue('₹1,234.50') === 1234.5);
check('money with Rs prefix', parseMoneyValue('Rs. 500') === 500);
check('negative money in brackets', parseMoneyValue('(250)') === -250);
check('text money rejected', parseMoneyValue('not a number') === null);
check('12% intra GST splits 6% + 6%', computeGst(100000, 'intra', 12).cgstPaise === 6000);
check('12% inter GST is 12% IGST', computeGst(100000, 'inter', 12).igstPaise === 12000);
check('5% intra GST splits 2.5% + 2.5%', computeGst(100000, 'intra', 5).cgstPaise === 2500);
check(
  '18% totals are unchanged by the rate-aware split',
  computeGst(100000, 'intra', 18).totalPaise === computeGst(100000, 'intra').totalPaise,
);

section('Starter templates');
const template = previewImport({
  business,
  vendorsCsv: VENDOR_CSV_TEMPLATE,
  invoicesCsv: INVOICE_CSV_TEMPLATE,
  importedAt: '2026-10-27T19:00:00+05:30',
});
check('template imports without errors', template.errorCount === 0, String(template.errorCount));
check('template imports two vendors', template.vendorCount === 2, String(template.vendorCount));
check('template imports two invoices', template.invoiceCount === 2, String(template.invoiceCount));
check('template imports three lines', template.lineCount === 3, String(template.lineCount));
check('template has one opening payment', template.openingPaymentCount === 1);
check('template has no warnings', template.warningCount === 0, String(template.warningCount));

const sampleTools = template.invoices.find((invoice) => invoice.invoiceNumber === 'STT/26-27/0011');
check('template intra-state invoice exists', Boolean(sampleTools));
check(
  'template intra-state taxable value is ₹26,420.00',
  sampleTools?.taxablePaise === toPaise(26420),
  sampleTools ? formatINR(sampleTools.taxablePaise) : 'missing',
);
check(
  'template intra-state total is ₹31,176.00',
  sampleTools?.totalPaise === toPaise(31176),
  sampleTools ? formatINR(sampleTools.totalPaise) : 'missing',
);
check(
  'template intra-state CGST is ₹2,377.80',
  sampleTools?.cgstPaise === toPaise(2377.8),
  sampleTools ? formatINR(sampleTools.cgstPaise) : 'missing',
);
check('template intra-state GST type', sampleTools?.gstType === 'intra');
check('template GST rate is 18', sampleTools?.gstRate === 18);

const sampleCable = template.invoices.find((invoice) => invoice.invoiceNumber === 'SCH/26-27/0042');
check('template inter-state invoice exists', Boolean(sampleCable));
check('template inter-state GST type', sampleCable?.gstType === 'inter');
check('template inter-state rate is 12', sampleCable?.gstRate === 12);
check(
  'template inter-state IGST is ₹720.00',
  sampleCable?.igstPaise === toPaise(720),
  sampleCable ? formatINR(sampleCable.igstPaise) : 'missing',
);
check(
  'template opening payment is ₹2,000.00',
  template.openingPaidPaise === toPaise(2000),
  formatINR(template.openingPaidPaise),
);
check(
  'template balance after opening payment is ₹35,896.00',
  sampleCable?.totalPaise === toPaise(6720) && template.balancePaise === toPaise(35896),
  formatINR(template.balancePaise),
);

section('Duplicate and invalid rows');
const duplicateLinesCsv = [
  'vendor_gstin,invoice_number,issue_date,description,qty,rate,gst_type,gst_rate',
  '27AASCT1234A1Z5,DUP/26-27/0001,2026-10-01,Widget,2,100.00,intra,18',
  '27AASCT1234A1Z5,DUP/26-27/0001,2026-10-01,Widget,2,100.00,intra,18',
].join('\r\n');
const duplicateLines = previewImport({
  business,
  vendorsCsv: VENDOR_CSV_TEMPLATE,
  invoicesCsv: duplicateLinesCsv,
});
check('duplicate line does not add an error', duplicateLines.errorCount === 0);
check('duplicate line raises a warning', duplicateLines.warningCount === 1);
check('duplicate line is skipped', duplicateLines.lineCount === 1, String(duplicateLines.lineCount));
check(
  'duplicate line total is not doubled',
  duplicateLines.invoices[0]?.totalPaise === toPaise(236),
  duplicateLines.invoices[0] ? formatINR(duplicateLines.invoices[0].totalPaise) : 'missing',
);

const missingOriginal = previewImport({
  business,
  vendorsCsv: VENDOR_CSV_TEMPLATE,
  invoicesCsv: [
    'vendor_gstin,invoice_number,issue_date,description,qty,rate,duplicate_of',
    '27AASCT1234A1Z5,DUP/26-27/0002,2026-10-01,Widget,1,100.00,MISSING/26-27/0001',
  ].join('\r\n'),
});
check('duplicate_of with no original blocks the invoice', missingOriginal.invoiceCount === 0);
check('duplicate_of with no original is an error', missingOriginal.errorCount > 0);
check(
  'duplicate_of error names the field',
  missingOriginal.issues.some((item) => item.field === 'duplicate_of' && item.severity === 'error'),
);

const badVendorsCsv = [
  'vendor_name,gstin,city,state,bank_name,account_number,ifsc',
  'Bad Vendor,27BAD,Nashik,Maharashtra,HDFC Bank,123456789012,HDFC0001234',
].join('\r\n');
const badVendor = previewImport({
  business,
  vendorsCsv: badVendorsCsv,
  invoicesCsv: 'vendor_gstin,invoice_number,issue_date,description,qty,rate\r\n',
});
check('invalid GSTIN blocks the vendor', badVendor.vendorCount === 0);
check('invalid GSTIN is reported', badVendor.errorCount > 0);
check(
  'invalid GSTIN message names the field',
  badVendor.issues.some((item) => item.field === 'gstin' && item.severity === 'error'),
);

const unknownVendor = previewImport({
  business,
  vendorsCsv: VENDOR_CSV_TEMPLATE,
  invoicesCsv: [
    'vendor_gstin,invoice_number,issue_date,description,qty,rate',
    '27AAZZZ9999Z1Z9,UNK/1,2026-10-01,Widget,1,100',
  ].join('\r\n'),
});
check('unknown vendor blocks the invoice', unknownVendor.invoiceCount === 0);
check('unknown vendor is reported', unknownVendor.errorCount > 0);

const gstinMismatch = previewImport({
  business,
  vendorsCsv: VENDOR_CSV_TEMPLATE,
  invoicesCsv: [
    'vendor_gstin,vendor_name,invoice_number,issue_date,description,qty,rate',
    '27AAZZZ9999Z1Z9,Sample Tools & Traders,GST/1,2026-10-01,Widget,1,100.00',
  ].join('\r\n'),
});
check('unknown GSTIN can still match by vendor name', gstinMismatch.invoiceCount === 1);
check('unknown GSTIN raises a warning', gstinMismatch.warningCount === 1);
check(
  'unknown GSTIN warning names the field',
  gstinMismatch.issues.some(
    (item) => item.field === 'vendor_gstin' && item.severity === 'warning',
  ),
);

const overpaid = previewImport({
  business,
  vendorsCsv: VENDOR_CSV_TEMPLATE,
  invoicesCsv: [
    'vendor_gstin,invoice_number,issue_date,description,qty,rate,amount_paid',
    '27AASCT1234A1Z5,OVER/1,2026-10-01,Widget,1,100.00,500.00',
  ].join('\r\n'),
});
check('overpaid opening amount blocks the invoice', overpaid.invoiceCount === 0);
check('overpaid opening amount is reported', overpaid.errorCount > 0);

section('Seed CSV round-trip');
const roundTrip = previewImport({
  business,
  vendorsCsv: vendorsToCsv(state.vendors),
  invoicesCsv: invoicesToCsv(state),
  importedAt: '2026-10-27T19:00:00+05:30',
});
check('seed vendors round-trip without errors', roundTrip.errorCount === 0, String(roundTrip.errorCount));
check('seed vendors round-trip', roundTrip.vendorCount === 12, String(roundTrip.vendorCount));
check('seed invoices round-trip', roundTrip.invoiceCount === 16, String(roundTrip.invoiceCount));
check(
  'seed invoice value round-trips',
  roundTrip.invoiceValuePaise ===
    sumPaise(
      state.invoices
        .filter((invoice) => !invoice.duplicateOf)
        .map((invoice) => invoice.totalPaise),
    ),
  formatINR(roundTrip.invoiceValuePaise),
);
check(
  'round-trip preview balance is ₹3,83,870.00',
  roundTrip.balancePaise === toPaise(383870),
  formatINR(roundTrip.balancePaise),
);
check(
  'seed opening payments equal simulated payments',
  roundTrip.openingPaidPaise ===
    sumPaise(
      state.payments
        .filter((payment) => payment.status === 'simulated')
        .map((payment) => payment.amountPaise),
    ),
  formatINR(roundTrip.openingPaidPaise),
);
check('seed duplicate is preserved', roundTrip.duplicateInvoiceCount === 1);

const roundTripState = {
  ...state,
  vendors: roundTrip.vendors,
  invoices: roundTrip.invoices,
  payments: roundTrip.payments,
};
const roundTripViews = getInvoiceViews(roundTripState);
const roundTripTotals = getTotals(roundTripState, roundTripViews);
check(
  'round-trip payable is ₹3,83,870.00',
  roundTripTotals.payablePaise === toPaise(383870),
  formatINR(roundTripTotals.payablePaise),
);
check(
  'round-trip overdue is unchanged',
  roundTripTotals.overduePaise === toPaise(101088),
  formatINR(roundTripTotals.overduePaise),
);
check(
  'round-trip exceptions are unchanged at 4',
  roundTripTotals.exceptionCount === 4,
  String(roundTripTotals.exceptionCount),
);
check(
  'round-trip flattens payments into six opening payments',
  roundTripTotals.simulatedPaymentCount === 6,
  String(roundTripTotals.simulatedPaymentCount),
);
const roundSharma = roundTripViews.find(
  (view) => view.invoice.invoiceNumber === 'Sharma/26-27/0412',
);
check(
  'round-trip keeps the ₹135.00 Sharma mismatch',
  Boolean(
    roundSharma &&
      roundSharma.invoice.statedTotalPaise - roundSharma.invoice.totalPaise === toPaise(135),
  ),
);
const roundNashik = roundTripViews.find(
  (view) => view.invoice.invoiceNumber === 'NLH/26-27/0288',
);
check(
  'round-trip keeps the Nashik bank-change block',
  Boolean(roundNashik?.checks.find((item) => item.id === 'bank' && item.status === 'fail')),
);

section('Backup');
const backup = serializeBackup(state);
const restored = parseBackup(backup);
check('backup keeps 12 vendors', restored.vendors.length === 12);
check('backup keeps 16 invoices', restored.invoices.length === 16);
check('backup keeps 10 payments', restored.payments.length === 10);
check('backup keeps 19 audit events', restored.audit.length === 19);
check('backup keeps the business GSTIN', restored.business.gstin === business.gstin);
let rejectedBackup = false;
try {
  parseBackup('{"hello":"world"}');
} catch {
  rejectedBackup = true;
}
check('invalid backup is rejected', rejectedBackup);

section('Business profile');
const validProfile = {
  name: business.name,
  gstin: business.gstin,
  address: business.address,
  city: business.city,
  state: business.state,
  pincode: business.pincode,
  phone: business.phone,
  email: business.email,
  fy: business.fy,
  asOf: business.asOf,
};
check('seed profile is valid', validateBusinessProfile(validProfile).length === 0);
check(
  'bad GSTIN is rejected',
  validateBusinessProfile({ ...validProfile, gstin: '27BAD' }).length > 0,
);
check(
  'unknown state is rejected',
  validateBusinessProfile({ ...validProfile, state: 'Atlantis' }).length > 0,
);
check(
  'bad PIN code is rejected',
  validateBusinessProfile({ ...validProfile, pincode: '42' }).length > 0,
);
check(
  'impossible as-of date is rejected',
  validateBusinessProfile({ ...validProfile, asOf: 'not-a-date' }).length > 0,
);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`\n${failures} import check(s) failed.`);
  throw new Error('Import checks failed.');
}
console.log('Import checks passed. CSV templates, validation and round-trip are consistent.');
