import { useState } from 'react';
import { AlertTriangle, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import type {
  DemoState,
  InvoiceView,
  PaymentMode,
  PaymentRequestInput,
} from '../../ledger/types';
import { formatDate, formatINR, toPaise } from '../../ledger/money';
import { Button, Modal } from './ui';

const MODES: PaymentMode[] = ['NEFT', 'UPI', 'RTGS', 'Cheque', 'Cash'];

export function PaymentDialog({
  state,
  view,
  onClose,
  onSubmit,
}: {
  state: DemoState;
  view: InvoiceView;
  onClose: () => void;
  onSubmit: (input: PaymentRequestInput) => void;
}) {
  const actorName =
    state.team.find((member) => member.role === state.role)?.name ?? 'Accountant';
  const [amount, setAmount] = useState((view.availablePaise / 100).toFixed(2));
  const [mode, setMode] = useState<PaymentMode>('NEFT');
  const [reference, setReference] = useState(
    `NEFT-HDFC-${String(Math.floor(Math.random() * 900000) + 100000)}`,
  );
  const [requestedDate, setRequestedDate] = useState(state.business.asOf.slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const parsedPaise = Math.round(Number(amount.replace(/,/g, '')) * 100);
  const blockedChecks = view.checks.filter((check) => check.status === 'fail');

  const submit = () => {
    setError('');
    if (!Number.isFinite(parsedPaise) || parsedPaise <= 0) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    if (parsedPaise > view.availablePaise) {
      setError(`Amount exceeds the available balance of ${formatINR(view.availablePaise)}.`);
      return;
    }
    if (!reference.trim()) {
      setError('Enter a payment reference.');
      return;
    }
    if (blockedChecks.length > 0) {
      setError('Resolve the blocking exceptions before recording a payment.');
      return;
    }

    try {
      onSubmit({
        invoiceId: view.invoice.id,
        amountPaise: parsedPaise,
        mode,
        reference: reference.trim(),
        requestedDate,
        note: note.trim() || undefined,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'The payment could not be recorded.',
      );
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a payment request"
      subtitle={`${view.invoice.invoiceNumber} · ${view.vendor.name}`}
      width="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10.5px] text-[#8a938d]">
            Recording as {actorName} · approval is a separate step
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={view.availablePaise <= 0}>
              <Wallet className="h-3.5 w-3.5" />
              Record request
            </Button>
          </div>
        </div>
      }
    >
      <div className="rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#8a938d]">
              Available balance
            </div>
            <div className="mt-0.5 font-mono text-[18px] font-semibold text-[#1c2420]">
              {formatINR(view.availablePaise)}
            </div>
          </div>
          <div className="text-right text-[10.5px] leading-relaxed text-[#66706a]">
            Invoice total {formatINR(view.invoice.totalPaise)}
            <br />
            Due {formatDate(view.invoice.dueDate)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-medium text-[#3e4742]">Amount (INR)</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#8a938d]">
              ₹
            </span>
            <input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError('');
              }}
              inputMode="decimal"
              className="w-full rounded-lg border border-[#d9d7ce] bg-white py-2 pl-7 pr-3 font-mono text-[13px] text-[#1c2420] outline-none focus:border-[#1f5c45] focus:ring-1 focus:ring-[#1f5c45]"
            />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10.5px]">
            <button
              type="button"
              onClick={() => setAmount((view.availablePaise / 100).toFixed(2))}
              className="font-medium text-[#1f5c45] hover:underline"
            >
              Use full balance
            </button>
            {view.availablePaise > toPaise(5000) ? (
              <>
                <span className="text-[#d9d7ce]">·</span>
                <button
                  type="button"
                  onClick={() => setAmount('5000.00')}
                  className="font-medium text-[#1f5c45] hover:underline"
                >
                  ₹5,000 part-payment
                </button>
              </>
            ) : null}
          </div>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[#3e4742]">Mode</span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as PaymentMode)}
            className="mt-1 w-full rounded-lg border border-[#d9d7ce] bg-white px-3 py-2 text-[12px] text-[#1c2420] outline-none focus:border-[#1f5c45] focus:ring-1 focus:ring-[#1f5c45]"
          >
            {MODES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[#3e4742]">Reference / UTR</span>
          <input
            value={reference}
            onChange={(event) => {
              setReference(event.target.value);
              setError('');
            }}
            placeholder="NEFT-HDFC-884330"
            className="mt-1 w-full rounded-lg border border-[#d9d7ce] bg-white px-3 py-2 font-mono text-[12px] text-[#1c2420] outline-none focus:border-[#1f5c45] focus:ring-1 focus:ring-[#1f5c45]"
          />
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[#3e4742]">Requested date</span>
          <input
            type="date"
            value={requestedDate}
            onChange={(event) => setRequestedDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[#d9d7ce] bg-white px-3 py-2 text-[12px] text-[#1c2420] outline-none focus:border-[#1f5c45] focus:ring-1 focus:ring-[#1f5c45]"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="text-[11px] font-medium text-[#3e4742]">Note for the approver (optional)</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Part-payment agreed with the vendor by phone."
          className="mt-1 w-full resize-none rounded-lg border border-[#d9d7ce] bg-white px-3 py-2 text-[12px] text-[#1c2420] outline-none focus:border-[#1f5c45] focus:ring-1 focus:ring-[#1f5c45]"
        />
      </label>

      <div className="mt-3 rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-[#3e4742]">
          <Landmark className="h-3.5 w-3.5 text-[#8a938d]" />
          Paying to {view.vendor.bank.bankName} {view.vendor.bank.accountMasked}
        </div>
        <div className="mt-0.5 pl-5 font-mono text-[10.5px] text-[#66706a]">
          IFSC {view.vendor.bank.ifsc}
        </div>
      </div>

      {blockedChecks.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#efc9c5] bg-[#fdf4f3] p-3 text-[11px] leading-relaxed text-[#8f2a23]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This invoice has {blockedChecks.length} blocking exception
            {blockedChecks.length > 1 ? 's' : ''}. Resolve them before a payment can be recorded.
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-[#efc9c5] bg-[#fdf4f3] px-3 py-2 text-[11.5px] text-[#8f2a23]">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-start gap-2 text-[10.5px] leading-relaxed text-[#8a938d]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This creates a request only. Ramesh Patil must approve it, then execute the simulated
        transfer. No money moves.
      </div>
    </Modal>
  );
}
