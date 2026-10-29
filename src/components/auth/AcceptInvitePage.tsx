import { useEffect, useState } from 'react';
import { authAcceptInvite, type AuthUser } from '../../ledger/auth';
import { ApiError } from '../../ledger/api';

interface Props {
  token: string;
  onAuth: (user: AuthUser) => void;
}

export function AcceptInvitePage({ token, onAuth }: Props) {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await authAcceptInvite(token, fullName, password);
      onAuth(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-lp-surface-sunken px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-lp-primary text-white text-xl font-bold shadow-md">
            LP
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-lp-ink">
            You&apos;ve been invited
          </h1>
          <p className="mt-1 text-sm text-lp-ink-muted">
            Set up your LedgerPilot account to join the workspace
          </p>
        </div>

        <div className="rounded-2xl border border-lp-line bg-white p-8 shadow-[0_2px_8px_rgba(43,33,24,0.08)]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-lp-ink-muted mb-1">
                Your full name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sunita Deshmukh"
                className="w-full rounded-lg border border-lp-line bg-white px-3 py-2.5 text-[13px] text-lp-ink placeholder:text-lp-ink-faint focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-lp-ink-muted mb-1">
                Choose a password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-lp-line bg-white px-3 py-2.5 text-[13px] text-lp-ink placeholder:text-lp-ink-faint focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-lp-danger-wash px-3 py-2 text-[12.5px] text-lp-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-lp-primary px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Joining workspace…' : 'Join workspace'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
