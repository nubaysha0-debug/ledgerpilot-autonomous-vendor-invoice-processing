import { useEffect, useState } from 'react';
import { authInvite, authTeam, type TeamResult } from '../../ledger/auth';
import { ApiError } from '../../ledger/api';

interface Props {
  isOwner: boolean;
}

export function TeamView({ isOwner }: Props) {
  const [team, setTeam] = useState<TeamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'accountant' | 'staff'>('accountant');
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    authTeam()
      .then(setTeam)
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteResult(null);
    setInviting(true);
    try {
      const result = await authInvite(inviteEmail, inviteRole);
      setInviteResult(result.invite_url);
      setInviteEmail('');
      // Refresh team list
      const updated = await authTeam();
      setTeam(updated);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Failed to send invite.');
    } finally {
      setInviting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-lp-surface-sunken" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-lp-primary">
          Workspace
        </div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-lp-ink">Team</h1>
        <p className="mt-1 text-[12.5px] text-lp-ink-muted">
          Members who share this workspace
        </p>
      </div>

      {/* Current members */}
      <div className="rounded-xl border border-lp-line bg-white overflow-hidden shadow-[0_1px_2px_rgba(43,33,24,0.05)]">
        <div className="border-b border-lp-line-soft px-4 py-3">
          <p className="text-[11.5px] font-semibold text-lp-ink">Active members</p>
        </div>
        <div className="divide-y divide-lp-line-soft">
          {(team?.members ?? []).map((m) => (
            <div key={m.email} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] font-medium text-lp-ink">{m.full_name}</p>
                <p className="text-[11px] text-lp-ink-muted">{m.email}</p>
              </div>
              <span className="rounded-full bg-lp-accent-wash px-2.5 py-0.5 text-[10.5px] font-semibold text-lp-primary capitalize">
                {m.ledger_role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending invites */}
      {(team?.pending_invites ?? []).length > 0 && (
        <div className="rounded-xl border border-lp-line bg-white overflow-hidden shadow-[0_1px_2px_rgba(43,33,24,0.05)]">
          <div className="border-b border-lp-line-soft px-4 py-3">
            <p className="text-[11.5px] font-semibold text-lp-ink">Pending invites</p>
          </div>
          <div className="divide-y divide-lp-line-soft">
            {team!.pending_invites.map((inv) => (
              <div key={inv.email} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-lp-ink">{inv.email}</p>
                  <p className="text-[11px] text-lp-ink-muted capitalize">{inv.ledger_role}</p>
                </div>
                <span className="rounded-full bg-lp-warning-wash px-2.5 py-0.5 text-[10.5px] font-semibold text-lp-warning">
                  Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form (owner only) */}
      {isOwner && (
        <div className="rounded-xl border border-lp-line bg-white p-5 shadow-[0_1px_2px_rgba(43,33,24,0.05)]">
          <p className="mb-4 text-[11.5px] font-semibold text-lp-ink">Invite a teammate</p>
          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                Email address
              </label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="accountant@yourbusiness.com"
                className="w-full rounded-lg border border-lp-line bg-white px-3 py-2 text-[12.5px] text-lp-ink placeholder:text-lp-ink-faint focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                Role in workspace
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'accountant' | 'staff')}
                className="w-full rounded-lg border border-lp-line bg-white px-3 py-2 text-[12.5px] text-lp-ink focus:border-lp-primary focus:outline-none"
              >
                <option value="accountant">Accountant — can record payments</option>
                <option value="staff">Staff — view only</option>
              </select>
            </div>

            {inviteError && (
              <p className="rounded-lg bg-lp-danger-wash px-3 py-2 text-[11.5px] text-lp-danger">
                {inviteError}
              </p>
            )}

            {inviteResult && (
              <div className="rounded-lg bg-lp-success-wash px-3 py-2 text-[11.5px] text-lp-success">
                <p className="font-medium mb-1">Invite link (share with the invitee):</p>
                <code className="break-all text-[10.5px]">
                  {window.location.origin}{inviteResult}
                </code>
              </div>
            )}

            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-lp-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
