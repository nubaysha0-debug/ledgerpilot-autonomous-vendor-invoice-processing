import type { Business, Invoice, Vendor } from '../../ledger/types';
import { amountInWords, formatDate, formatINR } from '../../ledger/money';

export function InvoiceDocument({
  invoice,
  vendor,
  business,
}: {
  invoice: Invoice;
  vendor: Vendor;
  business: Business;
}) {
  const isDuplicate = Boolean(invoice.duplicateOf);
  const gstRate = invoice.gstRate ?? 18;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative overflow-hidden rounded-lg border border-[#d9d7ce] bg-white p-5 sm:p-8">
        {isDuplicate ? (
          <div className="pointer-events-none absolute right-6 top-24 rotate-[-14deg] rounded border-2 border-[#b3261e]/40 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-[#b3261e]/50">
            DUPLICATE COPY
          </div>
        ) : null}

        <div className="flex flex-col justify-between gap-5 border-b border-[#e6e4db] pb-5 sm:flex-row">
          <div className="max-w-sm">
            <div className="text-[15px] font-bold tracking-tight text-[#1c2420]">{vendor.name}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-[#66706a]">
              {vendor.address}
              <br />
              {vendor.city}, {vendor.state} {vendor.pincode}
              <br />
              GSTIN: <span className="font-mono">{vendor.gstin}</span>
              <br />
              {vendor.phone} · {vendor.email}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-[18px] font-semibold tracking-[0.08em] text-[#1c2420]">
              TAX INVOICE
            </div>
            <div className="mt-1 font-mono text-[12px] font-semibold text-[#1c2420]">
              {invoice.invoiceNumber}
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-[#66706a]">
              Invoice date: {formatDate(invoice.issueDate)}
              <br />
              Due date: {formatDate(invoice.dueDate)}
              <br />
              Place of supply: {invoice.placeOfSupply}
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-[#e6e4db] py-4 sm:grid-cols-2">
          <div>
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#8a938d]">
              Billed to
            </div>
            <div className="mt-1 text-[12px] font-semibold text-[#1c2420]">{business.name}</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-[#66706a]">
              {business.address}
              <br />
              {business.city}, {business.state} {business.pincode}
              <br />
              GSTIN: <span className="font-mono">{business.gstin}</span>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#8a938d]">
              Reference
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-[#66706a]">
              {invoice.poNumber ? (
                <>
                  Purchase order: <span className="font-mono text-[#1c2420]">{invoice.poNumber}</span>
                  <br />
                </>
              ) : (
                <>
                  Purchase order: <span className="text-[#9a4a0d]">Not provided</span>
                  <br />
                </>
              )}
              {invoice.grnNumber ? (
                <>
                  Goods receipt: <span className="font-mono text-[#1c2420]">{invoice.grnNumber}</span>
                  <br />
                </>
              ) : null}
              Terms: {invoice.termsDays} days
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-y border-[#d9d7ce] bg-[#fafaf7] text-[9.5px] uppercase tracking-[0.08em] text-[#66706a]">
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">HSN/SAC</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-2 py-2 text-right">Taxable</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={line.id} className="border-b border-[#eeede8] text-[11px] text-[#3e4742]">
                  <td className="px-2 py-2 font-mono text-[#8a938d]">{index + 1}</td>
                  <td className="px-2 py-2">{line.description}</td>
                  <td className="px-2 py-2 font-mono text-[10.5px] text-[#66706a]">{line.hsn}</td>
                  <td className="px-2 py-2 text-right font-mono">
                    {line.qty} {line.unit}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">{formatINR(line.ratePaise)}</td>
                  <td className="px-2 py-2 text-right font-mono font-medium text-[#1c2420]">
                    {formatINR(line.totalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col justify-between gap-6 sm:flex-row">
          <div className="max-w-sm text-[10.5px] leading-relaxed text-[#66706a]">
            <div className="font-semibold text-[#3e4742]">Amount in words</div>
            <div className="mt-1">{amountInWords(invoice.statedTotalPaise)}</div>
            <div className="mt-4 font-semibold text-[#3e4742]">Payment details</div>
            <div className="mt-1">
              {vendor.bank.bankName} · {vendor.bank.accountMasked}
              <br />
              IFSC: {vendor.bank.ifsc}
            </div>
          </div>

          <div className="w-full max-w-xs text-[11px] text-[#66706a]">
            <div className="flex justify-between border-b border-[#eeede8] py-1.5">
              <span>Taxable value</span>
              <span className="font-mono text-[#1c2420]">{formatINR(invoice.taxablePaise)}</span>
            </div>
            {invoice.gstType === 'intra' ? (
              <>
                <div className="flex justify-between border-b border-[#eeede8] py-1.5">
                  <span>CGST {gstRate / 2}%</span>
                  <span className="font-mono text-[#1c2420]">{formatINR(invoice.cgstPaise)}</span>
                </div>
                <div className="flex justify-between border-b border-[#eeede8] py-1.5">
                  <span>SGST {gstRate / 2}%</span>
                  <span className="font-mono text-[#1c2420]">{formatINR(invoice.sgstPaise)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between border-b border-[#eeede8] py-1.5">
                <span>IGST {gstRate}%</span>
                <span className="font-mono text-[#1c2420]">{formatINR(invoice.igstPaise)}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-[#eeede8] py-1.5">
              <span>Round off</span>
              <span className="font-mono text-[#1c2420]">{formatINR(invoice.roundOffPaise)}</span>
            </div>
            <div className="flex justify-between border-t-2 border-[#1c2420] py-2 text-[13px] font-semibold text-[#1c2420]">
              <span>Total</span>
              <span className="font-mono">{formatINR(invoice.statedTotalPaise)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between border-t border-[#e6e4db] pt-4">
          <div className="text-[10px] text-[#8a938d]">
            {invoice.importedAt
              ? 'Imported workspace document · not valid for GST filing.'
              : 'Synthetic demo document · not valid for GST filing.'}
          </div>
          <div className="text-right text-[10.5px] text-[#66706a]">
            <div className="mb-6">For {vendor.name}</div>
            <div className="border-t border-[#b9b7ac] pt-1 text-[10px]">Authorised signatory</div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[10.5px] leading-relaxed text-[#8a938d]">
        {invoice.importedAt
          ? 'This document is rendered from CSV fields imported into this browser. Verify the supplier’s original invoice, GSTIN and bank details before paying.'
          : 'This is the document as printed by the vendor. LedgerPilot extracts the fields separately and flags any difference between the printed total and the line arithmetic.'}
      </p>
    </div>
  );
}
