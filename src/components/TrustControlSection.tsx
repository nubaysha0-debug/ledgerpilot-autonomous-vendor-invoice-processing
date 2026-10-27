import React from 'react';
import { Eye, ShieldAlert, UserCheck } from 'lucide-react';

export const TrustControlSection: React.FC = () => {
  const blocks = [
    {
      title: 'Transparent Status',
      icon: Eye,
      heading: 'Every stage and confidence metric kept in clear sight.',
      body:
        'LedgerPilot preserves an uninterrupted inspection log. See which fields were extracted autonomously, the exact document coordinates they map to, and the historical record of every status transition.',
    },
    {
      title: 'Exception Awareness',
      icon: ShieldAlert,
      heading: 'Pre-emptive flag detection before errors leave the queue.',
      body:
        'Instead of discovering arithmetic flaws during end-of-month reconciliations, the system highlights subtotal variances, sales tax rate discrepancies, and unlinked purchase orders the moment documents are parsed.',
    },
    {
      title: 'Human Review',
      icon: UserCheck,
      heading: 'Autonomous extraction with explicit human boundaries.',
      body:
        'We believe autonomy should accelerate accounts payable, not obscure control. Complex line items, high-value thresholds, and exception flags always require conscious authorization from authorized controllers.',
    },
  ];

  return (
    <section className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl space-y-3 mb-16">
          <div className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
            GOVERNANCE & INTEGRITY
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#422701] text-balance">
            Automation with visibility.
          </h2>
          <p className="text-base text-[#705e46] leading-relaxed">
            Eliminating repetitive data entry does not mean sacrificing oversight. LedgerPilot is
            structured around transparent verification and clear human control points.
          </p>
        </div>

        {/* 3 Editorial Blocks */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {blocks.map((block) => {
            const Icon = block.icon;
            return (
              <div
                key={block.title}
                className="rounded-2xl bg-white border border-[#e6e2d9] p-7 flex flex-col justify-between hover:border-[#d6b588] transition-colors shadow-xs"
              >
                <div>
                  <div className="w-10 h-10 rounded-xl bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="text-xs font-semibold text-[#5d674f] uppercase tracking-wider mb-2">
                    {block.title}
                  </div>

                  <h3 className="text-lg font-semibold text-[#422701] mb-3 leading-snug">
                    {block.heading}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#705e46] leading-relaxed">
                    {block.body}
                  </p>
                </div>

                <div className="mt-8 pt-4 border-t border-[#f0ede6] text-[11px] text-[#705e46] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5d674f]" />
                  <span>Auditable operational checkpoint</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
