export type Role = 'owner' | 'accountant' | 'staff';

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  role: Role;
  initials: string;
}

export interface BankDetails {
  bankName: string;
  accountMasked: string;
  ifsc: string;
  upiId?: string;
  status: 'verified' | 'changed';
  changedAt?: string;
  previousAccountMasked?: string;
}

export interface Business {
  id: string;
  name: string;
  legalName: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  fy: string;
  asOf: string;
  bank: BankDetails;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  termsDays: number;
  termsLabel: string;
  bank: BankDetails;
  lastPaymentDate?: string;
  status: 'active' | 'verify';
}

export type GstType = 'intra' | 'inter';

export interface InvoiceLine {
  id: string;
  description: string;
  hsn: string;
  qty: number;
  unit: string;
  ratePaise: number;
  totalPaise: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendorId: string;
  issueDate: string;
  receivedDate: string;
  dueDate: string;
  termsDays: number;
  poNumber?: string;
  grnNumber?: string;
  placeOfSupply: string;
  gstType: GstType;
  gstRate?: number;
  lines: InvoiceLine[];
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  statedTotalPaise: number;
  version: number;
  source: 'email' | 'upload' | 'manual';
  duplicateOf?: string;
  notes?: string;
  importedAt?: string;
}

export type PaymentMode = 'NEFT' | 'UPI' | 'RTGS' | 'Cheque' | 'Cash';

export type PaymentStatus =
  | 'pending_approval'
  | 'approved'
  | 'failed'
  | 'simulated'
  | 'rejected';

export interface Payment {
  id: string;
  invoiceId: string;
  amountPaise: number;
  mode: PaymentMode;
  reference: string;
  requestedDate: string;
  recordedBy: string;
  recordedAt: string;
  status: PaymentStatus;
  approvedBy?: string;
  approvedAt?: string;
  approvalFingerprint?: string;
  executedAt?: string;
  mockTxnId?: string;
  failureReason?: string;
  attempt: number;
  note?: string;
  rejectionReason?: string;
  /** Server-issued key used to execute the payment idempotently. */
  idempotencyKey?: string;
}

export type AuditActorRole = Role | 'system';

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  actorRole: AuditActorRole;
  action: string;
  entityType: 'invoice' | 'payment' | 'vendor' | 'system';
  entityId: string;
  summary: string;
  detail?: string;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  evidence: string;
}

export type InvoiceStatus =
  | 'Needs review'
  | 'Ready for approval'
  | 'Pending approval'
  | 'Approved'
  | 'Part-paid'
  | 'Paid'
  | 'Rejected'
  | 'Payment failed'
  | 'Approval stale';

export interface InvoiceView {
  invoice: Invoice;
  vendor: Vendor;
  payments: Payment[];
  paidPaise: number;
  reservedPaise: number;
  outstandingPaise: number;
  availablePaise: number;
  checks: Check[];
  status: InvoiceStatus;
  overdueDays: number;
  dueInDays: number;
  activePayment?: Payment;
  approvalStale: boolean;
}

export interface LedgerTotals {
  payablePaise: number;
  overduePaise: number;
  overdueCount: number;
  dueSoonPaise: number;
  dueSoonCount: number;
  pendingApprovalCount: number;
  pendingApprovalPaise: number;
  approvedToPayPaise: number;
  approvedToPayCount: number;
  exceptionCount: number;
  paidThisMonthPaise: number;
  simulatedPaymentCount: number;
}

export interface AgeingBucket {
  label: string;
  amountPaise: number;
  count: number;
}

export interface DemoState {
  schemaVersion: 1;
  business: Business;
  team: TeamMember[];
  vendors: Vendor[];
  invoices: Invoice[];
  payments: Payment[];
  audit: AuditEvent[];
  role: Role;
  forceNextFailure: boolean;
  seededAt: string;
}

export interface PaymentRequestInput {
  invoiceId: string;
  amountPaise: number;
  mode: PaymentMode;
  reference: string;
  requestedDate: string;
  note?: string;
}

export interface BusinessProfileInput {
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  fy: string;
  asOf: string;
}
