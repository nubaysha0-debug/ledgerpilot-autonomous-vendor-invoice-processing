import React, { useRef } from 'react';
import { FileUp, ScanText, ShieldCheck, GitFork, ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';

interface CoreFeaturesProps {
  onOpenUpload: () => void;
  onOpenDashboard: (statusFilter?: string) => void;
}

export const CoreFeaturesSection: React.FC<CoreFeaturesProps> = ({ onOpenUpload, onOpenDashboard }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 340;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const featureCards = [
    {
      id: 'intake',
      title: 'Intelligent Invoice Intake',
      icon: FileUp,
      copy: 'Bring invoice documents into one organized workflow.',
      description:
        'Eliminate disconnected attachments and manual folder sorting. Centralize every incoming vendor bill into a unified queue with automated duplicate detection.',
      cta: 'Explore Intake',
      onClick: () => onOpenUpload(),
    },
    {
      id: 'extraction',
      title: 'Structured Data Extraction',
      icon: ScanText,
      copy: 'Turn available invoice information into structured, reviewable fields.',
      description:
        'Transform PDF tables and scans into high-fidelity financial JSON records. Automatically capture line-level details, unit prices, tax identifiers, and remittance coordinates.',
      cta: 'View Extraction',
      onClick: () => onOpenDashboard('Processing'),
    },
    {
      id: 'validation',
      title: 'Validation & Exceptions',
      icon: ShieldCheck,
      copy: 'Highlight missing information and potential inconsistencies before further processing.',
      description:
        'Smart mathematical checks evaluate subtotal additions, jurisdictional sales taxes, and purchase order cross-referencing to isolate exceptions before ERP posting.',
      cta: 'Review Checks',
      onClick: () => onOpenDashboard('Needs Attention'),
    },
    {
      id: 'approval',
      title: 'Approval & Status Tracking',
      icon: GitFork,
      copy: 'Understand where an invoice stands and which action is required next.',
      description:
        'Clear status queues for accounts payable teams, department heads, and controllers. Prevent bottlenecked disbursements with transparent stage auditing.',
      cta: 'Track Invoices',
      onClick: () => onOpenDashboard('Pending Review'),
    },
  ];

  return (
    <section id="features" className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top Header & Horizontal Controls */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl space-y-3">
            <div className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
              PLATFORM CAPABILITIES
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#422701] text-balance">
              Everything your invoice workflow needs.
            </h2>
            <p className="text-base text-[#705e46]">
              Modular tools built specifically for modern accounts payable teams to capture, verify,
              and process payables with complete precision.
            </p>
          </div>

          {/* Operational Left / Right Navigation Buttons */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => scroll('left')}
              aria-label="Scroll features left"
              className="p-3 rounded-xl bg-white border border-[#e6e2d9] text-[#705e46] hover:text-[#422701] hover:border-[#d6b588] hover:bg-[#faf9f6] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              aria-label="Scroll features right"
              className="p-3 rounded-xl bg-white border border-[#e6e2d9] text-[#705e46] hover:text-[#422701] hover:border-[#d6b588] hover:bg-[#faf9f6] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Horizontally scrollable container using snap-x snap-mandatory with .no-scrollbar */}
        <div
          ref={scrollContainerRef}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-4 pt-1"
        >
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                className="w-[85vw] sm:w-[360px] lg:w-[380px] shrink-0 snap-start rounded-2xl bg-white border border-[#e6e2d9] p-7 flex flex-col justify-between transition-all duration-200 hover:scale-[1.01] hover:border-[#d6b588] hover:shadow-xs group"
              >
                <div>
                  {/* Icon badge */}
                  <div className="w-12 h-12 rounded-xl bg-[#5d674f]/10 text-[#5d674f] flex items-center justify-center mb-6 group-hover:bg-[#5d674f] group-hover:text-white transition-colors duration-200">
                    <Icon className="w-6 h-6" />
                  </div>

                  {/* Title & Copy */}
                  <h3 className="text-lg font-semibold text-[#422701] mb-2 tracking-tight">
                    {card.title}
                  </h3>
                  <p className="text-sm font-medium text-[#5d674f] mb-3">
                    "{card.copy}"
                  </p>
                  <p className="text-xs sm:text-sm text-[#705e46] leading-relaxed">
                    {card.description}
                  </p>
                </div>

                {/* Card CTA */}
                <div className="mt-8 pt-5 border-t border-[#f0ede6]">
                  <button
                    onClick={card.onClick}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5d674f] group-hover:text-[#422701] transition-colors focus:outline-none"
                  >
                    <span>{card.cta}</span>
                    <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
