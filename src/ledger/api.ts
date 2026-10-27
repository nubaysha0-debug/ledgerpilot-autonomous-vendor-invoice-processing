/**
 * HTTP adapter for the LedgerPilot FastAPI service.
 *
 * The React console can run in two modes:
 *   - "api":    the FastAPI service on :8000 owns the workspace in PostgreSQL.
 *   - "local":  the original browser-only demo in localStorage.
 *
 * Everything here is deliberately plain fetch + JSON so the demo has no
 * additional runtime dependency. Money crosses the boundary as decimal
 * strings; the UI keeps integer paise and converts at the edge.
 */

import type {
  BusinessProfileInput,
  DemoState,
  Payment,
  PaymentMode,
  PaymentRequestInput,
  Role,
} from './types';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';
// Serverless cold starts (Vercel + a suspended Neon database) can take a few
// seconds. A short timeout would silently demote the console to local mode.
const HEALTH_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 12000;

export interface ApiHealth {
  status: string;
  api_version: string;
  database: string;
  migrations: number;
  seeded: boolean;
  simulated: boolean;
  label?: string;
}

export interface ApiUser {
  id: string;
  display_name: string;
  role: Role | 'system' | 'accountant';
  email?: string | null;
  initials?: string | null;
}

export interface ApiBootstrap {
  baseUrl: string;
  health: ApiHealth;
  users: ApiUser[];
  workspace: DemoState;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly correlationId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
  }

  get unreachable(): boolean {
    return this.code === 'API_UNREACHABLE' || this.code === 'API_TIMEOUT';
  }
}

export function apiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  // On Vercel the console and the FastAPI service share one domain
  // (see vercel.json), so a production build defaults to same-origin. This
  // works on every preview URL without rebuilding. Set VITE_API_URL to keep
  // the API on a separate host instead.
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return DEFAULT_BASE_URL;
}

function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function paiseToAmount(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2);
}

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => globalThis.clearTimeout(timer),
  };
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    actorId?: string;
    idempotencyKey?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { signal, clear } = timeoutSignal(options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.actorId) headers['X-Actor-Id'] = options.actorId;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError') {
      throw new ApiError(
        0,
        'API_TIMEOUT',
        'The LedgerPilot API did not answer in time. Continuing with the browser workspace.',
      );
    }
    throw new ApiError(
      0,
      'API_UNREACHABLE',
      'The LedgerPilot API is not reachable. Continuing with the browser workspace.',
    );
  } finally {
    clear();
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(
        response.status,
        'API_BAD_RESPONSE',
        'The API returned a response that was not JSON.',
      );
    }
  }

  if (!response.ok) {
    const envelope = payload as
      | { error?: { code?: string; message?: string; details?: Record<string, unknown>; correlation_id?: string } }
      | null;
    const detail = envelope?.error;
    throw new ApiError(
      response.status,
      detail?.code ?? `HTTP_${response.status}`,
      detail?.message ?? `The API rejected the request (HTTP ${response.status}).`,
      detail?.details ?? {},
      detail?.correlation_id,
    );
  }

  return payload as T;
}

function assertWorkspace(value: unknown): DemoState {
  const candidate = value as DemoState | null;
  if (
    !candidate ||
    candidate.schemaVersion !== 1 ||
    !candidate.business ||
    !Array.isArray(candidate.team) ||
    !Array.isArray(candidate.vendors) ||
    !Array.isArray(candidate.invoices) ||
    !Array.isArray(candidate.payments) ||
    !Array.isArray(candidate.audit)
  ) {
    throw new ApiError(
      200,
      'WORKSPACE_INVALID',
      'The API workspace response is missing required collections.',
    );
  }
  return candidate;
}

interface ApprovalItem {
  id: string;
  payment_id: string;
  status: string;
  fingerprint: string;
  reason?: string | null;
}

interface ExecuteResponse {
  payment: Record<string, unknown>;
  attempt?: { gateway_reference?: string | null } | null;
  replayed?: boolean;
  invoice_balance?: Record<string, unknown>;
}

export class LedgerApi {
  readonly baseUrl: string;
  private actors = new Map<Role, string>();

  constructor(baseUrl: string = apiBaseUrl()) {
    this.baseUrl = baseUrl;
  }

  private actor(role: Role): string {
    const id = this.actors.get(role);
    if (!id) {
      throw new ApiError(
        401,
        'ACTOR_REQUIRED',
        `No server user is mapped to the ${role} role. Reload the workspace.`,
      );
    }
    return id;
  }

  setUsers(users: ApiUser[]) {
    this.actors.clear();
    for (const user of users) {
      if (user.role === 'owner' || user.role === 'accountant' || user.role === 'staff') {
        if (!this.actors.has(user.role)) this.actors.set(user.role, user.id);
      }
    }
  }

  hasRole(role: Role): boolean {
    return this.actors.has(role);
  }

  async health(timeoutMs = HEALTH_TIMEOUT_MS): Promise<ApiHealth> {
    return request<ApiHealth>(this.baseUrl, '/api/health', { timeoutMs });
  }

  async users(): Promise<ApiUser[]> {
    const body = await request<{ items: ApiUser[] }>(this.baseUrl, '/api/users');
    return body.items ?? [];
  }

  async workspace(): Promise<DemoState> {
    return assertWorkspace(
      await request<unknown>(this.baseUrl, '/api/workspace', { timeoutMs: REQUEST_TIMEOUT_MS }),
    );
  }

  async bootstrap(): Promise<ApiBootstrap> {
    const health = await this.health();
    if (!health.seeded) {
      await request(this.baseUrl, '/api/demo/reset', { method: 'POST' });
    }
    const [users, workspace] = await Promise.all([this.users(), this.workspace()]);
    this.setUsers(users);
    return { baseUrl: this.baseUrl, health, users, workspace };
  }

  async resetDemo(): Promise<DemoState> {
    const workspace = assertWorkspace(
      await request<unknown>(this.baseUrl, '/api/demo/reset', { method: 'POST' }),
    );
    const users = await this.users();
    this.setUsers(users);
    return workspace;
  }

  async createPayment(input: PaymentRequestInput, role: Role): Promise<Record<string, unknown>> {
    const key = newIdempotencyKey();
    const payment = await request<Record<string, unknown>>(
      this.baseUrl,
      `/api/invoices/${encodeURIComponent(input.invoiceId)}/payments`,
      {
        method: 'POST',
        actorId: this.actor(role),
        idempotencyKey: key,
        body: {
          amount: paiseToAmount(input.amountPaise),
          payment_date: input.requestedDate.slice(0, 10),
          mode: input.mode satisfies PaymentMode,
          reference: input.reference,
          note: input.note ?? null,
        },
      },
    );

    const paymentId = String(payment.id ?? '');
    if (!paymentId) {
      throw new ApiError(500, 'PAYMENT_INVALID', 'The API did not return the new payment id.');
    }

    try {
      await request(this.baseUrl, '/api/runs', {
        method: 'POST',
        actorId: this.actor(role),
        body: { payment_id: paymentId },
      });
    } catch (error) {
      // The draft already exists; a live run is the normal reason the second
      // call fails, so treat that single case as success.
      if (!(error instanceof ApiError && error.code === 'RUN_ALREADY_ACTIVE')) throw error;
    }

    return payment;
  }

  async approvePayment(paymentId: string): Promise<void> {
    const approval = await this.pendingApproval(paymentId);
    await request(this.baseUrl, `/api/approvals/${approval.id}/decision`, {
      method: 'POST',
      actorId: this.actor('owner'),
      body: { decision: 'approve', fingerprint: approval.fingerprint },
    });
  }

  async rejectPayment(paymentId: string, reason: string): Promise<void> {
    const approval = await this.pendingApproval(paymentId);
    await request(this.baseUrl, `/api/approvals/${approval.id}/decision`, {
      method: 'POST',
      actorId: this.actor('owner'),
      body: { decision: 'reject', fingerprint: approval.fingerprint, reason },
    });
  }

  async executePayment(
    payment: Payment,
  ): Promise<{ replayed: boolean; failed: boolean; gatewayReference?: string | null }> {
    const key = payment.idempotencyKey;
    if (!key) {
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'This payment has no stored idempotency key. Reset the demo or record a new payment.',
      );
    }
    try {
      const body = await request<ExecuteResponse>(
        this.baseUrl,
        `/api/payments/${encodeURIComponent(payment.id)}/execute`,
        {
          method: 'POST',
          actorId: this.actor('owner'),
          idempotencyKey: key,
          body: {},
        },
      );
      return {
        replayed: Boolean(body.replayed),
        failed: false,
        gatewayReference: body.payment?.gateway_reference as string | null | undefined,
      };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'GATEWAY_FAILED') {
        return { replayed: false, failed: true };
      }
      throw error;
    }
  }

  async retryPayment(paymentId: string): Promise<void> {
    await request(this.baseUrl, `/api/payments/${encodeURIComponent(paymentId)}/retry`, {
      method: 'POST',
      actorId: this.actor('owner'),
    });
  }

  async reviseInvoice(invoiceId: string): Promise<void> {
    await request(this.baseUrl, `/api/invoices/${encodeURIComponent(invoiceId)}/revise`, {
      method: 'POST',
      actorId: this.actor('owner'),
    });
  }

  async verifyVendorBank(vendorId: string): Promise<void> {
    await request(this.baseUrl, `/api/vendors/${encodeURIComponent(vendorId)}/verify-bank`, {
      method: 'POST',
      actorId: this.actor('owner'),
    });
  }

  async toggleForceFailure(): Promise<boolean> {
    const body = await request<{ force_next_failure?: boolean }>(
      this.baseUrl,
      '/api/demo/force-failure',
      { method: 'POST', actorId: this.actor('owner') },
    );
    return Boolean(body.force_next_failure);
  }

  async updateBusiness(input: BusinessProfileInput): Promise<void> {
    await request(this.baseUrl, '/api/business', {
      method: 'PATCH',
      actorId: this.actor('owner'),
      body: {
        name: input.name,
        gstin: input.gstin,
        address: input.address,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        phone: input.phone,
        email: input.email,
        fy: input.fy,
        as_of: input.asOf,
      },
    });
  }

  async replaceWorkspace(state: DemoState): Promise<DemoState> {
    const business = state.business;
    const payload = {
      ...state,
      business: {
        ...business,
        legal_name: business.legalName,
        as_of: business.asOf,
        bank_name: business.bank.bankName,
        bank_account_masked: business.bank.accountMasked,
        bank_ifsc: business.bank.ifsc,
        bank_upi_id: business.bank.upiId ?? null,
      },
    };
    const workspace = assertWorkspace(
      await request<unknown>(this.baseUrl, '/api/workspace', {
        method: 'PUT',
        actorId: this.actor('owner'),
        body: payload,
      }),
    );
    return workspace;
  }

  private async pendingApproval(paymentId: string): Promise<ApprovalItem> {
    const body = await request<{ items: ApprovalItem[] }>(
      this.baseUrl,
      '/api/approvals?status=pending',
    );
    const approval = (body.items ?? []).find((item) => item.payment_id === paymentId);
    if (!approval) {
      throw new ApiError(
        409,
        'APPROVAL_NOT_FOUND',
        'No pending approval exists for this payment. Reload the workspace.',
      );
    }
    return approval;
  }
}

export function createApi(baseUrl?: string): LedgerApi {
  return new LedgerApi(baseUrl);
}
