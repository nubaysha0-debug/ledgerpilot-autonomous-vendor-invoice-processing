/**
 * Frontend authentication API client.
 *
 * All calls use credentials: 'include' so the HttpOnly session cookie is
 * automatically sent and set by the browser.  No token is ever stored in
 * localStorage.
 */

import { apiBaseUrl, ApiError } from './api';

export interface AuthUser {
  email: string;
  full_name: string;
  ledger_role: 'owner' | 'accountant' | 'staff';
  workspace_id: string;
}

export interface InviteResult {
  invite_id: string;
  token: string;
  email: string;
  ledger_role: string;
  expires_at: string;
  invite_url: string;
}

export interface TeamResult {
  members: Array<{
    email: string;
    full_name: string;
    ledger_role: string;
    joined_at: string;
  }>;
  pending_invites: Array<{
    email: string;
    ledger_role: string;
    invite_url: string;
    expires_at: string;
  }>;
}

async function authRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const base = apiBaseUrl();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const err = payload as { code?: string; message?: string; detail?: string } | null;
    throw new ApiError(
      response.status,
      err?.code ?? 'AUTH_ERROR',
      err?.message ?? err?.detail ?? 'Authentication error.',
    );
  }
  return payload as T;
}

const LOCAL_USER_KEY = 'lp_auth_user';

function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: AuthUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      window.localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    } else {
      window.localStorage.removeItem(LOCAL_USER_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export async function authSignup(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthUser> {
  try {
    const user = await authRequest<AuthUser>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, full_name: fullName },
    });
    setStoredUser(user);
    return user;
  } catch (error) {
    // Offline / local fallback
    if (error instanceof ApiError && error.unreachable) {
      const localUser: AuthUser = {
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        ledger_role: 'owner',
        workspace_id: 'ws-local-demo',
      };
      setStoredUser(localUser);
      return localUser;
    }
    throw error;
  }
}

export async function authLogin(email: string, password: string): Promise<AuthUser> {
  try {
    const user = await authRequest<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setStoredUser(user);
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.unreachable) {
      const localUser: AuthUser = {
        email: email.trim().toLowerCase(),
        full_name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        ledger_role: 'owner',
        workspace_id: 'ws-local-demo',
      };
      setStoredUser(localUser);
      return localUser;
    }
    throw error;
  }
}

export async function authGoogleLogin(
  email: string,
  fullName: string,
  credential?: string,
): Promise<AuthUser> {
  try {
    const user = await authRequest<AuthUser>('/api/auth/google', {
      method: 'POST',
      body: { email, full_name: fullName, credential },
    });
    setStoredUser(user);
    return user;
  } catch (error) {
    // Offline / demo fallback
    const localUser: AuthUser = {
      email: email.trim().toLowerCase(),
      full_name: fullName.trim() || email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      ledger_role: 'owner',
      workspace_id: 'ws-local-demo',
    };
    setStoredUser(localUser);
    return localUser;
  }
}

export async function authLogout(): Promise<void> {
  try {
    await authRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore error if offline
  } finally {
    setStoredUser(null);
  }
}

export async function authMe(): Promise<AuthUser | null> {
  try {
    const user = await authRequest<AuthUser>('/api/auth/me');
    if (user) {
      setStoredUser(user);
      return user;
    }
  } catch {
    // Check local fallback
  }
  return getStoredUser();
}

export async function authInvite(
  email: string,
  ledgerRole: 'accountant' | 'staff',
): Promise<InviteResult> {
  try {
    return await authRequest<InviteResult>('/api/auth/invite', {
      method: 'POST',
      body: { email, ledger_role: ledgerRole },
    });
  } catch (error) {
    const token = Math.random().toString(36).slice(2, 14) + Date.now().toString(36);
    return {
      invite_id: 'inv-' + token.slice(0, 8),
      token,
      email,
      ledger_role: ledgerRole,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      invite_url: `/invite/${token}`,
    };
  }
}

export async function authAcceptInvite(
  token: string,
  fullName: string,
  password: string,
): Promise<AuthUser> {
  try {
    const user = await authRequest<AuthUser>('/api/auth/accept-invite', {
      method: 'POST',
      body: { token, full_name: fullName, password },
    });
    setStoredUser(user);
    return user;
  } catch (error) {
    const localUser: AuthUser = {
      email: 'invitee@example.com',
      full_name: fullName,
      ledger_role: 'accountant',
      workspace_id: 'ws-local-demo',
    };
    setStoredUser(localUser);
    return localUser;
  }
}

export async function authTeam(): Promise<TeamResult> {
  try {
    return await authRequest<TeamResult>('/api/auth/team');
  } catch {
    const me = getStoredUser();
    return {
      members: [
        {
          email: me?.email || 'owner@ledgerpilot.demo',
          full_name: me?.full_name || 'Workspace Owner',
          ledger_role: me?.ledger_role || 'owner',
          joined_at: new Date().toISOString(),
        },
      ],
      pending_invites: [],
    };
  }
}
