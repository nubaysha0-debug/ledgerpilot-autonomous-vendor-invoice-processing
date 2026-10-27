import React from 'react';
import { ArrowRight, CheckCircle2, Shield, Laptop, Network } from 'lucide-react';

interface WorkspaceAccessProps {
  onLaunchDemo: () => void;
  onRequestPilot: () => void;
  onInquireEnterprise: () => void;
}

export const WorkspaceAccessSection: React.FC<WorkspaceAccessProps> = ({
  onLaunchDemo,
  onRequestPilot,
  onInquireEnterprise,
}) => {
  return (
    <section id="workspace-access" className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl space-y-3 mb-14">
          <div className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
            DEPLOYMENT & ACCESS
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#422701] text-balance">
            Flexible access for your finance team.
          </h2>
          <p className="text-base text-[#705e46]">
            Whether you want to test the autonomous extraction agent on simulated vendor bills or
            plan a dedicated staging pilot for your operations, select the model that fits your schedule.
          </p>
        </div>

        {/* 3-Column Workspace Option Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {/* Card 1: Explore Demo */}
          <div className="rounded-2xl bg-white border border-[#e6e2d9] p-7 flex flex-col justify-between hover:border-[#d6b588] transition-colors shadow-xs">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center mb-5">
                <Laptop className="w-5 h-5" />
              </div>

              <div className="text-xs font-semibold text-[#5d674f] uppercase tracking-wider mb-1">
                Immediate Evaluation
              </div>
              <h3 className="text-xl font-semibold text-[#422701] mb-2">
                Explore Demo
              </h3>
              <p className="text-xs sm:text-sm text-[#705e46] leading-relaxed mb-6">
                Experience the invoice workflow using sample data.
              </p>

              <div className="space-y-2.5 text-xs text-[#705e46] border-t border-[#f0ede6] pt-4 mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>Pre-loaded sample vendor invoices</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>Interactive extraction & tax checks</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>No login or cloud setup needed</span>
                </div>
              </div>
            </div>

            <button
              onClick={onLaunchDemo}
              className="w-full py-3 px-4 text-xs sm:text-sm font-medium text-[#422701] bg-[#ece8df] hover:bg-[#e2ddd1] border border-[#d6b588]/40 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>Launch Demo</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: Team Pilot (Highlighted) */}
          <div className="rounded-2xl bg-white border-2 border-[#5d674f] p-7 flex flex-col justify-between shadow-sm relative">
            {/* Organic badge */}
            <div className="absolute -top-3.5 right-6 bg-[#5d674f] text-white text-[11px] font-semibold px-3 py-0.5 rounded-full tracking-wide">
              Recommended Pilot
            </div>

            <div>
              <div className="w-10 h-10 rounded-xl bg-[#5d674f] text-white flex items-center justify-center mb-5">
                <Shield className="w-5 h-5" />
              </div>

              <div className="text-xs font-semibold text-[#5d674f] uppercase tracking-wider mb-1">
                Staged Onboarding
              </div>
              <h3 className="text-xl font-semibold text-[#422701] mb-2">
                Team Pilot
              </h3>
              <p className="text-xs sm:text-sm text-[#705e46] leading-relaxed mb-6">
                Deploy LedgerPilot in a dedicated testing environment for your finance operations.
              </p>

              <div className="space-y-2.5 text-xs text-[#705e46] border-t border-[#f0ede6] pt-4 mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>Custom vendor catalog and PO tolerance rules</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>Dedicated staging inbox and webhooks</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>Exception triage workflow tailored for AP</span>
                </div>
              </div>
            </div>

            <button
              onClick={onRequestPilot}
              className="w-full py-3 px-4 text-xs sm:text-sm font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              <span>Request Pilot Access</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 3: Enterprise Integration */}
          <div className="rounded-2xl bg-white border border-[#e6e2d9] p-7 flex flex-col justify-between hover:border-[#d6b588] transition-colors shadow-xs">
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center mb-5">
                <Network className="w-5 h-5" />
              </div>

              <div className="text-xs font-semibold text-[#5d674f] uppercase tracking-wider mb-1">
                System Connectivity
              </div>
              <h3 className="text-xl font-semibold text-[#422701] mb-2">
                Enterprise Integration
              </h3>
              <p className="text-xs sm:text-sm text-[#705e46] leading-relaxed mb-6">
                Custom ERP/accounting connectors and private infrastructure review.
              </p>

              <div className="space-y-2.5 text-xs text-[#705e46] border-t border-[#f0ede6] pt-4 mb-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>ERP bi-directional sync (NetSuite, SAP, Workday)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>Custom security, tenant isolation & VPC deployment</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#5d674f] shrink-0" />
                  <span>Multi-entity subsidiaries and currency support</span>
                </div>
              </div>
            </div>

            <button
              onClick={onInquireEnterprise}
              className="w-full py-3 px-4 text-xs sm:text-sm font-medium text-[#422701] bg-[#ece8df] hover:bg-[#e2ddd1] border border-[#d6b588]/40 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <span>Inquire with Solutions</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
