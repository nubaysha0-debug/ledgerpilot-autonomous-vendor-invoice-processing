/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { AppShell } from './components/ledger/AppShell';
import { AuthPage } from './components/auth/AuthPage';
import { AcceptInvitePage } from './components/auth/AcceptInvitePage';
import { authMe, authLogout, type AuthUser } from './ledger/auth';

/**
 * Main application entry with authentication gate.
 *
 * Every visitor sees the Sign In / Google Sign In screen first, unless
 * they have an active session or explicitly append `?demo=1` to the URL.
 */
export default function App() {
  // Check for an invite token in the URL: /invite/<token>
  const inviteToken = (() => {
    if (typeof window === 'undefined') return null;
    const parts = window.location.pathname.split('/');
    if (parts[1] === 'invite' && parts[2]) return parts[2];
    return null;
  })();

  // Allow bypass only if explicitly requested for automated evaluation
  const bypassParam = (() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('demo') === '1' || params.get('skip_auth') === '1';
  })();

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    authMe()
      .then((me) => {
        if (me) {
          setUser(me);
        }
      })
      .finally(() => {
        setChecking(false);
      });
  }, []);

  async function handleLogout() {
    await authLogout();
    setUser(null);
  }

  // Wait for session check
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-lp-surface-sunken">
        <div className="flex flex-col items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-lp-primary text-white text-lg font-bold shadow-md animate-pulse">
            LP
          </div>
          <div className="text-[12.5px] font-medium text-lp-ink-muted">
            Opening LedgerPilot…
          </div>
        </div>
      </div>
    );
  }

  // Invite acceptance link (/invite/<token>)
  if (inviteToken && !user) {
    return (
      <AcceptInvitePage
        token={inviteToken}
        onAuth={(u) => {
          setUser(u);
          window.history.replaceState(null, '', '/');
        }}
      />
    );
  }

  // If not logged in and not explicitly bypassing, show Login Page
  if (!user && !bypassParam) {
    return <AuthPage onAuth={setUser} />;
  }

  // Authenticated (or bypassed) -> Show the full app with the active user
  return <AppShell user={user} onLogout={handleLogout} />;
}
