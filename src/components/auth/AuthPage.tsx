import { useState } from 'react';
import { authLogin, authSignup, authGoogleLogin, type AuthUser } from '../../ledger/auth';
import { ApiError } from '../../ledger/api';

interface Props {
  onAuth: (user: AuthUser) => void;
}

type Mode = 'login' | 'signup' | 'google_prompt';

export function AuthPage({ onAuth }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Quick Google Sign-In Prompt state
  const [googleEmail, setGoogleEmail] = useState('');
  const [googleName, setGoogleName] = useState('');

  // Handle standard Email & Password submit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let user: AuthUser;
      if (mode === 'signup') {
        user = await authSignup(email, password, fullName);
      } else {
        user = await authLogin(email, password);
      }
      onAuth(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Handle Google Sign-In
  async function handleGoogleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!googleEmail.trim()) {
      setError('Please enter your Google / Gmail address');
      return;
    }
    setLoading(true);
    try {
      const derivedName = googleName.trim() || googleEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const user = await authGoogleLogin(googleEmail, derivedName);
      onAuth(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  // Quick 1-click Reviewer Guest access
  function handleReviewerAccess() {
    const reviewerUser: AuthUser = {
      email: 'evaluator@hackathon.org',
      full_name: 'Hackathon Evaluator',
      ledger_role: 'owner',
      workspace_id: 'ws-review-session',
    };
    onAuth(reviewerUser);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-lp-surface-sunken px-4 py-8">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-lp-primary text-white text-xl font-bold shadow-md">
            LP
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-lp-ink">LedgerPilot</h1>
          <p className="mt-1 text-sm text-lp-ink-muted">
            Autonomous accounts-payable console for Indian retail MSMEs
          </p>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-lp-line bg-white p-6 sm:p-8 shadow-[0_4px_16px_rgba(43,33,24,0.06)]">
          {mode === 'google_prompt' ? (
            /* Google Sign-In Prompt */
            <div>
              <div className="mb-4 flex items-center gap-2 border-b border-lp-line-soft pb-3">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <h2 className="text-base font-semibold text-lp-ink">Sign in with Google</h2>
              </div>
              <p className="mb-4 text-[12px] text-lp-ink-muted leading-relaxed">
                Enter your Gmail address to sign in as the workspace owner.
              </p>
              <form onSubmit={handleGoogleSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                    Your Gmail address
                  </label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={googleEmail}
                    onChange={(e) => setGoogleEmail(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full rounded-lg border border-lp-line bg-white px-3 py-2.5 text-[13px] text-lp-ink focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                    Your Full Name (optional)
                  </label>
                  <input
                    type="text"
                    value={googleName}
                    onChange={(e) => setGoogleName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-lg border border-lp-line bg-white px-3 py-2.5 text-[13px] text-lp-ink focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-lp-danger-wash px-3 py-2 text-[12px] text-lp-danger">
                    {error}
                  </p>
                )}

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(null); }}
                    className="flex-1 rounded-lg border border-lp-line py-2.5 text-[12.5px] font-medium text-lp-ink-muted hover:bg-lp-surface-sunken"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-lg bg-lp-primary py-2.5 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? 'Signing in…' : 'Continue to Workspace'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Main Login / Signup Form */
            <>
              {/* Google Button */}
              <button
                type="button"
                onClick={() => { setMode('google_prompt'); setError(null); }}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-lp-line bg-white px-4 py-2.5 text-[13px] font-medium text-lp-ink shadow-sm transition-all hover:bg-lp-surface-muted hover:border-lp-line-strong focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
              >
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-lp-line-soft" />
                <span className="text-[11px] uppercase tracking-wider text-lp-ink-faint">
                  or with email
                </span>
                <div className="h-px flex-1 bg-lp-line-soft" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                      Full name
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Priyesh Shah"
                      className="w-full rounded-lg border border-lp-line bg-white px-3 py-2 text-[13px] text-lp-ink placeholder:text-lp-ink-faint focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourdomain.com"
                    className="w-full rounded-lg border border-lp-line bg-white px-3 py-2 text-[13px] text-lp-ink placeholder:text-lp-ink-faint focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-medium text-lp-ink-muted mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Min 8 characters' : '••••••••'}
                    className="w-full rounded-lg border border-lp-line bg-white px-3 py-2 text-[13px] text-lp-ink placeholder:text-lp-ink-faint focus:border-lp-primary focus:outline-none focus:ring-2 focus:ring-lp-primary/20"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-lp-danger-wash px-3 py-2 text-[12px] text-lp-danger">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-lp-primary px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading
                    ? mode === 'login'
                      ? 'Signing in…'
                      : 'Setting up workspace…'
                    : mode === 'login'
                      ? 'Sign in with Password'
                      : 'Create Workspace'}
                </button>
              </form>

              {/* Toggle Login / Signup */}
              <div className="mt-5 border-t border-lp-line-soft pt-4 text-center text-[12px] text-lp-ink-muted">
                {mode === 'login' ? (
                  <>
                    First time here?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('signup'); setError(null); }}
                      className="font-semibold text-lp-primary hover:underline"
                    >
                      Create workspace
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('login'); setError(null); }}
                      className="font-semibold text-lp-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </div>

              {/* Fast Reviewer / Evaluator button */}
              <div className="mt-4 rounded-xl bg-lp-surface-sunken p-3 text-center">
                <p className="text-[11px] text-lp-ink-muted">
                  Reviewing this project for the hackathon?
                </p>
                <button
                  type="button"
                  onClick={handleReviewerAccess}
                  className="mt-1 text-[11.5px] font-semibold text-lp-primary hover:underline"
                >
                  Enter as Reviewer / Evaluator &rarr;
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-lp-ink-faint">
          All vendor payments are simulated. No live bank transactions.
        </p>
      </div>
    </div>
  );
}
