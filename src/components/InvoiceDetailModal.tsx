import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Building2,
  Calendar,
  CreditCard,
  Hash,
  ShieldCheck,
  Check,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Invoice, InvoiceStatus } from '../types/invoice';

interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onUpdateStatus: (id: string, newStatus: InvoiceStatus) => void;
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({
  invoice,
  onClose,
  onUpdateStatus,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'document' | 'audit'>('details');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!invoice) return null;

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(invoice, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${invoice.invoiceNumber}-extracted.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showNotification(`Downloaded ${invoice.invoiceNumber} JSON schema.`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl rounded-2xl bg-white border border-[#e6e2d9] shadow-xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-[#f0ede6] flex items-center justify-between bg-[#faf9f6]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="invoice-modal-title" className="font-semibold text-base text-[#422701]">
                  {invoice.vendor}
                </h3>
                <span className="font-mono text-xs text-[#705e46] bg-[#ede8dc] px-2 py-0.5 rounded">
                  {invoice.invoiceNumber}
                </span>
              </div>
              <p className="text-[11px] text-[#705e46]">
                Extracted Record ID: <span className="font-mono">{invoice.id}</span> ·{' '}
                {(invoice.extractionConfidence * 100).toFixed(0)}% OCR Confidence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJson}
              title="Download Extracted JSON"
              className="p-2 text-[#705e46] hover:text-[#422701] hover:bg-[#ede8dc] rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export JSON</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 text-[#705e46] hover:text-[#422701] hover:bg-[#ede8dc] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Segmented Tabs */}
        <div className="px-6 py-2.5 border-b border-[#f0ede6] bg-white flex items-center gap-2">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'details'
                ? 'bg-[#5d674f] text-white shadow-xs'
                : 'text-[#705e46] hover:bg-[#faf9f6] hover:text-[#422701]'
            }`}
          >
            Extracted Fields & Lines
          </button>
          <button
            onClick={() => setActiveTab('document')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'document'
                ? 'bg-[#5d674f] text-white shadow-xs'
                : 'text-[#705e46] hover:bg-[#faf9f6] hover:text-[#422701]'
            }`}
          >
            Simulated Document View
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'audit'
                ? 'bg-[#5d674f] text-white shadow-xs'
                : 'text-[#705e46] hover:bg-[#faf9f6] hover:text-[#422701]'
            }`}
          >
            Audit Log & History
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Active Attention Flags (if any) */}
          {invoice.flags.length > 0 && (
            <div className="space-y-2">
              {invoice.flags.map((flag, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                    flag.type === 'warning'
                      ? 'bg-[#fcf0e8] border-[#f0d4c2] text-[#a45422]'
                      : 'bg-[#faf9f6] border-[#e6e2d9] text-[#705e46]'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{flag.title}: </span>
                    <span>{flag.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Primary Key-Value Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-[#faf9f6] border border-[#f0ede6]">
                <div>
                  <span className="text-[10px] text-[#705e46] uppercase font-semibold">Vendor Name</span>
                  <p className="text-xs font-medium text-[#422701] mt-0.5">{invoice.vendor}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#705e46] uppercase font-semibold">PO Association</span>
                  <p className="text-xs font-mono font-medium text-[#422701] mt-0.5">
                    {invoice.poNumber || 'None (Direct Billing)'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-[#705e46] uppercase font-semibold">Payment Terms</span>
                  <p className="text-xs font-medium text-[#422701] mt-0.5">{invoice.paymentTerms}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#705e46] uppercase font-semibold">Disbursement Route</span>
                  <p className="text-xs font-mono text-[#422701] mt-0.5">{invoice.paymentMethod} {invoice.ibanMasked}</p>
                </div>
              </div>

              {/* Line Items Breakdown */}
              <div className="border border-[#e6e2d9] rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-[#faf9f6] border-b border-[#f0ede6] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#422701] uppercase tracking-wider">
                    Extracted Line Items ({invoice.lineItems.length})
                  </span>
                  <span className="text-[11px] text-[#5d674f] font-medium">Verified Sums</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#f0ede6] text-[11px] text-[#705e46] bg-[#faf9f6]/50">
                        <th className="py-2.5 px-4">Description</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-4 text-right">Unit Price</th>
                        <th className="py-2.5 px-4 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f0ede6]">
                      {invoice.lineItems.map((item) => (
                        <tr key={item.id} className="hover:bg-[#faf9f6]">
                          <td className="py-3 px-4 font-medium text-[#422701]">
                            {item.description}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-[#705e46]">
                            {item.quantity}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-[#705e46]">
                            ${item.unitPrice.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-[#422701] tabular-nums">
                            ${item.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Subtotals & Taxes Footing */}
                <div className="p-4 bg-[#faf9f6] border-t border-[#f0ede6] flex flex-col items-end space-y-1.5 text-xs text-[#705e46]">
                  <div className="flex justify-between w-48">
                    <span>Subtotal:</span>
                    <span className="font-mono text-[#422701] tabular-nums">${invoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between w-48">
                    <span>Tax (calculated):</span>
                    <span className="font-mono text-[#422701] tabular-nums">${invoice.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between w-48 border-t border-[#e6e2d9] pt-1.5 text-sm font-semibold text-[#422701]">
                    <span>Total Amount:</span>
                    <span className="font-mono tabular-nums text-[#5d674f]">${invoice.amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'document' && (
            <div className="border border-[#e6e2d9] rounded-xl p-8 bg-white shadow-xs max-w-2xl mx-auto space-y-6">
              {/* Clean simulated printed invoice */}
              <div className="flex justify-between items-start border-b border-[#e6e2d9] pb-6">
                <div>
                  <h4 className="text-xl font-bold text-[#422701]">{invoice.vendor}</h4>
                  <p className="text-xs text-[#705e46] mt-1 max-w-xs">{invoice.vendorAddress}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-mono font-bold text-[#422701]">INVOICE</div>
                  <div className="text-xs font-mono text-[#705e46]">#{invoice.invoiceNumber}</div>
                  <div className="text-xs text-[#705e46] mt-1">Date: {invoice.issueDate}</div>
                  <div className="text-xs text-[#705e46]">Due: {invoice.dueDate}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-[#705e46] uppercase text-[10px]">Billed To:</span>
                  <p className="font-medium text-[#422701] mt-0.5">{invoice.recipientName}</p>
                  <p className="text-[#705e46]">Accounts Payable Dept.</p>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-[#705e46] uppercase text-[10px]">Payment Terms:</span>
                  <p className="font-medium text-[#422701] mt-0.5">{invoice.paymentTerms}</p>
                  {invoice.poNumber && <p className="text-[#705e46]">Ref: {invoice.poNumber}</p>}
                </div>
              </div>

              {/* Items Table */}
              <div className="border-t border-b border-[#e6e2d9] py-3 space-y-2 text-xs">
                {invoice.lineItems.map((li) => (
                  <div key={li.id} className="flex justify-between py-1 border-b border-[#f0ede6] last:border-0">
                    <span className="text-[#422701]">{li.description} (x{li.quantity})</span>
                    <span className="font-mono text-[#422701]">${li.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end text-xs space-y-1 flex-col items-end">
                <div className="flex justify-between w-40 text-[#705e46]">
                  <span>Subtotal:</span>
                  <span className="font-mono">${invoice.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-40 text-[#705e46]">
                  <span>Tax:</span>
                  <span className="font-mono">${invoice.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-40 font-bold text-sm text-[#422701] border-t border-[#e6e2d9] pt-1">
                  <span>Total:</span>
                  <span className="font-mono">${invoice.amount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-[#422701]">Historical Workflow Milestones</div>
              <div className="space-y-3">
                {invoice.timeline.map((event, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#faf9f6] border border-[#f0ede6] text-xs">
                    <div className="w-2 h-2 rounded-full bg-[#5d674f] mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-[#422701]">{event.title}</span>
                        <span className="font-mono text-[11px] text-[#705e46]">{event.timestamp}</span>
                      </div>
                      {event.note && <p className="text-[#705e46] mt-0.5">{event.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Controls Bar */}
        <div className="px-6 py-4 border-t border-[#f0ede6] bg-[#faf9f6] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#705e46]">Current Status:</span>
            <span className="text-xs font-semibold text-[#422701] bg-white border border-[#e6e2d9] px-2.5 py-1 rounded-md">
              {invoice.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {invoice.status !== 'Needs Attention' && (
              <button
                onClick={() => {
                  onUpdateStatus(invoice.id, 'Needs Attention');
                  showNotification(`Invoice flagged as Needs Attention.`);
                }}
                className="px-3.5 py-2 text-xs font-medium text-[#a45422] bg-[#fcf0e8] hover:bg-[#fae3d5] border border-[#f0d4c2] rounded-lg transition-colors"
              >
                Flag Exception
              </button>
            )}

            {invoice.status !== 'Approved' && invoice.status !== 'Processed' && (
              <button
                onClick={() => {
                  onUpdateStatus(invoice.id, 'Approved');
                  showNotification(`Invoice ${invoice.invoiceNumber} approved.`);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve Invoice</span>
              </button>
            )}

            {invoice.status === 'Approved' && (
              <button
                onClick={() => {
                  onUpdateStatus(invoice.id, 'Processed');
                  showNotification(`Invoice reconciled and marked as Processed.`);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-[#422701] hover:bg-[#2e1b01] rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Mark as Processed</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-[#705e46] hover:text-[#422701] hover:bg-[#ede8dc] rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        </div>

        {/* Modal Quiet Toast */}
        {toastMessage && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#422701] text-white px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 shadow-lg animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-[#d6b588]" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
