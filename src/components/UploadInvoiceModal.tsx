import React, { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, RefreshCw, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { SAMPLE_UPLOAD_PRESETS } from '../data/mockInvoices';
import { Invoice } from '../types/invoice';

interface UploadInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvoiceCreated: (newInvoice: Invoice) => void;
}

export const UploadInvoiceModal: React.FC<UploadInvoiceModalProps> = ({
  isOpen,
  onClose,
  onInvoiceCreated,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SAMPLE_UPLOAD_PRESETS[0].id);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [customFileName, setCustomFileName] = useState<string>('');

  if (!isOpen) return null;

  const handleSimulateUpload = () => {
    setIsProcessing(true);
    setProgressPercent(15);
    setProcessingStage('Reading document structure & verifying cryptographic hash...');

    setTimeout(() => {
      setProgressPercent(45);
      setProcessingStage('OCR & entity extraction: vendor, dates, line items, and bank details...');
    }, 600);

    setTimeout(() => {
      setProgressPercent(80);
      setProcessingStage('Evaluating mathematical sums, tax jurisdiction rates & PO matching...');
    }, 1200);

    setTimeout(() => {
      setProgressPercent(100);
      setProcessingStage('Autonomous extraction complete. Adding to active AP queue.');

      setTimeout(() => {
        const preset = SAMPLE_UPLOAD_PRESETS.find((p) => p.id === selectedPresetId) || SAMPLE_UPLOAD_PRESETS[0];

        const hasDiscrepancy = preset.flags.length > 0;
        const subtotal = preset.amount * 0.92;
        const tax = preset.amount * 0.08;

        const newInv: Invoice = {
          id: `INV-2026-${Math.floor(100 + Math.random() * 900)}`,
          invoiceNumber: preset.invoiceNumber,
          vendor: preset.vendor,
          vendorCategory: preset.category,
          vendorAddress: '100 Silicon Way, Tech Park, Suite 500, Austin, TX 78701',
          recipientName: 'Acme Operations Corp',
          issueDate: new Date().toISOString().split('T')[0],
          dueDate: preset.dueDate,
          amount: preset.amount,
          subtotal: Number(subtotal.toFixed(2)),
          tax: Number(tax.toFixed(2)),
          currency: 'USD',
          status: hasDiscrepancy ? 'Needs Attention' : 'Pending Review',
          currentStage: hasDiscrepancy ? 'validation' : 'review',
          paymentTerms: 'Net 30',
          poNumber: `PO-${Math.floor(10000 + Math.random() * 90000)}`,
          paymentMethod: 'ACH Direct',
          ibanMasked: 'US** **** **** 2291',
          extractionConfidence: hasDiscrepancy ? 0.91 : 0.98,
          flags: preset.flags.map((f) => ({
            type: f.type,
            title: f.title,
            message: f.message,
          })),
          lineItems: [
            {
              id: 'li-new-1',
              description: preset.description,
              quantity: 1,
              unitPrice: preset.amount,
              total: preset.amount,
            },
          ],
          timeline: [
            { title: 'Document received', timestamp: 'Just now', status: 'completed', note: 'Uploaded via interactive portal' },
            { title: 'Information extracted', timestamp: 'Just now', status: 'completed', note: 'Autonomously parsed 12 fields' },
            {
              title: 'Validation completed',
              timestamp: 'Just now',
              status: 'completed',
              note: hasDiscrepancy ? 'Identified tax discrepancy for controller review' : 'No exceptions found',
            },
            { title: 'Review required', timestamp: 'In progress', status: 'in-progress' },
            { title: 'Ready for next step', timestamp: 'Pending', status: 'pending' },
          ],
        };

        setIsProcessing(false);
        setProgressPercent(0);
        onInvoiceCreated(newInv);
        onClose();
      }, 500);
    }, 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl bg-white border border-[#e6e2d9] shadow-xl p-6 sm:p-7 space-y-6 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#f0ede6] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-[#422701]">Upload Vendor Invoice</h3>
              <p className="text-xs text-[#705e46]">Autonomous extraction & validation pipeline</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-[#705e46] hover:text-[#422701] rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload Simulation Area */}
        {isProcessing ? (
          <div className="py-8 px-4 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#5d674f]/10 text-[#5d674f] mx-auto flex items-center justify-center animate-spin">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold text-[#422701]">Processing Document</h4>
              <p className="text-xs text-[#705e46] max-w-sm mx-auto">{processingStage}</p>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-[#ede8dc] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[#5d674f] h-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Drop Zone Box */}
            <div
              onClick={() => {
                const dummyNames = ['Invoice-Cloudflare-2026.pdf', 'Logistics-Pacific-Rim.pdf', 'Lab-Precision-OTL.pdf'];
                const picked = dummyNames[Math.floor(Math.random() * dummyNames.length)];
                setCustomFileName(picked);
              }}
              className="border-2 border-dashed border-[#d6b588]/80 hover:border-[#5d674f] rounded-xl p-6 text-center cursor-pointer transition-colors bg-[#faf9f6] hover:bg-[#f5f4f0]"
            >
              <UploadCloud className="w-8 h-8 text-[#5d674f] mx-auto mb-2" />
              <p className="text-xs font-semibold text-[#422701]">
                {customFileName ? `Loaded: ${customFileName}` : 'Drag & drop invoice PDF, TIFF or scan'}
              </p>
              <p className="text-[11px] text-[#705e46] mt-1">
                or click to pick a simulated document file
              </p>
            </div>

            {/* Pre-Loaded Realistic Preset Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#422701] block">
                Or select a test document preset:
              </label>
              <div className="space-y-2">
                {SAMPLE_UPLOAD_PRESETS.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  const hasDiscrepancy = preset.flags.length > 0;

                  return (
                    <div
                      key={preset.id}
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        setCustomFileName(`${preset.vendor.replace(/\s+/g, '-')}-Invoice.pdf`);
                      }}
                      className={`p-3 rounded-xl border transition-colors cursor-pointer text-xs ${
                        isSelected
                          ? 'bg-[#5d674f]/10 border-[#5d674f] text-[#422701]'
                          : 'bg-white border-[#e6e2d9] hover:bg-[#faf9f6] text-[#705e46]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[#422701]">{preset.vendor}</span>
                        <span className="font-mono font-medium text-[#422701]">
                          ${preset.amount.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[11px] flex items-center justify-between">
                        <span className="text-[#705e46]">{preset.category}</span>
                        {hasDiscrepancy ? (
                          <span className="text-[#a45422] font-medium">Contains Tax Exception</span>
                        ) : (
                          <span className="text-[#5d674f]">Clean Validation</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CTAs */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#f0ede6]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#705e46] hover:text-[#422701]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSimulateUpload}
                className="px-5 py-2.5 text-xs font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
              >
                <span>Run Extraction</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
