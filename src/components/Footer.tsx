import React from 'react';
import { ArrowUp } from 'lucide-react';

export const Footer: React.FC = () => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="border-t border-[#e6e2d9] bg-[#f5f4f0] text-[#705e46] py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
          {/* Brand Info */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#5d674f] flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#f5f4f0]" />
              </div>
              <span className="font-semibold text-lg text-[#422701]">LedgerPilot</span>
            </div>

            <p className="text-xs text-[#705e46] max-w-sm leading-relaxed">
              Autonomous vendor invoice processing platform for finance teams: intake,
              structured extraction, exception validation, and accounts payable workflow tracking.
            </p>

            <div className="text-[11px] text-[#705e46] pt-1">
              &copy; {new Date().getFullYear()} LedgerPilot Systems. All rights reserved.
            </div>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3 space-y-2.5 text-xs">
            <div className="font-semibold text-[#422701] uppercase tracking-wider text-[11px] mb-3">
              Platform
            </div>
            <div>
              <a href="#overview" className="hover:text-[#422701] transition-colors">
                Overview
              </a>
            </div>
            <div>
              <a href="#how-it-works" className="hover:text-[#422701] transition-colors">
                How It Works
              </a>
            </div>
            <div>
              <a href="#features" className="hover:text-[#422701] transition-colors">
                Core Features
              </a>
            </div>
            <div>
              <a href="#dashboard" className="hover:text-[#422701] transition-colors">
                Interactive Dashboard
              </a>
            </div>
            <div>
              <a href="#workspace-access" className="hover:text-[#422701] transition-colors">
                Workspace Access
              </a>
            </div>
          </div>

          {/* Governance & Back to top */}
          <div className="md:col-span-4 space-y-4 text-xs">
            <div className="font-semibold text-[#422701] uppercase tracking-wider text-[11px]">
              Governance & Integrity
            </div>
            <p className="text-xs text-[#705e46] leading-relaxed">
              Designed with strict human review thresholds for high-volume accounts payable. All
              data extracted via transparent OCR models with persistent document coordinates.
            </p>

            <div className="pt-2">
              <button
                onClick={scrollToTop}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5d674f] hover:text-[#422701] transition-colors"
              >
                <span>Back to top</span>
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
