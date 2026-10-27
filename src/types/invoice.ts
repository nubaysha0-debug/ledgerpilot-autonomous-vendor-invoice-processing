export type InvoiceStatus =
  | 'Received'
  | 'Processing'
  | 'Pending Review'
  | 'Needs Attention'
  | 'Approved'
  | 'Processed';

export type InvoiceStage =
  | 'intake'
  | 'extraction'
  | 'validation'
  | 'review'
  | 'completed';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceValidationFlag {
  type: 'warning' | 'info' | 'error';
  title: string;
  message: string;
  field?: string;
}

export interface InvoiceTimelineEvent {
  title: string;
  timestamp: string;
  status: 'completed' | 'in-progress' | 'pending';
  note?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendor: string;
  vendorCategory: string;
  vendorAddress: string;
  recipientName: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  subtotal: number;
  tax: number;
  currency: string;
  status: InvoiceStatus;
  currentStage: InvoiceStage;
  paymentTerms: string;
  poNumber?: string;
  paymentMethod: string;
  ibanMasked?: string;
  extractionConfidence: number; // 0.0 to 1.0
  flags: InvoiceValidationFlag[];
  lineItems: InvoiceLineItem[];
  timeline: InvoiceTimelineEvent[];
  notes?: string;
}
