import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Upload,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  FileText,
  SlidersHorizontal,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { Invoice, InvoiceStatus } from '../types/invoice';

interface DashboardPreviewProps {
  invoices: Invoice[];
  onSelectInvoice: (invoice: Invoice) => void;
  onOpenUpload: () => void;
  onResetData: () => void;
  activeStatusFilter: string;
  onStatusFilterChange: (status: string) => void;
}

export const DashboardPreviewSection: React.FC<DashboardPreviewProps> = ({
  invoices,
  onSelectInvoice,
  onOpenUpload,
  onResetData,
  activeStatusFilter,
  onStatusFilterChange,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllRows, setShowAllRows] = useState(false);
  const [sortField, setSortField] = useState<'amount' | 'issueDate' | 'vendor'>('issueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Compute summary stats dynamically
  const stats = useMemo(() => {
    const total = invoices.length;
    const pendingReview = invoices.filter((i) => i.status === 'Pending Review').length;
    const needsAttention = invoices.filter((i) => i.status === 'Needs Attention').length;
    const processed = invoices.filter((i) => i.status === 'Processed' || i.status === 'Approved').length;
    const totalValue = invoices.reduce((acc, curr) => acc + curr.amount, 0);

    return { total, pendingReview, needsAttention, processed, totalValue };
  }, [invoices]);

  // Filter and sort invoices
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        const matchesStatus =
          activeStatusFilter === 'All' || inv.status === activeStatusFilter;
        const query = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !query ||
          inv.vendor.toLowerCase().includes(query) ||
          inv.invoiceNumber.toLowerCase().includes(query) ||
          inv.id.toLowerCase().includes(query) ||
          (inv.poNumber && inv.poNumber.toLowerCase().includes(query));

        return matchesStatus && matchesQuery;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortField === 'amount') {
          comp = a.amount - b.amount;
        } else if (sortField === 'issueDate') {
          comp = new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime();
        } else {
          comp = a.vendor.localeCompare(b.vendor);
        }
        return sortDirection === 'asc' ? comp : -comp;
      });
  }, [invoices, activeStatusFilter, searchQuery, sortField, sortDirection]);

  // Handle row limit toggle
  const visibleInvoices = showAllRows
    ? filteredInvoices
    : filteredInvoices.slice(0, 5);

  const toggleSort = (field: 'amount' | 'issueDate' | 'vendor') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Status badge styling helper (accessible, muted tone colors)
  const renderStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'Needs Attention':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#fcf0e8] text-[#a45422] border border-[#f0d4c2]">
            <AlertTriangle className="w-3 h-3 text-[#a45422]" />
            Needs Attention
          </span>
        );
      case 'Pending Review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#f5f0e6] text-[#785b30] border border-[#e8ddcb]">
            <Clock className="w-3 h-3 text-[#785b30]" />
            Pending Review
          </span>
        );
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#edf2e8] text-[#3f5732] border border-[#d2e0ca]">
            <CheckCircle2 className="w-3 h-3 text-[#3f5732]" />
            Approved
          </span>
        );
      case 'Processed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#eef1ed] text-[#4b543f] border border-[#d6ddd4]">
            <CheckCircle2 className="w-3 h-3 text-[#4b543f]" />
            Processed
          </span>
        );
      case 'Processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#f2f0ea] text-[#6b5d49] border border-[#ded9ce]">
            <RefreshCw className="w-3 h-3 text-[#6b5d49] animate-spin" />
            Processing
          </span>
        );
      case 'Received':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#f0ede6] text-[#705e46] border border-[#e2ddd3]">
            <FileText className="w-3 h-3 text-[#705e46]" />
            Received
          </span>
        );
    }
  };

  const statusFilterTabs = [
    'All',
    'Pending Review',
    'Needs Attention',
    'Approved',
    'Processed',
    'Received',
  ];

  return (
    <section id="dashboard" className="py-20 md:py-28 border-t border-[#e6e2d9] bg-[#f5f4f0] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-[#5d674f] uppercase">
                ACCOUNTS PAYABLE CONSOLE
              </span>
              <span className="text-[11px] text-[#705e46] bg-[#ede8dc] border border-[#ded8cb] px-2 py-0.5 rounded">
                Demo Workspace
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-[#422701] text-balance">
              Your invoice workflow, at a glance.
            </h2>
            <p className="text-base text-[#705e46] max-w-2xl">
              Inspect extracted entity records, monitor validation states, and review payment
              approvals in real-time.
            </p>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <button
              onClick={onResetData}
              title="Reset mock invoice data"
              className="p-2.5 rounded-lg bg-white border border-[#e6e2d9] text-[#705e46] hover:text-[#422701] hover:bg-[#faf9f6] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={onOpenUpload}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-white bg-[#5d674f] hover:bg-[#4b543f] rounded-lg transition-colors shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Invoice</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Cards (clearly labeled as Demo Data) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          {/* Card 1: Total Invoices */}
          <div className="rounded-xl bg-white border border-[#e6e2d9] p-5 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[#705e46] mb-2">
              <span className="font-medium">Total Invoices</span>
              <span className="text-[10px] text-[#705e46]/80 font-mono">Demo Data</span>
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-[#422701] font-mono tabular-nums">
              {stats.total}
            </div>
            <div className="mt-2 text-[11px] text-[#705e46] flex items-center gap-1 font-mono tabular-nums">
              <span>Total queue value:</span>
              <span className="font-semibold text-[#422701]">
                ${stats.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Card 2: Pending Review */}
          <div
            onClick={() => onStatusFilterChange('Pending Review')}
            role="button"
            tabIndex={0}
            className="rounded-xl bg-white border border-[#e6e2d9] p-5 shadow-xs cursor-pointer hover:border-[#d6b588] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
          >
            <div className="flex items-center justify-between text-xs text-[#785b30] mb-2">
              <span className="font-medium">Pending Review</span>
              <span className="text-[10px] text-[#705e46]/80 font-mono">Demo Data</span>
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-[#785b30] font-mono tabular-nums">
              {stats.pendingReview}
            </div>
            <div className="mt-2 text-[11px] text-[#705e46]">
              Awaiting controller or department sign-off
            </div>
          </div>

          {/* Card 3: Needs Attention */}
          <div
            onClick={() => onStatusFilterChange('Needs Attention')}
            role="button"
            tabIndex={0}
            className="rounded-xl bg-white border border-[#e6e2d9] p-5 shadow-xs cursor-pointer hover:border-[#a45422]/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
          >
            <div className="flex items-center justify-between text-xs text-[#a45422] mb-2">
              <span className="font-medium">Needs Attention</span>
              <span className="text-[10px] text-[#705e46]/80 font-mono">Demo Data</span>
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-[#a45422] font-mono tabular-nums">
              {stats.needsAttention}
            </div>
            <div className="mt-2 text-[11px] text-[#a45422]">
              Tax mismatches or missing POs surfaced
            </div>
          </div>

          {/* Card 4: Processed / Approved */}
          <div
            onClick={() => onStatusFilterChange('Processed')}
            role="button"
            tabIndex={0}
            className="rounded-xl bg-white border border-[#e6e2d9] p-5 shadow-xs cursor-pointer hover:border-[#5d674f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5d674f]"
          >
            <div className="flex items-center justify-between text-xs text-[#4b543f] mb-2">
              <span className="font-medium">Processed & Approved</span>
              <span className="text-[10px] text-[#705e46]/80 font-mono">Demo Data</span>
            </div>
            <div className="text-2xl sm:text-3xl font-semibold text-[#4b543f] font-mono tabular-nums">
              {stats.processed}
            </div>
            <div className="mt-2 text-[11px] text-[#705e46]">
              Disbursed or reconciled with ledger
            </div>
          </div>
        </div>

        {/* Table Workspace Container */}
        <div className="rounded-2xl bg-white border border-[#e6e2d9] shadow-sm overflow-hidden">
          {/* Controls Bar: Search & Status Filters */}
          <div className="p-4 sm:p-5 border-b border-[#f0ede6] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 text-[#705e46] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search vendor, invoice #, PO..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-[#faf9f6] border border-[#e6e2d9] rounded-lg text-[#422701] placeholder-[#705e46]/60 focus:outline-none focus:border-[#5d674f] focus:ring-1 focus:ring-[#5d674f] transition-colors"
              />
            </div>

            {/* Status Filter Buttons (Segmented Controls) */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {statusFilterTabs.map((tab) => {
                const isActive = activeStatusFilter === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => onStatusFilterChange(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-[#5d674f] text-white shadow-xs'
                        : 'bg-[#faf9f6] text-[#705e46] hover:bg-[#ede8dc] hover:text-[#422701]'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* High-Density Data Grid / Invoice Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#f0ede6] bg-[#faf9f6] text-[11px] font-semibold text-[#705e46] uppercase tracking-wider">
                  <th className="py-3 px-4 sm:px-6">Invoice</th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-[#422701]"
                    onClick={() => toggleSort('vendor')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Vendor</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 cursor-pointer hover:text-[#422701]"
                    onClick={() => toggleSort('issueDate')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th
                    className="py-3 px-4 text-right cursor-pointer hover:text-[#422701]"
                    onClick={() => toggleSort('amount')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Amount</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#f0ede6] text-xs">
                {visibleInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#705e46]">
                      <p className="text-sm font-medium text-[#422701] mb-1">No matching invoices found</p>
                      <p className="text-xs">Try clearing the search query or changing the status filter.</p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          onStatusFilterChange('All');
                        }}
                        className="mt-3 text-xs font-semibold text-[#5d674f] hover:underline"
                      >
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  visibleInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => onSelectInvoice(inv)}
                      className="hover:bg-[#faf9f6] transition-colors cursor-pointer group"
                    >
                      {/* Invoice Identifier */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="font-mono font-medium text-[#422701] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#5d674f] opacity-70 group-hover:opacity-100" />
                          <span>{inv.invoiceNumber}</span>
                        </div>
                        <div className="text-[10px] text-[#705e46] font-mono mt-0.5">
                          {inv.id} {inv.poNumber && `· ${inv.poNumber}`}
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-[#422701]">{inv.vendor}</div>
                        <div className="text-[11px] text-[#705e46]">{inv.vendorCategory}</div>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 font-mono text-[#705e46] tabular-nums whitespace-nowrap">
                        <div>{inv.issueDate}</div>
                        <div className="text-[10px] text-[#705e46]/80">Due {inv.dueDate}</div>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-[#422701] tabular-nums whitespace-nowrap">
                        ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <div className="text-[10px] text-[#705e46] font-normal font-sans">
                          {inv.lineItems.length} {inv.lineItems.length === 1 ? 'line item' : 'line items'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(inv.status)}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectInvoice(inv);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#5d674f] hover:text-white hover:bg-[#5d674f] border border-[#5d674f]/30 rounded-md transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{inv.status === 'Needs Attention' ? 'Review' : 'View'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer: Pagination & Toggle All Rows */}
          <div className="p-4 sm:p-5 border-t border-[#f0ede6] bg-[#faf9f6] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#705e46]">
            <div>
              Showing <span className="font-semibold text-[#422701] font-mono tabular-nums">{visibleInvoices.length}</span> of{' '}
              <span className="font-semibold text-[#422701] font-mono tabular-nums">{filteredInvoices.length}</span> records
              {filteredInvoices.length !== invoices.length && (
                <span> (filtered from {invoices.length} total)</span>
              )}
            </div>

            {filteredInvoices.length > 5 && (
              <button
                onClick={() => setShowAllRows((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#5d674f] hover:text-[#422701] hover:underline"
              >
                <span>{showAllRows ? 'Show Fewer Invoices' : 'View All Invoices'}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showAllRows ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
