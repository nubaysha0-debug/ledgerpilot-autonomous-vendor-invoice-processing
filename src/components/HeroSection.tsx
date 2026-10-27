import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, FileText, Sparkles, AlertCircle, Eye } from 'lucide-react';
import { Invoice } from '../types/invoice';

interface HeroSectionProps {
  onExploreDashboard: () => void;
  onSeeHowItWorks: () => void;
  onInspectSampleInvoice: (invoiceId: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreDashboard,
  onSeeHowItWorks,
  onInspectSampleInvoice,
}) => {
  return (
    <section id="overview" className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden">
      {/* Background oversized organic circular / orbital elements */}
      <div
        aria-hidden="true"
        className="absolute -top-32 -right-32 w-[620px] h-[620px] md:w-[780px] md:h-[780px] rounded-full bg-[#ede8dc] opacity-70 pointer-events-none -z-10"
      />
      <div
        aria-hidden="true"
        className="absolute top-1/2 -right-16 w-[420px] h-[420px] rounded-full border border-[#d6b588]/40 pointer-events-none -z-10"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 left-1/4 w-[380px] h-[380px] rounded-full bg-[#f0ebd9]/50 pointer-events-none -z-10"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Asymmetrical 2-Column Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Editorial Content (7 cols on large desktop) */}
          <div className="lg:col-span-6 xl:col-span-6 space-y-6">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5d674f]" />
              AUTONOMOUS ACCOUNTS PAYABLE
            </div>

            {/* Main Heading */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-[#422701] leading-[1.08] text-balance">
              Invoices in.<br />
              <span className="text-[#5d674f] font-normal italic font-serif">Clarity</span> out.
            </h1>

            {/* Supporting Copy */}
            <p className="text-base sm:text-lg text-[#705e46] leading-relaxed max-w-xl">
              Let LedgerPilot streamline invoice processing, surface discrepancies, and bring every
              payable into focus — so your team can spend less time on repetitive tasks.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <button
                onClick={onExploreDashboard}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] active:bg-[#3f4634] rounded-lg transition-all duration-150 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f] focus-visible:ring-offset-2 whitespace-nowrap"
              >
                <span>Explore Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onSeeHowItWorks}
                className="inline-flex items-center justify-center px-6 py-3.5 text-sm font-medium text-[#422701] bg-[#ece8df] hover:bg-[#e2ddd1] border border-[#d6b588]/40 rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f] whitespace-nowrap"
              >
                See How It Works
              </button>
            </div>

            {/* Honest Caption */}
            <p className="text-xs text-[#705e46] pt-1 tracking-normal">
              Designed for smarter invoice workflows.
            </p>
          </div>

          {/* Right Visual: Layered invoice-processing dashboard mockup backed by oversized orbital shape */}
          <div className="lg:col-span-6 xl:col-span-6 relative">
            {/* Organic orbital accent behind mockup */}
            <div
              aria-hidden="true"
              className="absolute -top-10 -right-8 w-72 h-72 md:w-96 md:h-96 rounded-full bg-[#d6b588]/25 filter blur-2xl pointer-events-none -z-10"
            />

            {/* Mockup Card Container */}
            <div className="relative rounded-2xl bg-white border border-[#e6e2d9] shadow-sm p-5 sm:p-6 transition-all duration-200 hover:border-[#d6b588]">
              {/* Header bar of Mockup */}
              <div className="flex items-center justify-between border-b border-[#f0ede6] pb-3.5 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#5d674f]" />
                  <span className="text-xs font-semibold text-[#422701] tracking-tight">
                    Active Intake Buffer
                  </span>
                </div>
                <div className="text-[11px] text-[#705e46] font-mono tabular-nums">
                  INV-2026-001 · 98% Conf.
                </div>
              </div>

              {/* Main Mockup Document & Extraction Split */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                {/* Document Preview Thumbnail */}
                <div className="sm:col-span-5 bg-[#faf9f6] border border-[#ece7dc] rounded-xl p-3.5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[#705e46]">
                      <span className="font-semibold text-[#422701]">VENDOR INVOICE</span>
                      <FileText className="w-3.5 h-3.5 text-[#5d674f]" />
                    </div>
                    <div className="h-0.5 bg-[#e6e2d9] w-full" />
                    <div className="space-y-1 text-[11px]">
                      <p className="font-semibold text-[#422701] truncate">Meridian Cloud Logistics</p>
                      <p className="text-[#705e46] text-[10px] font-mono">Invoice # MCL-88914</p>
                      <p className="text-[#705e46] text-[10px]">Due: Nov 17, 2026</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#f0ede6] mt-4">
                    <div className="text-[10px] text-[#705e46] uppercase tracking-wider">Amount Due</div>
                    <div className="text-base font-semibold text-[#422701] font-mono tabular-nums">
                      $18,450.00
                    </div>
                  </div>
                </div>

                {/* Extraction Fields Inspector */}
                <div className="sm:col-span-7 space-y-2.5">
                  <div className="text-xs font-semibold text-[#422701] flex items-center justify-between">
                    <span>Extracted Entities</span>
                    <span className="text-[10px] text-[#5d674f] bg-[#5d674f]/10 px-1.5 py-0.5 rounded">
                      Autonomously Parsed
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#faf9f6] border border-[#f0ede6]">
                      <span className="text-[#705e46]">Purchase Order</span>
                      <span className="font-mono font-medium text-[#422701]">PO-99120 (Matched)</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#faf9f6] border border-[#f0ede6]">
                      <span className="text-[#705e46]">Line Items</span>
                      <span className="font-medium text-[#422701]">3 items categorized</span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#faf9f6] border border-[#f0ede6]">
                      <span className="text-[#705e46]">Tax Rate Verification</span>
                      <span className="text-[#5d674f] font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        8.25% Validated
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-[#faf9f6] border border-[#f0ede6]">
                      <span className="text-[#705e46]">Remittance Route</span>
                      <span className="font-mono text-[11px] text-[#422701]">ACH Direct (US..4819)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Banner inside Mockup */}
              <div className="mt-4 pt-3.5 border-t border-[#f0ede6] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[#705e46]">
                  <span className="w-2 h-2 rounded-full bg-[#5d674f]" />
                  <span>Validation check passed</span>
                </div>

                <button
                  onClick={() => onInspectSampleInvoice('INV-2026-001')}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#5d674f] hover:text-[#422701] transition-colors focus:outline-none"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect Extraction</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Statistics Panel: Sage-colored organic panel occupying ~65% width on desktop with large top-right radius */}
        <div className="mt-14 md:mt-20">
          <div className="w-full lg:w-[68%] rounded-2xl rounded-tr-3xl md:rounded-tr-[52px] bg-[#5d674f] text-white p-6 sm:p-8 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 divide-y sm:divide-y-0 sm:divide-x divide-white/15">
              {/* Feature 1 */}
              <div className="sm:pr-4 pt-2 sm:pt-0">
                <p className="text-base font-semibold tracking-tight text-white mb-1">
                  Invoice Intake
                </p>
                <p className="text-xs text-white/80 leading-relaxed">
                  Automated workflow capturing incoming vendor bills across PDF, email, and portal drops.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="sm:px-4 pt-4 sm:pt-0">
                <p className="text-base font-semibold tracking-tight text-white mb-1">
                  Validation
                </p>
                <p className="text-xs text-white/80 leading-relaxed">
                  Exception-aware review flagging tax math, unlinked POs, and remittance discrepancies.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="sm:pl-4 pt-4 sm:pt-0">
                <p className="text-base font-semibold tracking-tight text-white mb-1">
                  Visibility
                </p>
                <p className="text-xs text-white/80 leading-relaxed">
                  Centralized invoice status giving AP controllers transparent stage tracking.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
