import React, { useState } from 'react';
import { UploadCloud, FileSearch, ShieldAlert, CheckCircle, ArrowRight, CornerDownRight } from 'lucide-react';

interface HowItWorksProps {
  onOpenUpload: () => void;
  onOpenDashboard: () => void;
}

export const HowItWorksSection: React.FC<HowItWorksProps> = ({ onOpenUpload, onOpenDashboard }) => {
  const [selectedStage, setSelectedStage] = useState<number>(1);

  const stages = [
    {
      step: '01',
      title: 'Upload',
      subtitle: 'Document Intake',
      icon: UploadCloud,
      summary: 'Bring an invoice document into the workflow.',
      details:
        'Upload via drag & drop, forward from dedicated AP inboxes, or connect existing cloud storage folders. LedgerPilot ingests PDFs, multi-page TIFFs, and image scans seamlessly.',
      actionLabel: 'Test Upload',
      onAction: onOpenUpload,
    },
    {
      step: '02',
      title: 'Extract',
      subtitle: 'Entity Parsing',
      icon: FileSearch,
      summary: 'Identify available fields like vendor, invoice number, dates, line items, tax, and total.',
      details:
        'Context-aware models parse unstructured invoice layouts into structured keys: vendor entity, tax ID, payment terms, currency, line-item descriptions, and remittance destinations.',
      actionLabel: 'View Extraction Fields',
      onAction: onOpenDashboard,
    },
    {
      step: '03',
      title: 'Validate',
      subtitle: 'Exception Engine',
      icon: ShieldAlert,
      summary: 'Review extracted values and flag potential inconsistencies or missing information.',
      details:
        'Automated checks cross-reference line item totals against calculated sums, verify jurisdictional tax rates, cross-check PO numbers, and inspect vendor bank details against master records.',
      actionLabel: 'Explore Exceptions',
      onAction: onOpenDashboard,
    },
    {
      step: '04',
      title: 'Review & Process',
      subtitle: 'Human Governance',
      icon: CheckCircle,
      summary: 'Review exceptions, track approval status, and continue through the workflow.',
      details:
        'Clean invoices pass through for fast-track payment scheduling. Flagged exceptions enter an intuitive controller queue with highlighted diffs for one-click approval or inquiry.',
      actionLabel: 'Open Controller Queue',
      onAction: onOpenDashboard,
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl space-y-3 mb-16">
          <div className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
            WORKFLOW PIPELINE
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#422701] text-balance">
            From document to decision.
          </h2>
          <p className="text-base text-[#705e46] leading-relaxed">
            Four interconnected stages designed to minimize manual touch points while preserving
            rigorous financial control and audit traceability.
          </p>
        </div>

        {/* 4 Connected Stages: Desktop horizontal with connector lines; stacked vertically on mobile */}
        <div className="relative">
          {/* Subtle connecting line across desktop stages */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-7 left-12 right-12 h-0.5 bg-[#e6e2d9] -z-0"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {stages.map((stage, idx) => {
              const IconComponent = stage.icon;
              const isSelected = selectedStage === idx;

              return (
                <div
                  key={stage.step}
                  onClick={() => setSelectedStage(idx)}
                  className={`group relative rounded-2xl p-6 transition-all duration-200 cursor-pointer flex flex-col justify-between border ${
                    isSelected
                      ? 'bg-white border-[#5d674f] shadow-sm ring-1 ring-[#5d674f]/20'
                      : 'bg-white/70 border-[#e6e2d9] hover:bg-white hover:border-[#d6b588]'
                  }`}
                >
                  <div>
                    {/* Top Step + Icon Row */}
                    <div className="flex items-center justify-between mb-5">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-[#5d674f] text-white'
                            : 'bg-[#ede8dc] text-[#705e46] group-hover:bg-[#5d674f] group-hover:text-white'
                        }`}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#705e46] tracking-wider">
                        {stage.step}
                      </span>
                    </div>

                    {/* Step Title & Subtitle */}
                    <div className="space-y-1 mb-2.5">
                      <h3 className="text-base font-semibold text-[#422701] flex items-center gap-1.5">
                        <span>{stage.step} — {stage.title}</span>
                      </h3>
                      <p className="text-xs text-[#5d674f] font-medium">{stage.subtitle}</p>
                    </div>

                    {/* Summary */}
                    <p className="text-xs sm:text-sm text-[#705e46] leading-relaxed">
                      {stage.summary}
                    </p>
                  </div>

                  {/* Stage Details expander */}
                  <div className="mt-5 pt-4 border-t border-[#f0ede6] flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#705e46] group-hover:text-[#422701] transition-colors">
                      {isSelected ? 'Active Selection' : 'Click to preview'}
                    </span>
                    <ArrowRight
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${
                        isSelected ? 'text-[#5d674f] translate-x-1' : 'text-[#705e46]'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Stage Detail Drawer / Deep-Dive Box */}
        <div className="mt-8 rounded-2xl bg-white border border-[#e6e2d9] p-6 sm:p-8 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-8 space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-[#5d674f]">
                <CornerDownRight className="w-3.5 h-3.5" />
                <span>Deep Dive: Stage {stages[selectedStage].step} — {stages[selectedStage].title}</span>
              </div>
              <h4 className="text-lg font-semibold text-[#422701]">
                {stages[selectedStage].subtitle} Overview
              </h4>
              <p className="text-sm text-[#705e46] leading-relaxed max-w-2xl">
                {stages[selectedStage].details}
              </p>
            </div>

            <div className="md:col-span-4 flex justify-start md:justify-end">
              <button
                onClick={stages[selectedStage].onAction}
                className="px-5 py-2.5 text-xs sm:text-sm font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs flex items-center gap-2 whitespace-nowrap"
              >
                <span>{stages[selectedStage].actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
