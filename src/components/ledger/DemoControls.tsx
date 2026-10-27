import { AlertTriangle, Check, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import type { DemoState, Role } from '../../ledger/types';
import { formatDateTime } from '../../ledger/money';
import { Button, Modal, cn } from './ui';

const ROLE_PERMISSIONS: Record<Role, string> = {
  owner: 'Approve, reject, execute, revise and verify bank accounts',
  accountant: 'Record payment requests and review invoices',
  staff: 'View-only access to invoices and payables',
};

export function DemoControls({
  open,
  state,
  onClose,
  onSetRole,
  onToggleForceFailure,
  onReset,
}: {
  open: boolean;
  state: DemoState;
  onClose: () => void;
  onSetRole: (role: Role) => void;
  onToggleForceFailure: () => void;
  onReset: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Demo controls"
      subtitle="Switch the acting user or exercise the failure path"
      width="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset demo data
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="flex items-start gap-2 rounded-lg border border-[#d4e2d8] bg-[#eef5f0] p-3 text-[11px] leading-relaxed text-[#1f5c45]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This console runs on synthetic data. Nothing is sent to a bank, a vendor, or an external
          API. Seeded as of {formatDateTime(state.business.asOf)} IST.
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1c2420]">
          <Users className="h-3.5 w-3.5 text-[#1f5c45]" />
          Acting as
        </div>
        <p className="mt-0.5 text-[11px] text-[#66706a]">
          The role is enforced in the payment actions, not just hidden in the UI.
        </p>
        <div className="mt-2 space-y-1.5">
          {state.team.map((member) => {
            const active = state.role === member.role;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onSetRole(member.role)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                  active
                    ? 'border-[#1f5c45] bg-[#f2f8f4]'
                    : 'border-[#e7e5dc] bg-white hover:border-[#c8c6bb] hover:bg-[#fafaf7]',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    active ? 'bg-[#1f5c45] text-white' : 'bg-[#f1f0ea] text-[#4e5a52]',
                  )}
                >
                  {member.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-[#1c2420]">{member.name}</span>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.06em] text-[#66706a]">
                      {member.role}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-[#66706a]">
                    {ROLE_PERMISSIONS[member.role]}
                  </span>
                </span>
                {active ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1f5c45] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1c2420]">
          <AlertTriangle className="h-3.5 w-3.5 text-[#a15c12]" />
          Failure path
        </div>
        <div className="mt-2 rounded-lg border border-[#e7e5dc] bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11.5px] font-medium text-[#1c2420]">
                Force the next simulated transfer to fail
              </div>
              <div className="mt-0.5 text-[10.5px] leading-relaxed text-[#66706a]">
                The payment lands in Failed with a mock gateway reason. Retry reuses the same
                payment record and writes both attempts to the audit trail.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state.forceNextFailure}
              aria-label="Force next simulated transfer to fail"
              onClick={onToggleForceFailure}
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                state.forceNextFailure ? 'bg-[#a15c12]' : 'bg-[#d9d7ce]',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                  state.forceNextFailure ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
          {state.forceNextFailure ? (
            <div className="mt-2 flex items-center gap-1.5 rounded-md border border-[#efd7ad] bg-[#fdf8ee] px-2 py-1 text-[10.5px] font-medium text-[#8a4d0c]">
              <AlertTriangle className="h-3 w-3" />
              Armed: the next execution by the owner will be declined once.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[#e7e5dc] bg-[#fafaf7] p-3 text-[10.5px] leading-relaxed text-[#66706a]">
        <div className="font-semibold text-[#3e4742]">Try this in the demo</div>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>Switch to Sunita, record a part-payment on an invoice with a clean balance.</li>
          <li>Switch to Ramesh, approve it, then execute the simulated transfer.</li>
          <li>Arm a failure, execute another approved payment, and retry it safely.</li>
          <li>Record a supplier revision on an approved invoice to make the approval stale.</li>
        </ol>
      </div>
    </Modal>
  );
}
