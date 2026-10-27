import React, { useState } from 'react';
import { CheckCircle2, Clock, ArrowRight, FileText, AlertCircle } from 'lucide-react';
import { Invoice } from '../types/invoice';

interface WorkflowTimelineProps {
  invoices: Invoice[];
  onOpenInvoiceModal: (invoice: Invoice) => void;
}

export const WorkflowTimelineSection: React.FC<WorkflowTimelineProps> = ({
  invoices,
  onOpenInvoiceModal,
}) => {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(
    invoices[1]?.id || invoices[0]?.id || 'INV-2026-002'
  );

  const selectedInvoice =
    invoices.find((i) => i.id === selectedInvoiceId) || invoices[0];

  return (
    <section className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl space-y-3 mb-12">
          <div className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
            TRACEABILITY & AUDITING
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#422701] text-balance">
            Real-time processing timeline.
          </h2>
          <p className="text-base text-[#705e46]">
            Every vendor document advances through explicit, deterministic milestones. View the live
            audit trail for any payable in your queue.
          </p>
        </div>

        {/* Invoice Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4 mb-6">
          <span className="text-xs text-[#705e46] font-medium mr-1 whitespace-nowrap">
            Select Invoice:
          </span>
          {invoices.slice(0, 4).map((inv) => (
            <button
              key={inv.id}
              onClick={() => setSelectedInvoiceId(inv.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                selectedInvoice.id === inv.id
                  ? 'bg-[#5d674f] text-white shadow-xs'
                  : 'bg-white border border-[#e6e2d9] text-[#705e46] hover:text-[#422701] hover:border-[#d6b588]'
              }`}
            >
              {inv.vendor} ({inv.invoiceNumber})
            </button>
          ))}
        </div>

        {/* Main Grid: Detail Panel + Visual Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Detail Panel */}
          <div className="lg:col-span-5 rounded-2xl bg-white border border-[#e6e2d9] p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-[#f0ede6] pb-3">
              <span className="text-xs font-semibold text-[#422701] uppercase tracking-wider">
                Active Document Ledger
              </span>
              <span className="text-xs font-mono text-[#5d674f] bg-[#5d674f]/10 px-2 py-0.5 rounded">
                Confidence: {(selectedInvoice.extractionConfidence * 100).toFixed(0)}%
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-[#705e46] uppercase tracking-wider">Vendor</span>
                <h3 className="text-lg font-semibold text-[#422701]">{selectedInvoice.vendor}</h3>
                <p className="text-xs text-[#705e46]">{selectedInvoice.vendorCategory}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-[#faf9f6] border border-[#f0ede6]">
                  <span className="text-[10px] text-[#705e46] uppercase">Invoice Number</span>
                  <p className="font-mono text-xs font-semibold text-[#422701] mt-0.5">
                    {selectedInvoice.invoiceNumber}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[#faf9f6] border border-[#f0ede6]">
                  <span className="text-[10px] text-[#705e46] uppercase">Due Date</span>
                  <p className="font-mono text-xs font-semibold text-[#422701] mt-0.5">
                    {selectedInvoice.dueDate}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#faf9f6] border border-[#ece7dc] space-y-2">
                <div className="flex justify-between items-center text-xs text-[#705e46]">
                  <span>Subtotal:</span>
                  <span className="font-mono tabular-nums text-[#422701]">
                    ${selectedInvoice.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-[#705e46]">
                  <span>Tax:</span>
                  <span className="font-mono tabular-nums text-[#422701]">
                    ${selectedInvoice.tax.toFixed(2)}
                  </span>
                </div>
                <div className="border-t border-[#e6e2d9] pt-2 flex justify-between items-center text-sm font-semibold text-[#422701]">
                  <span>Total Payable:</span>
                  <span className="font-mono tabular-nums text-[#5d674f] text-base">
                    ${selectedInvoice.amount.toFixed(2)}
                  </span>
                </div>
              </div>

              {selectedInvoice.flags.length > 0 && (
                <div className="p-3 rounded-xl bg-[#fcf0e8] border border-[#f0d4c2] text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-[#a45422]">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Active Attention Flag</span>
                  </div>
                  <p className="text-[11px] text-[#705e46]">
                    {selectedInvoice.flags[0].message}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => onOpenInvoiceModal(selectedInvoice)}
                className="w-full py-3 px-4 text-xs sm:text-sm font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <span>Open Workflow</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Visual Timeline Tracking States */}
          <div className="lg:col-span-7 rounded-2xl bg-white border border-[#e6e2d9] p-6 sm:p-7 shadow-xs">
            <h4 className="text-sm font-semibold text-[#422701] mb-6 flex items-center justify-between">
              <span>Milestone Audit Sequence</span>
              <span className="text-xs text-[#705e46] font-normal">
                Status: <strong className="text-[#422701]">{selectedInvoice.status}</strong>
              </span>
            </h4>

            {/* Vertical Timeline */}
            <div className="relative pl-6 space-y-7 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#e6e2d9]">
              {selectedInvoice.timeline.map((step, idx) => {
                const isCompleted = step.status === 'completed';
                const isInProgress = step.status === 'in-progress';

                return (
                  <div key={idx} className="relative group">
                    {/* Node Dot / Marker */}
                    <div
                      className={`absolute -left-6 top-1 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        isCompleted
                          ? 'bg-[#5d674f] text-white'
                          : isInProgress
                          ? 'bg-[#d6b588] text-[#422701] ring-4 ring-[#d6b588]/30'
                          : 'bg-white border-2 border-[#d6cfbe] text-transparent'
                      }`}
                    >
                      {isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {isInProgress && <Clock className="w-3 h-3 animate-spin" />}
                    </div>

                    {/* Step Content */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isCompleted || isInProgress ? 'text-[#422701]' : 'text-[#705e46]/70'
                          }`}
                        >
                          {step.title}
                        </span>
                        <span className="font-mono text-[11px] text-[#705e46] tabular-nums">
                          {step.timestamp}
                        </span>
                      </div>

                      {step.note && (
                        <p className="text-xs text-[#705e46] leading-relaxed">
                          {step.note}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
