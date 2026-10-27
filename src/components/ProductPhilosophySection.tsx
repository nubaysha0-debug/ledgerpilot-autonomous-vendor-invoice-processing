import React, { useState } from 'react';
import { Layers, CheckSquare, Search, Eye, ArrowRight, ShieldCheck, FileCheck2, Cpu } from 'lucide-react';

export const ProductPhilosophySection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'capture' | 'validate' | 'track'>('validate');

  const principles = [
    {
      id: 'capture' as const,
      title: 'Capture',
      subtitle: 'Structured Workflow',
      description:
        'Eliminate manual data entry. Invoices are parsed into normalized entity records with dates, line totals, tax structures, and counterparty metadata without document drift.',
      metric: 'Multi-format PDF, scans & mail drops',
    },
    {
      id: 'validate' as const,
      title: 'Validate',
      subtitle: 'Surface Exceptions',
      description:
        'Instead of human reviewers double-checking flawless items, LedgerPilot highlights arithmetic gaps, tax discrepancies, and unverified bank details for prioritized review.',
      metric: 'Exception-first triage logic',
    },
    {
      id: 'track' as const,
      title: 'Track',
      subtitle: 'Status Transparency',
      description:
        'Clear visibility from ingestion to payment release. Every calculation, PO reconciliation, and approval checkpoint remains auditable in a single shared timeline.',
      metric: 'Deterministic audit timeline',
    },
  ];

  return (
    <section className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative overflow-hidden">
      {/* Decorative subtle circular accent */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 -left-24 w-80 h-80 rounded-full border border-[#d6b588]/30 pointer-events-none -z-10"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left-Side Editorial Explanation */}
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
              PHILOSOPHY & PRINCIPLES
            </div>

            <h2 className="text-3xl sm:text-4xl font-medium tracking-tight text-[#422701] text-balance">
              Less manual work.<br />More financial clarity.
            </h2>

            <p className="text-base text-[#705e46] leading-relaxed">
              Invoice processing shouldn't mean chasing documents, checking the same fields
              repeatedly, and losing track of approvals. LedgerPilot brings invoice information and
              processing status into one structured workflow.
            </p>

            {/* Three Interactive Principles */}
            <div className="pt-4 space-y-3">
              {principles.map((principle) => {
                const isActive = activeTab === principle.id;
                return (
                  <div
                    key={principle.id}
                    onClick={() => setActiveTab(principle.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setActiveTab(principle.id);
                      }
                    }}
                    className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f] ${
                      isActive
                        ? 'bg-white border-[#5d674f] shadow-xs'
                        : 'bg-white/50 border-[#e6e2d9] hover:bg-white hover:border-[#d6b588]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
                            isActive
                              ? 'bg-[#5d674f] text-white'
                              : 'bg-[#ede9df] text-[#705e46]'
                          }`}
                        >
                          {principle.title}
                        </span>
                        <span className="text-sm font-medium text-[#422701]">
                          {principle.subtitle}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#705e46] hidden sm:inline">
                        {principle.metric}
                      </span>
                    </div>

                    <p className="mt-2 text-xs sm:text-sm text-[#705e46] leading-relaxed">
                      {principle.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right-Side Dashboard Illustration with Decorative Circular Accent */}
          <div className="lg:col-span-6 relative">
            <div
              aria-hidden="true"
              className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-[#d6b588]/20 blur-xl pointer-events-none -z-10"
            />

            <div className="rounded-2xl bg-white border border-[#e6e2d9] shadow-sm p-6 space-y-5">
              {/* Dynamic View based on selected principle */}
              <div className="flex items-center justify-between border-b border-[#f0ede6] pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#5d674f]" />
                  <span className="text-xs font-semibold text-[#422701]">
                    {activeTab === 'capture' && 'Intake Stream Engine'}
                    {activeTab === 'validate' && 'Exception Surface Inspector'}
                    {activeTab === 'track' && 'Audit & Approval Ledger'}
                  </span>
                </div>
                <span className="text-[11px] text-[#705e46] font-mono">
                  State: Active Validation
                </span>
              </div>

              {activeTab === 'capture' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-[#ece7dc] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-[#422701]">Document Ingest Stream</span>
                      <span className="text-[10px] text-[#5d674f]">Format: Vector PDF</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-[#705e46]">
                      <div className="flex justify-between">
                        <span>Payload source:</span>
                        <span className="font-mono text-[#422701]">invoices@ap.company.com</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Header extracted:</span>
                        <span className="font-semibold text-[#422701]">Apex Industrial Machining</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Document ID:</span>
                        <span className="font-mono text-[#422701]">AIM-40192</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#5d674f]/5 border border-[#5d674f]/20 text-xs text-[#5d674f]">
                    Normalized into structured schema without loss of original line coordinates.
                  </div>
                </div>
              )}

              {activeTab === 'validate' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-[#ece7dc] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#422701]">Automated Rule Evaluation</span>
                      <span className="text-[11px] text-[#a45422] bg-[#fbf0ea] px-2 py-0.5 rounded font-medium">
                        1 Exception Highlighted
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-white border border-[#e6e2d9]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#5d674f] mt-1.5 shrink-0" />
                        <div>
                          <div className="font-medium text-[#422701]">Purchase Order Match</div>
                          <div className="text-[11px] text-[#705e46]">PO-77401 matches line descriptions</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 p-2 rounded-lg bg-[#fff9f5] border border-[#e8cbb7]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#a45422] mt-1.5 shrink-0" />
                        <div>
                          <div className="font-medium text-[#a45422]">Tax Differential Warning</div>
                          <div className="text-[11px] text-[#705e46]">
                            Stated $2,642.00 vs expected $2,607.00 (+$35.00 delta)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'track' && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-[#ece7dc] space-y-2.5">
                    <div className="text-xs font-semibold text-[#422701]">Stage Tracking</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[#705e46]">
                        <span>01 Intake & Extraction</span>
                        <span className="text-[#5d674f] font-medium">Complete</span>
                      </div>
                      <div className="flex items-center justify-between text-[#705e46]">
                        <span>02 Exception Verification</span>
                        <span className="text-[#a45422] font-medium">Under AP Review</span>
                      </div>
                      <div className="flex items-center justify-between text-[#705e46]">
                        <span>03 General Ledger Export</span>
                        <span className="text-[#705e46]">Pending Sign-off</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-[#705e46]">
                    Deterministic record state prevents double payment and maintains full compliance log.
                  </div>
                </div>
              )}

              {/* Footer preview note */}
              <div className="pt-3 border-t border-[#f0ede6] flex items-center justify-between text-xs text-[#705e46]">
                <span>Demonstration Mode</span>
                <span className="font-mono text-[11px]">LedgerPilot v1.2</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
