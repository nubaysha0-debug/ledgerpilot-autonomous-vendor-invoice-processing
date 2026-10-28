import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldCheck,
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

export function SimulatedStamp({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-lp-neutral-border bg-lp-neutral-wash px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-lp-neutral',
        className,
      )}
    >
      <ShieldCheck className="h-3 w-3" />
      SIMULATED — no money transferred
    </span>
  );
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
  'Needs review': 'border-lp-warning-border bg-lp-warning-wash text-lp-warning',
  'Ready for approval': 'border-lp-neutral-border bg-lp-neutral-wash text-lp-ink-muted',
  'Pending approval': 'border-lp-info-border bg-lp-info-wash text-lp-info',
  Approved: 'border-lp-success-border bg-lp-success-wash text-lp-success',
  'Part-paid': 'border-lp-teal-border bg-lp-teal-wash text-lp-teal',
  Paid: 'border-lp-neutral-border bg-lp-neutral-wash text-lp-neutral',
  Rejected: 'border-lp-danger-border bg-lp-danger-wash text-lp-danger',
  'Payment failed': 'border-lp-danger-border bg-lp-danger-wash text-lp-danger',
  'Approval stale': 'border-lp-warning-border bg-lp-warning-wash text-lp-warning',
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium',
        INVOICE_STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  pending_approval: 'border-lp-info-border bg-lp-info-wash text-lp-info',
  approved: 'border-lp-success-border bg-lp-success-wash text-lp-success',
  failed: 'border-lp-danger-border bg-lp-danger-wash text-lp-danger',
  simulated: 'border-lp-neutral-border bg-lp-neutral-wash text-lp-neutral',
  rejected: 'border-lp-danger-border bg-lp-danger-wash text-lp-danger',
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
    wrap: 'border-lp-success-border bg-lp-success-wash text-lp-success',
    icon: <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-lp-success" />,
  },
  warn: {
    wrap: 'border-lp-warning-border bg-lp-warning-wash text-lp-warning',
    icon: <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-lp-warning" />,
  },
  fail: {
    wrap: 'border-lp-danger-border bg-lp-danger-wash text-lp-danger',
    icon: <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-lp-danger" />,
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
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-lp-danger">
        <XCircle className="h-3.5 w-3.5" />
        {failures} blocking
      </span>
    );
  }
  if (warnings > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-lp-warning">
        <AlertTriangle className="h-3.5 w-3.5" />
        {warnings} warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-lp-success">
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
        'rounded-xl border border-lp-line bg-white shadow-[0_1px_2px_rgba(43,33,24,0.05)]',
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
        <h2 className="text-[15px] font-semibold tracking-tight text-lp-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12px] text-lp-ink-muted">{subtitle}</p> : null}
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
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-lp-surface-sunken text-lp-ink-muted">
        <Info className="h-5 w-5" />
      </div>
      <p className="text-[13px] font-semibold text-lp-ink">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-lp-ink-muted">{description}</p>
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
        'inline-flex items-center justify-center rounded-full bg-lp-primary font-semibold text-white',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-lp-overlay/45 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-lp-line bg-white shadow-[0_18px_60px_rgba(43,33,24,0.22)]',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-lp-line-soft px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-lp-ink">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-[12px] text-lp-ink-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-lp-ink-muted transition-colors hover:bg-lp-surface-sunken hover:text-lp-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-lp-line-soft bg-lp-surface-muted px-5 py-3.5">{footer}</div>
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
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-lp-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-lp-primary text-white hover:bg-lp-primary-hover',
    secondary:
      'border border-lp-line-strong bg-white text-lp-ink hover:border-lp-line-strong hover:bg-lp-surface-muted',
    ghost: 'text-lp-ink-muted hover:bg-lp-surface-sunken hover:text-lp-ink',
    danger: 'bg-lp-danger text-white hover:bg-lp-danger',
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
      <p className="text-[13px] leading-relaxed text-lp-ink">{state.body}</p>
      {state.detail ? (
        <div className="mt-3 rounded-lg border border-lp-line bg-lp-surface-muted p-3 text-[11.5px] leading-relaxed text-lp-ink-muted">
          {state.detail}
        </div>
      ) : null}
      {state.note === null ? null : (
        <p className="mt-4 rounded-lg border border-lp-warning-border bg-lp-warning-wash p-3 text-[11.5px] text-lp-warning">
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
      <label className="block text-[12px] font-medium text-lp-ink" htmlFor="reject-reason">
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
        className="mt-1.5 w-full resize-none rounded-lg border border-lp-line-strong bg-white px-3 py-2 text-[12.5px] text-lp-ink outline-none focus:border-lp-primary focus:ring-1 focus:ring-lp-primary"
      />
      {error ? <p className="mt-1 text-[11.5px] text-lp-danger">{error}</p> : null}
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
      ? 'border-lp-danger-border bg-lp-danger-wash text-lp-danger'
      : toast.tone === 'success'
        ? 'border-lp-success-border bg-lp-success-wash text-lp-success'
        : 'border-lp-info-border bg-lp-info-wash text-lp-info';
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] max-w-sm">
      <div className={cn('rounded-lg border px-4 py-3 shadow-lg', tone)}>
        <p className="text-[12.5px] font-medium">{toast.message}</p>
        {toast.detail ? <p className="mt-0.5 text-[11.5px] opacity-80">{toast.detail}</p> : null}
      </div>
    </div>
  );
}
