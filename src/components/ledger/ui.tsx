import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import type {
  Check,
  CheckStatus,
  InvoiceStatus,
  PaymentStatus,
} from '../../ledger/types';
import { formatINR } from '../../ledger/money';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function Money({
  paise,
  className,
  decimals = 2,
}: {
  paise: number;
  className?: string;
  decimals?: 0 | 2;
}) {
  return (
    <span className={cn('lp-num tabular-nums', className)}>
      {formatINR(paise, decimals)}
    </span>
  );
}

const INVOICE_STATUS_STYLES: Record<InvoiceStatus, string> = {
  'Needs review': 'border-[#efd7ad] bg-[#fdf4e5] text-[#8a4d0c]',
  'Ready for approval': 'border-[#d9ded8] bg-[#f3f5f2] text-[#4e5a52]',
  'Pending approval': 'border-[#c9dced] bg-[#eef5fb] text-[#245b89]',
  Approved: 'border-[#c7ddce] bg-[#edf6ef] text-[#1f5c45]',
  'Part-paid': 'border-[#c7dedc] bg-[#edf7f5] text-[#17645c]',
  Paid: 'border-[#d9ded8] bg-[#f3f5f2] text-[#52605a]',
  Rejected: 'border-[#efc9c5] bg-[#fbeceb] text-[#a3261f]',
  'Payment failed': 'border-[#efc9c5] bg-[#fbeceb] text-[#a3261f]',
  'Approval stale': 'border-[#efd0b2] bg-[#fdf1e5] text-[#9a4a0d]',
};

const INVOICE_STATUS_DOTS: Record<InvoiceStatus, string> = {
  'Needs review': 'bg-[#c57a1c]',
  'Ready for approval': 'bg-[#7b8780]',
  'Pending approval': 'bg-[#2b6fa8]',
  Approved: 'bg-[#1f7a56]',
  'Part-paid': 'bg-[#177a70]',
  Paid: 'bg-[#68756e]',
  Rejected: 'bg-[#b3261e]',
  'Payment failed': 'bg-[#b3261e]',
  'Approval stale': 'bg-[#b85c12]',
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium',
        INVOICE_STATUS_STYLES[status],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', INVOICE_STATUS_DOTS[status])} />
      {status}
    </span>
  );
}

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  pending_approval: 'border-[#c9dced] bg-[#eef5fb] text-[#245b89]',
  approved: 'border-[#c7ddce] bg-[#edf6ef] text-[#1f5c45]',
  failed: 'border-[#efc9c5] bg-[#fbeceb] text-[#a3261f]',
  simulated: 'border-[#d9ded8] bg-[#f3f5f2] text-[#52605a]',
  rejected: 'border-[#efc9c5] bg-[#fbeceb] text-[#a3261f]',
};

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'pending_approval':
      return 'Awaiting approval';
    case 'approved':
      return 'Approved';
    case 'failed':
      return 'Failed';
    case 'simulated':
      return 'Simulated';
    case 'rejected':
      return 'Rejected';
  }
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium',
        PAYMENT_STATUS_STYLES[status],
      )}
    >
      {paymentStatusLabel(status)}
    </span>
  );
}

const CHECK_STYLES: Record<CheckStatus, { wrap: string; icon: ReactNode }> = {
  pass: {
    wrap: 'border-[#dbe6dd] bg-[#f7faf7] text-[#315b42]',
    icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f7a54]" />,
  },
  warn: {
    wrap: 'border-[#efd7ad] bg-[#fdf8ee] text-[#7a4a12]',
    icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b26a12]" />,
  },
  fail: {
    wrap: 'border-[#efc9c5] bg-[#fdf4f3] text-[#8f2a23]',
    icon: <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#b3261e]" />,
  },
};

export function CheckRow({ check }: { check: Check }) {
  const style = CHECK_STYLES[check.status];
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border p-3', style.wrap)}>
      {style.icon}
      <div className="min-w-0">
        <div className="text-[12px] font-semibold">{check.label}</div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed opacity-90">{check.evidence}</p>
      </div>
    </div>
  );
}

export function CheckSummary({ checks }: { checks: Check[] }) {
  const failures = checks.filter((check) => check.status === 'fail').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;
  if (failures > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#a3261f]">
        <XCircle className="h-3.5 w-3.5" />
        {failures} blocking
      </span>
    );
  }
  if (warnings > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#9a4a0d]">
        <AlertTriangle className="h-3.5 w-3.5" />
        {warnings} warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2f7a54]">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Checks pass
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[#e2e0d8] bg-white shadow-[0_1px_2px_rgba(28,36,32,0.04)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-[#1c2420]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12px] text-[#66706a]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f2ed] text-[#66706a]">
        <Info className="h-5 w-5" />
      </div>
      <p className="text-[13px] font-semibold text-[#1c2420]">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[#66706a]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Avatar({
  initials,
  name,
  size = 'md',
}: {
  initials: string;
  name?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-[#1f5c45] font-semibold text-white',
        size === 'sm' ? 'h-6 w-6 text-[9px]' : 'h-8 w-8 text-[11px]',
      )}
    >
      {initials}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#101512]/45 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-[#e2e0d8] bg-white shadow-[0_18px_60px_rgba(15,23,18,0.22)]',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#eeede8] px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#1c2420]">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-[12px] text-[#66706a]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-[#66706a] transition-colors hover:bg-[#f3f2ed] hover:text-[#1c2420]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-[#eeede8] bg-[#fafaf7] px-5 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5c45] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-[#1f5c45] text-white hover:bg-[#184a37]',
    secondary:
      'border border-[#d9d7ce] bg-white text-[#1c2420] hover:border-[#b9b7ac] hover:bg-[#f8f7f3]',
    ghost: 'text-[#4e5a52] hover:bg-[#f0efe9] hover:text-[#1c2420]',
    danger: 'bg-[#a3261f] text-white hover:bg-[#8b201a]',
  } as const;
  const sizes = {
    sm: 'px-2.5 py-1.5 text-[11.5px]',
    md: 'px-3.5 py-2 text-[12.5px]',
  } as const;

  return (
    <button
      type="button"
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export interface ConfirmState {
  title: string;
  subtitle?: string;
  body: string;
  detail?: string;
  note?: string | null;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
}

export function ConfirmDialog({
  state,
  onClose,
}: {
  state: ConfirmState | null;
  onClose: () => void;
}) {
  if (!state) return null;
  return (
    <Modal
      open={Boolean(state)}
      onClose={onClose}
      title={state.title}
      subtitle={state.subtitle ?? 'Simulated payment control'}
      width="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={state.tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
          >
            {state.confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-[13px] leading-relaxed text-[#3e4742]">{state.body}</p>
      {state.detail ? (
        <div className="mt-3 rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3 text-[11.5px] leading-relaxed text-[#66706a]">
          {state.detail}
        </div>
      ) : null}
      {state.note === null ? null : (
        <p className="mt-4 rounded-lg border border-[#efd7ad] bg-[#fdf8ee] p-3 text-[11.5px] text-[#7a4a12]">
          {state.note ?? 'This is a demo. No money will leave any bank account.'}
        </p>
      )}
    </Modal>
  );
}

export interface ReasonState {
  title: string;
  label: string;
  placeholder: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
}

export function ReasonDialog({
  state,
  onClose,
}: {
  state: ReasonState | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (state) {
      setReason('');
      setError('');
    }
  }, [state]);

  if (!state) return null;

  return (
    <Modal
      open={Boolean(state)}
      onClose={onClose}
      title={state.title}
      subtitle="The reason is written to the audit trail"
      width="max-w-lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!reason.trim()) {
                setError('Enter a reason before continuing.');
                return;
              }
              state.onConfirm(reason.trim());
              onClose();
            }}
          >
            {state.confirmLabel}
          </Button>
        </div>
      }
    >
      <label className="block text-[12px] font-medium text-[#3e4742]" htmlFor="reject-reason">
        {state.label}
      </label>
      <textarea
        id="reject-reason"
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          setError('');
        }}
        placeholder={state.placeholder}
        rows={4}
        className="mt-1.5 w-full resize-none rounded-lg border border-[#d9d7ce] bg-white px-3 py-2 text-[12.5px] text-[#1c2420] outline-none focus:border-[#1f5c45] focus:ring-1 focus:ring-[#1f5c45]"
      />
      {error ? <p className="mt-1 text-[11.5px] text-[#a3261f]">{error}</p> : null}
    </Modal>
  );
}

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastData {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
}

export function ToastView({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  const tone =
    toast.tone === 'error'
      ? 'border-[#efc9c5] bg-[#fdf4f3] text-[#8f2a23]'
      : toast.tone === 'success'
        ? 'border-[#c7ddce] bg-[#f2f9f4] text-[#1f5c45]'
        : 'border-[#c9dced] bg-[#eef5fb] text-[#245b89]';
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] max-w-sm">
      <div className={cn('rounded-lg border px-4 py-3 shadow-lg', tone)}>
        <p className="text-[12.5px] font-medium">{toast.message}</p>
        {toast.detail ? <p className="mt-0.5 text-[11.5px] opacity-80">{toast.detail}</p> : null}
      </div>
    </div>
  );
}
