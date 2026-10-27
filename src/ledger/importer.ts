import type {
  Business,
  BusinessProfileInput,
  DemoState,
  GstType,
  Invoice,
  InvoiceLine,
  Payment,
  PaymentMode,
  Vendor,
} from './types';
import { computeGst, sumPaise, toPaise } from './money';
import { GSTIN_PATTERN } from './rules';

/**
 * Local CSV import/export.
 *
 * Everything in this module runs in the browser. The importer is deliberately
 * strict about identity, tax and bank fields because a bad row becomes a real
 * payable instruction inside the console. Rows with errors are never imported.
 */

export interface ImportIssue {
  scope: 'vendors' | 'invoices';
  row: number;
  field?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ImportSummary {
  vendorCount: number;
  invoiceCount: number;
  lineCount: number;
  openingPaymentCount: number;
  invoiceValuePaise: number;
  openingPaidPaise: number;
  balancePaise: number;
  duplicateInvoiceCount: number;
}

export interface ImportPreview extends ImportSummary {
  vendors: Vendor[];
  invoices: Invoice[];
  payments: Payment[];
  issues: ImportIssue[];
  errorCount: number;
  warningCount: number;
}

export interface WorkspaceImportInput {
  vendorsCsv: string;
  invoicesCsv: string;
}

export const INDIAN_STATES: Array<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

function stateKey(value: string): string {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
}

const STATE_BY_KEY = new Map<string, { code: string; name: string }>();
const STATE_BY_CODE = new Map<string, string>();

for (const state of INDIAN_STATES) {
  STATE_BY_KEY.set(stateKey(state.name), state);
  STATE_BY_CODE.set(state.code, state.name);
}

// A few names people still type on invoices from the old state boundaries.
for (const [alias, code] of [
  ['orissa', '21'],
  ['pondicherry', '34'],
  ['uttaranchal', '05'],
  ['jammu and kashmir', '01'],
  ['daman and diu', '26'],
  ['dadra and nagar haveli', '26'],
] as const) {
  const state = STATE_BY_CODE.get(code);
  if (state) STATE_BY_KEY.set(stateKey(alias), { code, name: state });
}

export function stateNameForGstin(gstin: string): string | undefined {
  return STATE_BY_CODE.get(gstin.trim().slice(0, 2));
}

export function stateCodeForName(name: string): string | undefined {
  return STATE_BY_KEY.get(stateKey(name))?.code;
}

function resolveStateName(value: string): string | undefined {
  return STATE_BY_KEY.get(stateKey(value))?.name;
}

export function isValidGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeAsOf(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00+05:30`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}+05:30`;
  return trimmed;
}

export function validateBusinessProfile(input: BusinessProfileInput): string[] {
  const errors: string[] = [];
  if (!input.name.trim()) errors.push('Enter the business or trade name.');
  if (!GSTIN_PATTERN.test(input.gstin.trim().toUpperCase())) {
    errors.push('The business GSTIN must be a valid 15-character GSTIN.');
  }
  if (!resolveStateName(input.state)) errors.push('Choose a recognised Indian state.');
  if (input.pincode.trim() && !/^\d{6}$/.test(input.pincode.trim())) {
    errors.push('The PIN code must be six digits.');
  }
  if (!input.asOf.trim() || Number.isNaN(Date.parse(normalizeAsOf(input.asOf)))) {
    errors.push('Enter a valid as-of date and time.');
  }
  if (!input.city.trim()) errors.push('Enter the city or town.');
  if (!input.address.trim()) errors.push('Enter the shop or office address.');
  return errors;
}

/* ------------------------------------------------------------------ */
/* CSV parsing                                                        */
/* ------------------------------------------------------------------ */

interface CsvRecord {
  line: number;
  values: Record<string, string>;
}

interface CsvTable {
  headers: string[];
  records: CsvRecord[];
  delimiter: string;
}

function detectDelimiter(text: string): string {
  const firstLine: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) break;
    if (!inQuotes) firstLine.push(char);
  }
  const line = firstLine.join('');
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : ',';
}

function tokeniseCsv(text: string, delimiter: string): Array<{ line: number; cells: string[] }> {
  const rows: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const pushCell = () => {
    cells.push(cell.replace(/\r\n/g, '\n'));
    cell = '';
  };

  const pushRow = () => {
    pushCell();
    if (cells.some((value) => value.trim() !== '')) {
      rows.push({ line: recordLine, cells });
    }
    cells = [];
    recordLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
        if (char === '\n') line += 1;
      }
      continue;
    }

    if (char === '"' && cell.trim() === '') {
      cell = '';
      inQuotes = true;
    } else if (char === delimiter) {
      pushCell();
    } else if (char === '\n') {
      pushRow();
      line += 1;
      recordLine = line;
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length > 0 || cells.length > 0) {
    pushRow();
  }

  return rows;
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^\uFEFF/, '');
  if (!clean.trim()) return { headers: [], records: [], delimiter: ',' };
  const delimiter = detectDelimiter(clean);
  const rows = tokeniseCsv(clean, delimiter);
  if (rows.length === 0) return { headers: [], records: [], delimiter };

  const headers = rows[0].cells.map(normalizeHeader);
  const records: CsvRecord[] = [];

  for (const row of rows.slice(1)) {
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      values[header] = (row.cells[index] ?? '').trim();
    });
    records.push({ line: row.line, values });
  }

  return { headers, records, delimiter };
}

type ColumnMap = Record<string, string[]>;

const VENDOR_COLUMNS: ColumnMap = {
  name: ['vendor_name', 'vendor', 'supplier_name', 'supplier', 'party_name', 'name'],
  category: ['category', 'vendor_category', 'supplier_category'],
  gstin: ['gstin', 'vendor_gstin', 'supplier_gstin', 'gst_no', 'gst_number', 'gstin_no'],
  address: ['address', 'address_line', 'address_line_1', 'street'],
  city: ['city', 'town'],
  state: ['state', 'state_name'],
  pincode: ['pincode', 'pin', 'pin_code', 'postal_code'],
  phone: ['phone', 'mobile', 'contact', 'phone_number'],
  email: ['email', 'email_id'],
  terms: ['terms_days', 'payment_terms', 'credit_days', 'terms'],
  bankName: ['bank_name', 'bank'],
  accountNumber: ['account_number', 'account_no', 'bank_account_number', 'bank_account'],
  accountMasked: ['account_masked', 'masked_account', 'account_last4'],
  ifsc: ['ifsc', 'ifsc_code', 'bank_ifsc'],
  upi: ['upi_id', 'upi', 'vpa'],
  bankStatus: ['bank_status', 'bank_verification', 'verification_status'],
};

const INVOICE_COLUMNS: ColumnMap = {
  vendorGstin: ['vendor_gstin', 'supplier_gstin', 'gstin', 'vendor_gst_no'],
  vendorName: ['vendor_name', 'vendor', 'supplier_name', 'supplier', 'party_name'],
  invoiceNumber: [
    'invoice_number',
    'invoice_no',
    'bill_number',
    'bill_no',
    'invoice',
    'document_number',
  ],
  issueDate: ['issue_date', 'invoice_date', 'bill_date', 'date'],
  receivedDate: ['received_date', 'receipt_date', 'received_on'],
  dueDate: ['due_date', 'due_on', 'payment_due_date'],
  terms: ['terms_days', 'credit_days', 'payment_terms_days'],
  poNumber: ['po_number', 'po_no', 'purchase_order', 'purchase_order_number'],
  grnNumber: ['grn_number', 'grn_no', 'goods_receipt_number', 'grn'],
  gstType: ['gst_type', 'tax_type', 'supply_type'],
  gstRate: ['gst_rate', 'gst_rate_percent', 'gst_percent', 'gst_percentage', 'tax_rate', 'gst'],
  placeOfSupply: ['place_of_supply', 'pos'],
  description: [
    'description',
    'item_description',
    'item',
    'particulars',
    'product',
    'goods_description',
  ],
  hsn: ['hsn', 'hsn_code', 'sac', 'sac_code'],
  qty: ['qty', 'quantity', 'units'],
  unit: ['unit', 'uom', 'unit_of_measure'],
  rate: ['rate', 'unit_rate', 'rate_per_unit', 'price', 'unit_price'],
  amountPaid: ['amount_paid', 'paid_amount', 'opening_paid', 'amount_already_paid', 'paid'],
  paidDate: ['paid_date', 'payment_date', 'opening_paid_date'],
  paymentMode: ['payment_mode', 'mode', 'paid_via'],
  paymentReference: ['payment_reference', 'payment_ref', 'utr', 'reference'],
  statedTotal: ['stated_total', 'invoice_total', 'printed_total', 'bill_total', 'total'],
  duplicateOf: ['duplicate_of', 'duplicate_of_invoice', 'original_invoice_number'],
  notes: ['notes', 'remarks', 'comment', 'narration'],
};

function hasAny(table: CsvTable, aliases: string[]): boolean {
  return aliases.some((alias) => table.headers.includes(alias));
}

function field(record: CsvRecord, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record.values[alias];
    if (value && value.trim()) return value.trim();
  }
  return '';
}

function missingColumns(table: CsvTable, columns: ColumnMap, keys: string[]): string[] {
  return keys
    .filter((key) => !hasAny(table, columns[key]))
    .map((key) => columns[key][0]);
}

function issue(
  scope: ImportIssue['scope'],
  row: number,
  severity: ImportIssue['severity'],
  message: string,
  fieldName?: string,
): ImportIssue {
  return { scope, row, severity, message, field: fieldName };
}

/* ------------------------------------------------------------------ */
/* Value parsers                                                      */
/* ------------------------------------------------------------------ */

export function parseMoneyValue(value: string): number | null {
  let clean = value
    .trim()
    .replace(/^(rs\.?|inr|₹)\s*/i, '')
    .replace(/[,\s]/g, '');
  if (!clean) return null;
  const negative = clean.startsWith('(') && clean.endsWith(')');
  if (negative) clean = `-${clean.slice(1, -1)}`;
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

export function parseQuantity(value: string): number | null {
  const clean = value.trim().replace(/,/g, '');
  if (!clean) return null;
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}

export function parseDateValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  let year: number;
  let month: number;
  let day: number;

  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
    if (match) {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
    } else {
      match = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/.exec(trimmed);
      if (!match) return null;
      day = Number(match[1]);
      const monthNames = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ];
      month = monthNames.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
      year = Number(match[3]);
      if (month === 0) return null;
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(
    next.getUTCDate(),
  ).padStart(2, '0')}`;
}

function parseDays(value: string): number | null {
  const match = /-?\d+/.exec(value.replace(/,/g, ''));
  if (!match) return null;
  const days = Number(match[0]);
  if (!Number.isInteger(days) || days < 0 || days > 365) return null;
  return days;
}

function parseRate(value: string): number | null {
  const clean = value.trim().replace(/%/g, '').replace(/\s/g, '');
  if (!clean) return null;
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const rate = Number(clean);
  if (rate < 0 || rate > 28) return null;
  return Math.round(rate * 100) / 100;
}

function parseGstType(value: string): GstType | null {
  const clean = value.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return null;
  if (['intra', 'intrastate', 'cgstsgst', 'withinstate', 'local'].includes(clean)) return 'intra';
  if (['inter', 'interstate', 'igst', 'outsidestate', 'outside'].includes(clean)) return 'inter';
  return null;
}

function parsePaymentMode(value: string): PaymentMode | null {
  switch (value.trim().toLowerCase()) {
    case 'neft':
      return 'NEFT';
    case 'upi':
      return 'UPI';
    case 'rtgs':
      return 'RTGS';
    case 'cheque':
    case 'check':
      return 'Cheque';
    case 'cash':
      return 'Cash';
    default:
      return null;
  }
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'record'
  );
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function moneyLabel(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/* ------------------------------------------------------------------ */
/* Vendors                                                            */
/* ------------------------------------------------------------------ */

export interface VendorParseResult {
  vendors: Vendor[];
  issues: ImportIssue[];
}

export function parseVendorsCsv(text: string, importedAt: string): VendorParseResult {
  const issues: ImportIssue[] = [];
  if (!text.trim()) {
    issues.push(issue('vendors', 1, 'error', 'The vendors CSV is empty.'));
    return { vendors: [], issues };
  }

  const table = parseCsv(text);
  if (table.records.length === 0) {
    issues.push(issue('vendors', 1, 'error', 'The vendors CSV has a header but no data rows.'));
    return { vendors: [], issues };
  }

  const missing = missingColumns(table, VENDOR_COLUMNS, ['name', 'gstin', 'bankName', 'ifsc']);
  if (!hasAny(table, VENDOR_COLUMNS.accountNumber) && !hasAny(table, VENDOR_COLUMNS.accountMasked)) {
    missing.push(VENDOR_COLUMNS.accountNumber[0]);
  }
  if (missing.length > 0) {
    issues.push(
      issue(
        'vendors',
        1,
        'error',
        `Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Download the template to see the expected header row.`,
      ),
    );
    return { vendors: [], issues };
  }

  const vendors: Vendor[] = [];
  const seenGstin = new Set<string>();
  const seenName = new Set<string>();

  for (const record of table.records) {
    const row = record.line;
    const rowErrorsBefore = issues.filter((item) => item.row === row && item.severity === 'error').length;

    const name = field(record, VENDOR_COLUMNS.name);
    if (!name) issues.push(issue('vendors', row, 'error', 'Vendor name is required.', 'vendor_name'));

    const gstin = field(record, VENDOR_COLUMNS.gstin).toUpperCase().replace(/\s+/g, '');
    if (!gstin) {
      issues.push(issue('vendors', row, 'error', 'GSTIN is required.', 'gstin'));
    } else if (!GSTIN_PATTERN.test(gstin)) {
      issues.push(
        issue('vendors', row, 'error', `GSTIN "${gstin}" is not a valid 15-character GSTIN.`, 'gstin'),
      );
    } else if (seenGstin.has(gstin)) {
      issues.push(
        issue('vendors', row, 'error', `GSTIN ${gstin} appears more than once in this file.`, 'gstin'),
      );
    }

    if (name && seenName.has(name.toLowerCase())) {
      issues.push(
        issue('vendors', row, 'error', `Vendor "${name}" appears more than once in this file.`, 'vendor_name'),
      );
    }

    const stateInput = field(record, VENDOR_COLUMNS.state);
    const stateFromGstin = stateNameForGstin(gstin);
    let state = stateInput ? resolveStateName(stateInput) : stateFromGstin;
    if (stateInput && !state) {
      issues.push(
        issue(
          'vendors',
          row,
          'warning',
          `State "${stateInput}" is not recognised. Using ${stateFromGstin ?? 'the state in the GSTIN'}.`,
          'state',
        ),
      );
      state = stateFromGstin ?? stateInput;
    }
    if (!state) {
      state = 'Maharashtra';
      issues.push(
        issue(
          'vendors',
          row,
          'warning',
          'State could not be derived from the GSTIN. Maharashtra was used; check the vendor master after import.',
          'state',
        ),
      );
    }

    if (stateInput && stateFromGstin && resolveStateName(stateInput) && stateFromGstin !== resolveStateName(stateInput)) {
      issues.push(
        issue(
          'vendors',
          row,
          'warning',
          `The address state (${stateInput}) differs from the GSTIN state (${stateFromGstin}). The GSTIN state will decide intra-state vs inter-state GST.`,
          'state',
        ),
      );
    }

    const city = field(record, VENDOR_COLUMNS.city) || 'City not recorded';
    const address = field(record, VENDOR_COLUMNS.address) || 'Address not recorded';
    const pincode = field(record, VENDOR_COLUMNS.pincode);
    if (pincode && !/^\d{6}$/.test(pincode)) {
      issues.push(issue('vendors', row, 'warning', 'PIN code should be six digits.', 'pincode'));
    }

    const termsRaw = field(record, VENDOR_COLUMNS.terms);
    let termsDays = 30;
    if (termsRaw) {
      const parsed = parseDays(termsRaw);
      if (parsed == null) {
        issues.push(
          issue('vendors', row, 'warning', 'Payment terms were not understood. Net 30 was used.', 'terms_days'),
        );
      } else {
        termsDays = parsed;
      }
    }

    const bankName = field(record, VENDOR_COLUMNS.bankName);
    if (!bankName) {
      issues.push(issue('vendors', row, 'error', 'Bank name is required.', 'bank_name'));
    }

    const accountRaw = field(record, VENDOR_COLUMNS.accountNumber);
    const maskedRaw = field(record, VENDOR_COLUMNS.accountMasked);
    let accountMasked = '';
    if (accountRaw) {
      const digits = accountRaw.replace(/[^0-9]/g, '');
      if (digits.length < 6 || digits.length > 18) {
        issues.push(
          issue(
            'vendors',
            row,
            'error',
            'Account number should contain 6 to 18 digits. The full number is never stored; only the last four digits are kept.',
            'account_number',
          ),
        );
      } else {
        accountMasked = `****${digits.slice(-4)}`;
      }
    } else if (maskedRaw) {
      const digits = maskedRaw.replace(/[^0-9]/g, '');
      if (maskedRaw.includes('*') && digits.length >= 4) {
        accountMasked = maskedRaw;
      } else if (digits.length >= 4) {
        accountMasked = `****${digits.slice(-4)}`;
      } else {
        issues.push(
          issue('vendors', row, 'error', 'Enter at least the last four digits of the account.', 'account_masked'),
        );
      }
    } else {
      issues.push(
        issue('vendors', row, 'error', 'Bank account number is required.', 'account_number'),
      );
    }

    const ifsc = field(record, VENDOR_COLUMNS.ifsc).toUpperCase().replace(/\s+/g, '');
    if (!ifsc) {
      issues.push(issue('vendors', row, 'error', 'IFSC is required.', 'ifsc'));
    } else if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      issues.push(
        issue('vendors', row, 'error', `IFSC "${ifsc}" does not look valid.`, 'ifsc'),
      );
    }

    const upiId = field(record, VENDOR_COLUMNS.upi);
    if (upiId && !upiId.includes('@')) {
      issues.push(issue('vendors', row, 'warning', 'UPI ID should contain @.', 'upi_id'));
    }

    const email = field(record, VENDOR_COLUMNS.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push(issue('vendors', row, 'warning', 'Email address does not look valid.', 'email'));
    }

    const statusRaw = field(record, VENDOR_COLUMNS.bankStatus).toLowerCase();
    let bankChanged = false;
    if (statusRaw) {
      if (['verify', 'changed', 'pending', 'unverified', 'no'].includes(statusRaw)) {
        bankChanged = true;
      } else if (!['active', 'verified', 'ok', 'yes'].includes(statusRaw)) {
        issues.push(
          issue(
            'vendors',
            row,
            'warning',
            `Bank status "${statusRaw}" was not understood. The account is treated as verified.`,
            'bank_status',
          ),
        );
      }
    }

    const rowErrorsAfter = issues.filter((item) => item.row === row && item.severity === 'error').length;
    if (rowErrorsAfter === rowErrorsBefore) {
      const id = `v-imp-${gstin.toLowerCase()}`;
      vendors.push({
        id,
        name,
        category: field(record, VENDOR_COLUMNS.category) || 'Imported supplier',
        gstin,
        address,
        city,
        state,
        pincode,
        phone: field(record, VENDOR_COLUMNS.phone),
        email,
        termsDays,
        termsLabel: `Net ${termsDays}`,
        bank: {
          bankName,
          accountMasked,
          ifsc,
          upiId: upiId || undefined,
          status: bankChanged ? 'changed' : 'verified',
          changedAt: bankChanged ? importedAt : undefined,
          previousAccountMasked: bankChanged ? 'not recorded' : undefined,
        },
        status: bankChanged ? 'verify' : 'active',
      });
      seenGstin.add(gstin);
      seenName.add(name.toLowerCase());
    }
  }

  return { vendors, issues };
}

/* ------------------------------------------------------------------ */
/* Invoices                                                           */
/* ------------------------------------------------------------------ */

interface PendingLine {
  row: number;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  ratePaise: number;
  totalPaise: number;
}

interface InvoiceGroup {
  key: string;
  firstRow: number;
  vendor: Vendor;
  invoiceNumber: string;
  duplicateOfNumber: string;
  header: Record<string, string>;
  headerRows: Record<string, number>;
  lines: PendingLine[];
  lineSignatures: Set<string>;
  errorCount: number;
}

export interface InvoiceParseResult {
  invoices: Invoice[];
  payments: Payment[];
  issues: ImportIssue[];
  lineCount: number;
  duplicateInvoiceCount: number;
}

const HEADER_FIELDS = [
  'issue_date',
  'received_date',
  'due_date',
  'terms_days',
  'po_number',
  'grn_number',
  'gst_type',
  'gst_rate',
  'place_of_supply',
  'notes',
  'amount_paid',
  'paid_date',
  'payment_mode',
  'payment_reference',
  'stated_total',
] as const;

function comparableHeaderValue(fieldName: string, value: string): string {
  if (fieldName === 'issue_date' || fieldName === 'received_date' || fieldName === 'due_date' || fieldName === 'paid_date') {
    return parseDateValue(value) ?? value.trim().toLowerCase();
  }
  if (fieldName === 'amount_paid' || fieldName === 'stated_total') {
    const parsed = parseMoneyValue(value);
    return parsed == null ? value.trim().toLowerCase() : parsed.toFixed(2);
  }
  if (fieldName === 'terms_days') {
    const parsed = parseDays(value);
    return parsed == null ? value.trim().toLowerCase() : String(parsed);
  }
  if (fieldName === 'gst_rate') {
    const parsed = parseRate(value);
    return parsed == null ? value.trim().toLowerCase() : String(parsed);
  }
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function deriveGstType(vendor: Vendor, business: Business): GstType {
  const vendorCode = vendor.gstin.slice(0, 2);
  const businessCode = business.gstin.slice(0, 2);
  if (STATE_BY_CODE.has(vendorCode) && STATE_BY_CODE.has(businessCode)) {
    return vendorCode === businessCode ? 'intra' : 'inter';
  }
  return vendor.state.toLowerCase() === business.state.toLowerCase() ? 'intra' : 'inter';
}

export function parseInvoicesCsv(
  text: string,
  vendors: Vendor[],
  business: Business,
  importedAt: string,
): InvoiceParseResult {
  const issues: ImportIssue[] = [];
  const empty = {
    invoices: [] as Invoice[],
    payments: [] as Payment[],
    issues,
    lineCount: 0,
    duplicateInvoiceCount: 0,
  };

  if (!text.trim()) {
    issues.push(issue('invoices', 1, 'error', 'The invoices CSV is empty.'));
    return empty;
  }

  const table = parseCsv(text);
  if (table.records.length === 0) {
    return empty;
  }

  const missing = missingColumns(table, INVOICE_COLUMNS, [
    'invoiceNumber',
    'issueDate',
    'description',
    'rate',
  ]);
  if (!hasAny(table, INVOICE_COLUMNS.vendorGstin) && !hasAny(table, INVOICE_COLUMNS.vendorName)) {
    missing.push('vendor_gstin (or vendor_name)');
  }
  if (missing.length > 0) {
    issues.push(
      issue(
        'invoices',
        1,
        'error',
        `Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Download the template to see the expected header row.`,
      ),
    );
    return empty;
  }

  const vendorsByGstin = new Map<string, Vendor>();
  const vendorsByName = new Map<string, Vendor>();
  for (const vendor of vendors) {
    vendorsByGstin.set(vendor.gstin.toUpperCase(), vendor);
    vendorsByName.set(vendor.name.toLowerCase(), vendor);
  }

  const groups = new Map<string, InvoiceGroup>();

  const ensureGroup = (
    record: CsvRecord,
    vendor: Vendor,
    invoiceNumber: string,
    duplicateOfNumber: string,
  ): InvoiceGroup => {
    const key = `${vendor.id}|${invoiceNumber.toLowerCase()}|${duplicateOfNumber.toLowerCase()}`;
    const existing = groups.get(key);
    if (existing) return existing;
    const group: InvoiceGroup = {
      key,
      firstRow: record.line,
      vendor,
      invoiceNumber,
      duplicateOfNumber,
      header: {},
      headerRows: {},
      lines: [],
      lineSignatures: new Set(),
      errorCount: 0,
    };
    groups.set(key, group);
    return group;
  };

  for (const record of table.records) {
    const row = record.line;
    const vendorGstin = field(record, INVOICE_COLUMNS.vendorGstin).toUpperCase().replace(/\s+/g, '');
    const vendorName = field(record, INVOICE_COLUMNS.vendorName);

    let vendor: Vendor | undefined;
    let matchedByName = false;
    if (vendorGstin) vendor = vendorsByGstin.get(vendorGstin);
    if (!vendor && vendorName) {
      vendor = vendorsByName.get(vendorName.toLowerCase());
      matchedByName = Boolean(vendor);
    }

    if (!vendor) {
      issues.push(
        issue(
          'invoices',
          row,
          'error',
          vendorGstin
            ? `No vendor with GSTIN ${vendorGstin} exists in the vendors CSV.`
            : vendorName
              ? `No vendor named "${vendorName}" exists in the vendors CSV.`
              : 'Add vendor_gstin or vendor_name so the invoice can be matched to a vendor.',
        ),
      );
      continue;
    }

    if (matchedByName && vendorGstin) {
      issues.push(
        issue(
          'invoices',
          row,
          'warning',
          `Vendor name "${vendorName}" matched ${vendor.name}, but GSTIN ${vendorGstin} is not in the vendor master (${vendor.gstin}). Check the GSTIN printed on the invoice.`,
          'vendor_gstin',
        ),
      );
    }

    if (vendorGstin && vendorName && vendor.name.toLowerCase() !== vendorName.toLowerCase()) {
      issues.push(
        issue(
          'invoices',
          row,
          'warning',
          `Vendor name "${vendorName}" does not match the GSTIN master (${vendor.name}); the GSTIN match was used.`,
          'vendor_name',
        ),
      );
    }

    const invoiceNumber = field(record, INVOICE_COLUMNS.invoiceNumber);
    if (!invoiceNumber) {
      issues.push(issue('invoices', row, 'error', 'Invoice number is required.', 'invoice_number'));
      continue;
    }

    const duplicateOfNumber = field(record, INVOICE_COLUMNS.duplicateOf);
    const group = ensureGroup(record, vendor, invoiceNumber, duplicateOfNumber);

    for (const headerField of HEADER_FIELDS) {
      const aliases =
        headerField === 'issue_date'
          ? INVOICE_COLUMNS.issueDate
          : headerField === 'received_date'
            ? INVOICE_COLUMNS.receivedDate
            : headerField === 'due_date'
              ? INVOICE_COLUMNS.dueDate
              : headerField === 'terms_days'
                ? INVOICE_COLUMNS.terms
                : headerField === 'po_number'
                  ? INVOICE_COLUMNS.poNumber
                  : headerField === 'grn_number'
                    ? INVOICE_COLUMNS.grnNumber
                    : headerField === 'gst_type'
                      ? INVOICE_COLUMNS.gstType
                      : headerField === 'gst_rate'
                        ? INVOICE_COLUMNS.gstRate
                        : headerField === 'place_of_supply'
                          ? INVOICE_COLUMNS.placeOfSupply
                          : headerField === 'notes'
                            ? INVOICE_COLUMNS.notes
                            : headerField === 'amount_paid'
                              ? INVOICE_COLUMNS.amountPaid
                              : headerField === 'paid_date'
                                ? INVOICE_COLUMNS.paidDate
                                : headerField === 'payment_mode'
                                  ? INVOICE_COLUMNS.paymentMode
                                  : headerField === 'payment_reference'
                                    ? INVOICE_COLUMNS.paymentReference
                                    : INVOICE_COLUMNS.statedTotal;
      const value = field(record, aliases);
      if (!value) continue;
      const existing = group.header[headerField];
      if (existing == null) {
        group.header[headerField] = value;
        group.headerRows[headerField] = row;
      } else if (comparableHeaderValue(headerField, existing) !== comparableHeaderValue(headerField, value)) {
        issues.push(
          issue(
            'invoices',
            row,
            'warning',
            `${headerField.replace(/_/g, ' ')} differs from row ${group.headerRows[headerField]}. Using the first value.`,
            headerField,
          ),
        );
      }
    }

    const description = field(record, INVOICE_COLUMNS.description);
    const qtyRaw = field(record, INVOICE_COLUMNS.qty);
    const rateRaw = field(record, INVOICE_COLUMNS.rate);

    let lineError = false;
    if (!description) {
      issues.push(
        issue('invoices', row, 'error', 'Item description is required.', 'description'),
      );
      lineError = true;
    }

    let qty = 1;
    if (qtyRaw) {
      const parsedQty = parseQuantity(qtyRaw);
      if (parsedQty == null || parsedQty <= 0) {
        issues.push(
          issue('invoices', row, 'error', 'Quantity must be a number greater than zero.', 'qty'),
        );
        lineError = true;
      } else {
        qty = parsedQty;
      }
    }

    let ratePaise = 0;
    if (!rateRaw) {
      issues.push(issue('invoices', row, 'error', 'Unit rate is required.', 'rate'));
      lineError = true;
    } else {
      const parsedRate = parseMoneyValue(rateRaw);
      if (parsedRate == null || parsedRate < 0) {
        issues.push(
          issue('invoices', row, 'error', 'Unit rate must be a number that is zero or more.', 'rate'),
        );
        lineError = true;
      } else {
        ratePaise = toPaise(parsedRate);
      }
    }

    if (lineError) {
      group.errorCount += 1;
      continue;
    }

    const hsn = field(record, INVOICE_COLUMNS.hsn) || '—';
    const unit = field(record, INVOICE_COLUMNS.unit) || 'pc';
    const signature = `${description.toLowerCase()}|${hsn.toLowerCase()}|${qty}|${ratePaise}`;
    if (group.lineSignatures.has(signature)) {
      issues.push(
        issue(
          'invoices',
          row,
          'warning',
          `Row ${row} repeats a line already listed on ${invoiceNumber}; the duplicate line was skipped.`,
        ),
      );
      continue;
    }
    group.lineSignatures.add(signature);
    group.lines.push({
      row,
      description,
      hsn,
      qty,
      unit,
      ratePaise,
      totalPaise: Math.round(qty * ratePaise),
    });
  }

  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const issuesOut = issues;
  const usedInvoiceIds = new Set<string>();
  const builtByVendorNumber = new Map<string, Invoice>();
  let lineCount = 0;
  let duplicateInvoiceCount = 0;

  const buildGroup = (group: InvoiceGroup, original?: Invoice): void => {
    const row = group.firstRow;
    if (group.errorCount > 0) return;
    if (group.lines.length === 0) {
      issues.push(
        issue('invoices', row, 'error', `Invoice ${group.invoiceNumber} has no valid line items.`),
      );
      return;
    }

    const issueDateRaw = group.header.issue_date ?? '';
    const issueDate = parseDateValue(issueDateRaw);
    if (!issueDate) {
      issues.push(
        issue(
          'invoices',
          group.headerRows.issue_date ?? row,
          'error',
          'Invoice date is required and must be a valid date.',
          'issue_date',
        ),
      );
      return;
    }

    const termsRaw = group.header.terms_days;
    let termsDays = group.vendor.termsDays;
    if (termsRaw) {
      const parsed = parseDays(termsRaw);
      if (parsed == null) {
        issues.push(
          issue('invoices', row, 'warning', 'Payment terms were not understood. The vendor default was used.', 'terms_days'),
        );
      } else {
        termsDays = parsed;
      }
    }

    const receivedRaw = group.header.received_date;
    let receivedDate = issueDate;
    if (receivedRaw) {
      const parsed = parseDateValue(receivedRaw);
      if (!parsed) {
        issues.push(
          issue('invoices', row, 'warning', 'Received date was not understood. The invoice date was used.', 'received_date'),
        );
      } else {
        receivedDate = parsed;
      }
    }
    if (receivedDate < issueDate) {
      issues.push(
        issue('invoices', row, 'warning', 'Received date is before the invoice date.', 'received_date'),
      );
    }

    const dueRaw = group.header.due_date;
    let dueDate = addDays(issueDate, termsDays);
    if (dueRaw) {
      const parsed = parseDateValue(dueRaw);
      if (!parsed) {
        issues.push(
          issue('invoices', row, 'warning', 'Due date was not understood. Terms were used instead.', 'due_date'),
        );
      } else {
        dueDate = parsed;
      }
    }
    if (dueDate < issueDate) {
      issues.push(
        issue('invoices', row, 'warning', 'Due date is before the invoice date. Check the source document.', 'due_date'),
      );
    }

    let gstType: GstType;
    if (group.header.gst_type) {
      const parsed = parseGstType(group.header.gst_type);
      if (!parsed) {
        issues.push(
          issue(
            'invoices',
            group.headerRows.gst_type ?? row,
            'error',
            'GST type must be intra (CGST + SGST) or inter (IGST).',
            'gst_type',
          ),
        );
        return;
      }
      gstType = parsed;
      if (parsed !== deriveGstType(group.vendor, business)) {
        issues.push(
          issue(
            'invoices',
            group.headerRows.gst_type ?? row,
            'warning',
            `GST type was set to ${parsed} although the GSTIN states suggest ${deriveGstType(group.vendor, business)}. Check the tax split.`,
            'gst_type',
          ),
        );
      }
    } else {
      gstType = deriveGstType(group.vendor, business);
    }

    let gstRate = 18;
    if (group.header.gst_rate) {
      const parsed = parseRate(group.header.gst_rate);
      if (parsed == null) {
        issues.push(
          issue(
            'invoices',
            group.headerRows.gst_rate ?? row,
            'error',
            'GST rate must be a number between 0 and 28.',
            'gst_rate',
          ),
        );
        return;
      }
      gstRate = parsed;
    }
    if (![0, 5, 12, 18, 28].includes(gstRate)) {
      issues.push(
        issue(
          'invoices',
          row,
          'warning',
          `GST rate ${gstRate}% is outside the common 0/5/12/18/28 slabs. It was used as entered.`,
          'gst_rate',
        ),
      );
    }

    const taxablePaise = sumPaise(group.lines.map((line) => line.totalPaise));
    const gst = computeGst(taxablePaise, gstType, gstRate);

    let statedTotalPaise = gst.totalPaise;
    if (group.header.stated_total) {
      const parsed = parseMoneyValue(group.header.stated_total);
      if (parsed == null || parsed < 0) {
        issues.push(
          issue(
            'invoices',
            group.headerRows.stated_total ?? row,
            'warning',
            'Printed invoice total was not understood. The calculated total was used.',
            'stated_total',
          ),
        );
      } else {
        statedTotalPaise = toPaise(parsed);
        if (statedTotalPaise !== gst.totalPaise) {
          issues.push(
            issue(
              'invoices',
              group.headerRows.stated_total ?? row,
              'warning',
              `Printed total ${moneyLabel(statedTotalPaise)} differs from the calculated total ${moneyLabel(gst.totalPaise)} by ${moneyLabel(statedTotalPaise - gst.totalPaise)}. The invoice will be flagged for review.`,
              'stated_total',
            ),
          );
        }
      }
    }

    let amountPaidPaise = 0;
    if (group.header.amount_paid) {
      const parsed = parseMoneyValue(group.header.amount_paid);
      if (parsed == null || parsed < 0) {
        issues.push(
          issue(
            'invoices',
            group.headerRows.amount_paid ?? row,
            'error',
            'Opening paid amount must be a number that is zero or more.',
            'amount_paid',
          ),
        );
        return;
      }
      amountPaidPaise = toPaise(parsed);
      if (amountPaidPaise > gst.totalPaise) {
        issues.push(
          issue(
            'invoices',
            group.headerRows.amount_paid ?? row,
            'error',
            `Opening paid amount ${moneyLabel(amountPaidPaise)} is more than the invoice total ${moneyLabel(gst.totalPaise)}.`,
            'amount_paid',
          ),
        );
        return;
      }
    }

    if (group.duplicateOfNumber && amountPaidPaise > 0) {
      issues.push(
        issue(
          'invoices',
          group.headerRows.amount_paid ?? row,
          'error',
          'A duplicate copy cannot carry an opening paid amount. Remove amount_paid from the duplicate row.',
          'amount_paid',
        ),
      );
      return;
    }

    const invoiceId = uniqueId(
      `inv-imp-${slug(group.vendor.name)}-${slug(group.invoiceNumber)}`,
      usedInvoiceIds,
    );
    const lines: InvoiceLine[] = group.lines.map((line, index) => ({
      id: `${invoiceId}-l${index + 1}`,
      description: line.description,
      hsn: line.hsn,
      qty: line.qty,
      unit: line.unit,
      ratePaise: line.ratePaise,
      totalPaise: line.totalPaise,
    }));

    const invoice: Invoice = {
      id: invoiceId,
      invoiceNumber: group.invoiceNumber,
      vendorId: group.vendor.id,
      issueDate,
      receivedDate,
      dueDate,
      termsDays,
      poNumber: group.header.po_number || undefined,
      grnNumber: group.header.grn_number || undefined,
      placeOfSupply:
        group.header.place_of_supply || `${business.state} (${business.gstin.slice(0, 2)})`,
      gstType,
      gstRate,
      lines,
      taxablePaise,
      cgstPaise: gst.cgstPaise,
      sgstPaise: gst.sgstPaise,
      igstPaise: gst.igstPaise,
      roundOffPaise: gst.roundOffPaise,
      totalPaise: gst.totalPaise,
      statedTotalPaise,
      version: 1,
      source: 'upload',
      duplicateOf: original?.id,
      notes: group.header.notes || undefined,
      importedAt,
    };

    invoices.push(invoice);
    lineCount += lines.length;
    if (original) duplicateInvoiceCount += 1;
    else builtByVendorNumber.set(`${group.vendor.id}|${group.invoiceNumber.toLowerCase()}`, invoice);

    if (amountPaidPaise > 0) {
      let paidDate = receivedDate;
      if (group.header.paid_date) {
        const parsed = parseDateValue(group.header.paid_date);
        if (!parsed) {
          issues.push(
            issue(
              'invoices',
              group.headerRows.paid_date ?? row,
              'warning',
              'Paid date was not understood. The received date was used.',
              'paid_date',
            ),
          );
        } else {
          paidDate = parsed;
        }
      }
      if (paidDate < issueDate) {
        issues.push(
          issue('invoices', row, 'warning', 'Paid date is before the invoice date.', 'paid_date'),
        );
      }
      if (paidDate > business.asOf.slice(0, 10)) {
        issues.push(
          issue(
            'invoices',
            row,
            'warning',
            `Paid date is after the workspace as-of date (${business.asOf.slice(0, 10)}).`,
            'paid_date',
          ),
        );
      }

      let mode: PaymentMode = 'NEFT';
      if (group.header.payment_mode) {
        const parsed = parsePaymentMode(group.header.payment_mode);
        if (!parsed) {
          issues.push(
            issue(
              'invoices',
              row,
              'warning',
              `Payment mode "${group.header.payment_mode}" was not understood. NEFT was used.`,
              'payment_mode',
            ),
          );
        } else {
          mode = parsed;
        }
      }

      const at = `${paidDate}T09:30:00+05:30`;
      payments.push({
        id: `pay-imp-${invoice.id}`,
        invoiceId: invoice.id,
        amountPaise: amountPaidPaise,
        mode,
        reference:
          group.header.payment_reference || `OPENING-${group.invoiceNumber}`.slice(0, 60),
        requestedDate: paidDate,
        recordedBy: 'Opening balance import',
        recordedAt: at,
        status: 'simulated',
        approvedBy: 'Opening balance import',
        approvedAt: at,
        approvalFingerprint: undefined,
        executedAt: at,
        mockTxnId: `MOCK-OPENING-${String(payments.length + 1).padStart(3, '0')}`,
        attempt: 1,
        note: 'Imported opening paid amount. No bank transfer was executed by LedgerPilot.',
      });
    }
  };

  for (const group of groups.values()) {
    if (!group.duplicateOfNumber) buildGroup(group);
  }

  for (const group of groups.values()) {
    if (!group.duplicateOfNumber) continue;
    const original = builtByVendorNumber.get(
      `${group.vendor.id}|${group.duplicateOfNumber.toLowerCase()}`,
    );
    if (!original) {
      issues.push(
        issue(
          'invoices',
          group.firstRow,
          'error',
          `Original invoice ${group.duplicateOfNumber} was not found in this import. Add the original rows or remove the duplicate_of value.`,
          'duplicate_of',
        ),
      );
      continue;
    }
    buildGroup(group, original);
  }

  return {
    invoices,
    payments,
    issues,
    lineCount,
    duplicateInvoiceCount,
  };
}

/* ------------------------------------------------------------------ */
/* Preview                                                            */
/* ------------------------------------------------------------------ */

export function previewImport(input: {
  business: Business;
  vendorsCsv: string;
  invoicesCsv: string;
  importedAt?: string;
}): ImportPreview {
  const importedAt = input.importedAt ?? new Date().toISOString();
  const vendorResult = parseVendorsCsv(input.vendorsCsv, importedAt);
  const invoiceResult = parseInvoicesCsv(
    input.invoicesCsv,
    vendorResult.vendors,
    input.business,
    importedAt,
  );

  const issues = [...vendorResult.issues, ...invoiceResult.issues].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    if (a.scope !== b.scope) return a.scope === 'vendors' ? -1 : 1;
    return a.row - b.row;
  });

  const billableInvoices = invoiceResult.invoices.filter((invoice) => !invoice.duplicateOf);
  const invoiceValuePaise = sumPaise(billableInvoices.map((invoice) => invoice.totalPaise));
  const openingPaidPaise = sumPaise(invoiceResult.payments.map((payment) => payment.amountPaise));

  return {
    vendors: vendorResult.vendors,
    invoices: invoiceResult.invoices,
    payments: invoiceResult.payments,
    issues,
    errorCount: issues.filter((item) => item.severity === 'error').length,
    warningCount: issues.filter((item) => item.severity === 'warning').length,
    vendorCount: vendorResult.vendors.length,
    invoiceCount: invoiceResult.invoices.length,
    lineCount: invoiceResult.lineCount,
    openingPaymentCount: invoiceResult.payments.length,
    invoiceValuePaise,
    openingPaidPaise,
    balancePaise: invoiceValuePaise - openingPaidPaise,
    duplicateInvoiceCount: invoiceResult.duplicateInvoiceCount,
  };
}

/* ------------------------------------------------------------------ */
/* CSV export                                                         */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: Array<string | number>): string {
  return values.map(csvCell).join(',');
}

const VENDOR_EXPORT_HEADERS = [
  'vendor_name',
  'category',
  'gstin',
  'address',
  'city',
  'state',
  'pincode',
  'phone',
  'email',
  'terms_days',
  'bank_name',
  'account_masked',
  'ifsc',
  'upi_id',
  'bank_status',
];

export function vendorsToCsv(vendors: Vendor[]): string {
  const rows = [csvRow(VENDOR_EXPORT_HEADERS)];
  for (const vendor of vendors) {
    rows.push(
      csvRow([
        vendor.name,
        vendor.category,
        vendor.gstin,
        vendor.address,
        vendor.city,
        vendor.state,
        vendor.pincode,
        vendor.phone,
        vendor.email,
        vendor.termsDays,
        vendor.bank.bankName,
        vendor.bank.accountMasked,
        vendor.bank.ifsc,
        vendor.bank.upiId ?? '',
        vendor.bank.status === 'changed' ? 'verify' : 'active',
      ]),
    );
  }
  return `${rows.join('\r\n')}\r\n`;
}

const INVOICE_EXPORT_HEADERS = [
  'vendor_gstin',
  'vendor_name',
  'invoice_number',
  'issue_date',
  'received_date',
  'due_date',
  'terms_days',
  'po_number',
  'grn_number',
  'gst_type',
  'gst_rate',
  'place_of_supply',
  'description',
  'hsn',
  'qty',
  'unit',
  'rate',
  'amount_paid',
  'paid_date',
  'payment_mode',
  'payment_reference',
  'stated_total',
  'duplicate_of',
  'notes',
];

export function invoicesToCsv(state: DemoState): string {
  const rows = [csvRow(INVOICE_EXPORT_HEADERS)];
  const vendorsById = new Map(state.vendors.map((vendor) => [vendor.id, vendor]));
  const invoicesById = new Map(state.invoices.map((invoice) => [invoice.id, invoice]));

  for (const invoice of state.invoices) {
    const vendor = vendorsById.get(invoice.vendorId);
    const simulated = state.payments
      .filter((payment) => payment.invoiceId === invoice.id && payment.status === 'simulated')
      .slice()
      .sort((a, b) => (a.executedAt ?? '').localeCompare(b.executedAt ?? ''));
    const paidPaise = sumPaise(simulated.map((payment) => payment.amountPaise));
    const latest = simulated.at(-1);
    const duplicateOf = invoice.duplicateOf
      ? invoicesById.get(invoice.duplicateOf)?.invoiceNumber ?? ''
      : '';
    const lines = invoice.lines.length > 0 ? invoice.lines : [null];

    for (const line of lines) {
      rows.push(
        csvRow([
          vendor?.gstin ?? '',
          vendor?.name ?? 'Unknown vendor',
          invoice.invoiceNumber,
          invoice.issueDate,
          invoice.receivedDate,
          invoice.dueDate,
          invoice.termsDays,
          invoice.poNumber ?? '',
          invoice.grnNumber ?? '',
          invoice.gstType,
          invoice.gstRate ?? 18,
          invoice.placeOfSupply,
          line?.description ?? '',
          line?.hsn ?? '',
          line?.qty ?? '',
          line?.unit ?? '',
          line ? (line.ratePaise / 100).toFixed(2) : '',
          paidPaise > 0 ? (paidPaise / 100).toFixed(2) : '',
          latest?.executedAt?.slice(0, 10) ?? '',
          latest?.mode ?? '',
          latest?.reference ?? '',
          (invoice.statedTotalPaise / 100).toFixed(2),
          duplicateOf,
          invoice.notes ?? '',
        ]),
      );
    }
  }

  return `${rows.join('\r\n')}\r\n`;
}

export function serializeBackup(state: DemoState): string {
  return JSON.stringify(
    {
      app: 'LedgerPilot',
      kind: 'workspace-backup',
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      state,
    },
    null,
    2,
  );
}

export function parseBackup(raw: string): DemoState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The backup file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('The backup file is empty.');

  const payload = parsed as { state?: unknown };
  const candidate = (payload.state ?? parsed) as Partial<DemoState>;
  if (candidate.schemaVersion !== 1) {
    throw new Error('This backup was made by an unsupported LedgerPilot version.');
  }
  if (
    !candidate.business ||
    !Array.isArray(candidate.team) ||
    !Array.isArray(candidate.vendors) ||
    !Array.isArray(candidate.invoices) ||
    !Array.isArray(candidate.payments) ||
    !Array.isArray(candidate.audit)
  ) {
    throw new Error('The backup is missing workspace data.');
  }
  if (!['owner', 'accountant', 'staff'].includes(candidate.role as string)) {
    throw new Error('The backup has an invalid acting role.');
  }
  return candidate as DemoState;
}

/* ------------------------------------------------------------------ */
/* Downloadable starter files                                         */
/* ------------------------------------------------------------------ */

export const VENDOR_CSV_TEMPLATE = `${VENDOR_EXPORT_HEADERS.join(',')}\r\n${csvRow([
  'Sample Tools & Traders',
  'Hand tools & accessories',
  '27AASCT1234A1Z5',
  'Shop 12, MIDC Road',
  'Nashik',
  'Maharashtra',
  '422007',
  '+91 98765 43210',
  'accounts@sampletools.example',
  30,
  'HDFC Bank',
  '****4412',
  'HDFC0001234',
  '',
  'active',
])}\r\n${csvRow([
  'Sample Cable House',
  'Cables & conductors',
  '29AASCT1234B1Z3',
  'Plot 8, Industrial Layout',
  'Bengaluru',
  'Karnataka',
  '560058',
  '+91 98765 43211',
  'sales@samplecable.example',
  15,
  'ICICI Bank',
  '****7781',
  'ICIC0002345',
  '',
  'active',
])}\r\n`;

export const INVOICE_CSV_TEMPLATE = `${INVOICE_EXPORT_HEADERS.join(',')}\r\n${csvRow([
  '27AASCT1234A1Z5',
  'Sample Tools & Traders',
  'STT/26-27/0011',
  '2026-10-10',
  '2026-10-10',
  '2026-11-09',
  30,
  '',
  '',
  'intra',
  18,
  'Maharashtra (27)',
  'Copper wire 1.5 sq mm (90 m coil)',
  '8544',
  10,
  'coil',
  '2450.00',
  '',
  '',
  '',
  '',
  '31176.00',
  '',
  'Sample two-line invoice. Add more rows with the same vendor_gstin and invoice_number for extra lines.',
])}\r\n${csvRow([
  '27AASCT1234A1Z5',
  'Sample Tools & Traders',
  'STT/26-27/0011',
  '2026-10-10',
  '2026-10-10',
  '2026-11-09',
  30,
  '',
  '',
  'intra',
  18,
  'Maharashtra (27)',
  'Modular switch 6A',
  '8536',
  40,
  'pc',
  '48.00',
  '',
  '',
  '',
  '',
  '31176.00',
  '',
  '',
])}\r\n${csvRow([
  '29AASCT1234B1Z3',
  'Sample Cable House',
  'SCH/26-27/0042',
  '2026-10-18',
  '2026-10-19',
  '2026-11-02',
  15,
  '',
  '',
  'inter',
  12,
  'Maharashtra (27)',
  'PVC insulated cable 2.5 sq mm',
  '8544',
  4,
  'roll',
  '1500.00',
  '2000.00',
  '2026-10-20',
  'UPI',
  'UPI-SAMPLE-2000',
  '6720.00',
  '',
  'Part-paid inter-state invoice with 12% IGST.',
])}\r\n`;

export const WORKSPACE_CSV_NOTE =
  'CSV is for vendor and invoice master data. Payment history is flattened into opening paid amounts. Use the JSON backup for an exact copy of the workspace.';
