import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { authInvite, authTeam, type TeamResult } from '../../ledger/auth';
import { ApiError } from '../../ledger/api';

interface Props {
  isOwner: boolean;
}

interface CreatedInvite {
  url: string;
  role: 'accountant' | 'staff';
  /** Digits only, including country code (e.g. 919876543210). */
  phone?: string;
}

function WhatsAppIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  );
}

function absoluteInviteUrl(inviteUrl: string): string {
  return `${window.location.origin}${inviteUrl}`;
}

function buildWhatsAppUrl(inviteUrl: string, role: string, phone?: string): string {
  const roleLabel = role === 'staff' ? 'a staff member (view only)' : 'an accountant';
  const message =
    `Hi! You've been invited to join our workspace on LedgerPilot as ${roleLabel}.\n\n` +
    `Click this link to set up your account and join:\n${absoluteInviteUrl(inviteUrl)}`;
  // With a phone number WhatsApp opens that chat directly; otherwise it opens
  // the contact picker so the owner can choose who to send it to.
  return `https://wa.me/${phone ?? ''}?text=${encodeURIComponent(message)}`;
}

/** Strip spaces, dashes, brackets and a leading "+", keeping digits only. */
function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function TeamView({ isOwner }: Props) {
  const [team, setTeam] = useState<TeamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'accountant' | 'staff'>('accountant');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    authTeam()
      .then(setTeam)
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setCreatedInvite(null);
    setCopied(false);

    // Phone is optional, but if provided it must be a full international
    // number so wa.me can open the chat directly.
    const phone = normalizePhone(whatsappNumber);
    if (phone && (phone.length < 10 || phone.length > 15)) {
      setInviteError(
        'Enter a full WhatsApp number with country code, e.g. +91 98765 43210.',
      );
      return;
    }

    setInviting(true);
    try {
      const role = inviteRole;
      const result = await authInvite(inviteEmail, role);
      setCreatedInvite({ url: result.invite_url, role, phone: phone || undefined });
      setInviteEmail('');
      setWhatsappNumber('');
      // Refresh team list
      const updated = await authTeam();
      setTeam(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setInviteError(
          'Your session has expired. Sign out and sign in again, then create the invite.',
        );
      } else {
        setInviteError(
          err instanceof ApiError ? err.message : 'Failed to create invite link.',
        );
      }
    } finally {
      setInviting(false);
    }
  }

  async function copyLink(inviteUrl: string) {
    const url = absoluteInviteUrl(inviteUrl);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
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
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-lp-warning-wash px-2.5 py-0.5 text-[10.5px] font-semibold text-lp-warning">
                    Pending
                  </span>
                  <a
                    href={buildWhatsAppUrl(inv.invite_url, inv.ledger_role)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Share ${inv.email}'s invite on WhatsApp`}
                    aria-label={`Share ${inv.email}'s invite on WhatsApp`}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-2 text-[10.5px] font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/20"
                  >
                    <WhatsAppIcon className="h-3.5 w-3.5" />
                    Share
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form (owner only) */}
      {isOwner && (
        <div className="rounded-xl border border-lp-line bg-white p-5 shadow-[0_1px_2px_rgba(43,33,24,0.05)]">
          <p className="mb-1 text-[11.5px] font-semibold text-lp-ink">Invite a teammate</p>
          <p className="mb-4 text-[11px] text-lp-ink-muted">
            Create a link, then send it straight to them on WhatsApp.
          </p>
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
              <p className="mt-1 text-[10.5px] text-lp-ink-faint">
                This email becomes their login for the workspace.
              </p>
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
            <div>
              <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                WhatsApp number <span className="font-normal text-lp-ink-faint">(optional)</span>
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={whatsappNumber}
                onChange={(e) => {
                  setWhatsappNumber(e.target.value);
                  setInviteError(null);
                }}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-lp-line bg-white px-3 py-2 text-[12.5px] text-lp-ink placeholder:text-lp-ink-faint focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
              />
              <p className="mt-1 text-[10.5px] text-lp-ink-faint">
                Include the country code to open their chat directly. Leave blank to share with any contact.
              </p>
            </div>

            {inviteError && (
              <p className="rounded-lg bg-lp-danger-wash px-3 py-2 text-[11.5px] text-lp-danger">
                {inviteError}
              </p>
            )}

            {createdInvite && (
              <div className="rounded-lg bg-lp-success-wash px-3 py-2.5 text-[11.5px] text-lp-success">
                <p className="font-medium mb-1.5">Invite ready — send it on WhatsApp:</p>
                <p className="mb-2.5 break-all rounded-md border border-lp-success/20 bg-white/70 px-2 py-1.5 font-mono text-[10.5px]">
                  {absoluteInviteUrl(createdInvite.url)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={buildWhatsAppUrl(
                      createdInvite.url,
                      createdInvite.role,
                      createdInvite.phone,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#1FB855]"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {createdInvite.phone
                      ? `Send to +${createdInvite.phone}`
                      : 'Share on WhatsApp'}
                  </a>
                  <button
                    type="button"
                    onClick={() => copyLink(createdInvite.url)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-lp-success/30 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-lp-success transition-colors hover:bg-lp-success-wash"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-lp-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {inviting ? 'Creating…' : 'Create invite link'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
