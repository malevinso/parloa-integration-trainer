/**
 * PracticeSystems — four mock business systems behind one router.
 *
 *   crm          Customer Master          Bearer token auth
 *   verification Identity Verification    Bearer token auth; issues verification tokens
 *   orders       Order Management         API key + verification token (ENFORCED here)
 *   carrier      Carrier Tracking         API key
 *
 * The verification boundary is enforced in this module, not in the UI: the
 * orders endpoints refuse to release order data unless the request carries a
 * verification token that (a) exists, (b) has not expired and (c) was issued
 * for the same customer whose orders are requested.
 */

import {
  customerFixtures,
  identityFixtures,
  orderFixtures,
  shipmentFixtures,
  sandboxCredentials,
  type CustomerRecord,
  type IdentityRecord,
  type OrderRecord,
  type ShipmentRecord,
} from './fixtures';
import {
  ALL_SYSTEMS,
  SYSTEM_BASE_PATHS,
  SYSTEM_HOSTS,
  type FaultConfig,
  type FaultMode,
  type HttpMethod,
  type RequestLogEntry,
  type SystemId,
  type VirtualRequest,
  type VirtualResponse,
} from './types';

export interface HandleOptions {
  /** Groups requests that belong to one workflow run (used by flaky/rate-limit faults and the log). */
  runId?: string;
  faults?: FaultConfig;
}

interface VerificationToken {
  token: string;
  customerId: string;
  issuedAt: number;
  expiresAt: number;
}

interface VerificationAttemptState {
  failedAttempts: number;
  lockedUntil: number | null;
}

const MAX_FAILED_ATTEMPTS = 3;
const LOCK_MINUTES = 30;
const TOKEN_TTL_MINUTES = 15;
const DEFAULT_REQUESTS_PER_RUN = 25;
const RATE_LIMIT_FAULT_REQUESTS_PER_RUN = 1;

const BASE_LATENCY: Record<SystemId, number> = {
  crm: 120,
  verification: 210,
  orders: 160,
  carrier: 420,
};

export interface RouteMatch {
  system: SystemId;
  /** Path relative to the system base path, e.g. /customers/CUST-1001 */
  path: string;
  query: URLSearchParams;
}

export interface ResolveResult {
  ok: true;
  match: RouteMatch;
}
export interface ResolveError {
  ok: false;
  status: number;
  error: string;
  message: string;
}

/**
 * Resolve which system a URL targets. Accepts both the virtual hosts
 * (https://orders.practice.local/api/v2/...) and the HTTP-server prefix style
 * (http://localhost:8787/orders/api/v2/...).
 */
export function resolveRoute(url: string): ResolveResult | ResolveError {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      status: 0,
      error: 'INVALID_URL',
      message: `"${url}" is not an absolute URL. Did an env variable such as {{env.CRM_BASE_URL}} fail to resolve?`,
    };
  }
  let system: SystemId | undefined;
  let pathname = parsed.pathname;
  for (const id of ALL_SYSTEMS) {
    if (parsed.hostname === SYSTEM_HOSTS[id]) {
      system = id;
      break;
    }
  }
  if (!system) {
    for (const id of ALL_SYSTEMS) {
      const prefix = `/${id}/`;
      if (pathname.startsWith(prefix) || pathname === `/${id}`) {
        system = id;
        pathname = pathname.slice(prefix.length - 1);
        break;
      }
    }
  }
  if (!system) {
    return {
      ok: false,
      status: 0,
      error: 'UNKNOWN_HOST',
      message: `No practice system answers at ${parsed.hostname}${parsed.pathname}. Known hosts: ${ALL_SYSTEMS.map(
        (s) => SYSTEM_HOSTS[s],
      ).join(', ')} (or /crm, /verification, /orders, /carrier on the local HTTP server).`,
    };
  }
  const base = SYSTEM_BASE_PATHS[system];
  if (!pathname.startsWith(base)) {
    return {
      ok: false,
      status: 404,
      error: 'NOT_FOUND',
      message: `Path ${pathname} is not under the ${system} API base path ${base}.`,
    };
  }
  const rel = pathname.slice(base.length) || '/';
  return { ok: true, match: { system, path: rel.replace(/\/+$/, '') || '/', query: parsed.searchParams } };
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 8 && raw.trim().startsWith('+')) return `+${digits}`;
  return null;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const shown = local.length <= 2 ? local[0] : `${local[0]}***${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 2)}•••••${phone.slice(-4)}`;
}

function json(status: number, body: unknown, latencyMs: number, extraHeaders: Record<string, string> = {}): VirtualResponse {
  return {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body,
    latencyMs,
  };
}

function headerLookup(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return undefined;
}

let tokenCounter = 0;
function randomToken(): string {
  tokenCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `vt_${rand}${tokenCounter.toString(36)}`;
}

export class PracticeSystems {
  private customers: CustomerRecord[] = [];
  private identities: IdentityRecord[] = [];
  private orders: OrderRecord[] = [];
  private shipments: ShipmentRecord[] = [];
  private tokens = new Map<string, VerificationToken>();
  private attempts = new Map<string, VerificationAttemptState>();
  private requestCounts = new Map<string, number>(); // `${runId}:${system}`
  private log: RequestLogEntry[] = [];
  private seq = 0;
  now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now());
    this.reset();
  }

  /** Restore all fixtures, clear tokens, attempts, counters and the request log. */
  reset(): void {
    this.customers = customerFixtures.map((c) => ({ ...c }));
    this.identities = identityFixtures.map((i) => ({ ...i }));
    this.orders = orderFixtures.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    this.shipments = shipmentFixtures.map((s) => ({ ...s, events: s.events.map((e) => ({ ...e })) }));
    this.tokens.clear();
    this.attempts.clear();
    this.requestCounts.clear();
    this.log = [];
    this.seq = 0;
  }

  /** Clear per-run counters (flaky/rate-limit state) without touching data. */
  resetRun(runId: string): void {
    for (const key of Array.from(this.requestCounts.keys())) {
      if (key.startsWith(`${runId}:`)) this.requestCounts.delete(key);
    }
  }

  getLog(runId?: string): RequestLogEntry[] {
    return runId ? this.log.filter((e) => e.runId === runId) : [...this.log];
  }

  /** Read-only view of non-secret data for the practice-system documentation page. */
  snapshot() {
    return {
      customers: this.customers.map((c) => ({ ...c })),
      orders: this.orders.map((o) => ({ ...o })),
      shipments: this.shipments.map((s) => ({ ...s })),
      activeTokens: Array.from(this.tokens.values()).map((t) => ({
        customerId: t.customerId,
        expiresAt: new Date(t.expiresAt).toISOString(),
      })),
      lockedCustomers: Array.from(this.attempts.entries())
        .filter(([, s]) => s.lockedUntil && s.lockedUntil > this.now())
        .map(([id]) => id),
    };
  }

  /**
   * Values that must never appear in learner-visible output. Used by tests and
   * by the trace redactor as a last line of defence.
   */
  secretValues(): string[] {
    const out: string[] = [];
    for (const i of this.identities) {
      out.push(i.dateOfBirth, i.postalCode);
    }
    return out;
  }

  isValidToken(token: string | undefined, customerId: string): boolean {
    if (!token) return false;
    const t = this.tokens.get(token);
    if (!t) return false;
    if (t.expiresAt <= this.now()) return false;
    return t.customerId === customerId;
  }

  handle(request: VirtualRequest, options: HandleOptions = {}): VirtualResponse {
    const runId = options.runId ?? 'adhoc';
    const resolved = resolveRoute(request.url);
    if (!resolved.ok) {
      if (resolved.status === 0) {
        // The transport turns this into a network-level error.
        return {
          status: 0,
          headers: {},
          body: { error: resolved.error, message: resolved.message },
          latencyMs: 0,
        };
      }
      return json(resolved.status, { error: resolved.error, message: resolved.message }, 20);
    }
    const { system, path, query } = resolved.match;
    const fault: FaultMode = options.faults?.[system] ?? 'none';
    const countKey = `${runId}:${system}`;
    const count = (this.requestCounts.get(countKey) ?? 0) + 1;
    this.requestCounts.set(countKey, count);

    const record = (status: number, extra: Partial<RequestLogEntry> = {}) => {
      this.seq += 1;
      this.log.push({
        seq: this.seq,
        runId,
        system,
        method: request.method,
        path: path + (query.toString() ? `?${query.toString()}` : ''),
        status,
        timestamp: this.now(),
        ...extra,
      });
    };

    // --- Fault injection -----------------------------------------------------
    const baseLatency = BASE_LATENCY[system];
    if (fault === 'timeout') {
      record(0, { note: 'FAULT_TIMEOUT' });
      return { status: 0, headers: {}, body: undefined, latencyMs: 30_000 };
    }
    if (fault === 'unavailable' || (fault === 'flaky' && count === 1)) {
      record(503, { note: fault === 'flaky' ? 'FAULT_FLAKY' : 'FAULT_UNAVAILABLE' });
      return json(
        503,
        { error: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry later.' },
        80,
        { 'retry-after': '2' },
      );
    }
    const limit = fault === 'rate_limit' ? RATE_LIMIT_FAULT_REQUESTS_PER_RUN : DEFAULT_REQUESTS_PER_RUN;
    if (count > limit) {
      record(429, { note: 'RATE_LIMITED' });
      return json(
        429,
        {
          error: 'RATE_LIMITED',
          message: `Request quota exceeded for this run (${limit} request${limit === 1 ? '' : 's'} per run). Wait for Retry-After before retrying.`,
          limit,
        },
        30,
        { 'retry-after': '1', 'x-ratelimit-limit': String(limit), 'x-ratelimit-remaining': '0' },
      );
    }
    if (fault === 'malformed') {
      record(200, { note: 'FAULT_MALFORMED' });
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: undefined,
        rawBody: '{"orders": [{"orderId": "ORD-1',
        latencyMs: baseLatency,
      };
    }
    const latency = fault === 'slow' ? 2_500 : baseLatency;

    // --- Route to the system -------------------------------------------------
    let response: VirtualResponse;
    let logExtra: Partial<RequestLogEntry> = {};
    const note = (status: number, extra: Partial<RequestLogEntry>) => {
      logExtra = { ...logExtra, ...extra };
      return status;
    };
    switch (system) {
      case 'crm':
        response = this.handleCrm(request, path, query, latency, note);
        break;
      case 'verification':
        response = this.handleVerification(request, path, query, latency, note);
        break;
      case 'orders':
        response = this.handleOrders(request, path, query, latency, note);
        break;
      case 'carrier':
        response = this.handleCarrier(request, path, query, latency, note);
        break;
    }
    record(response.status, logExtra);
    return response;
  }

  // ---------------------------------------------------------------------------
  // Customer Master
  // ---------------------------------------------------------------------------
  private handleCrm(
    req: VirtualRequest,
    path: string,
    query: URLSearchParams,
    latency: number,
    note: (status: number, extra: Partial<RequestLogEntry>) => number,
  ): VirtualResponse {
    const auth = headerLookup(req.headers, 'authorization');
    if (auth !== `Bearer ${sandboxCredentials.crmBearerToken}`) {
      return json(
        note(401, { note: 'AUTH_FAILED' }),
        { error: 'UNAUTHORIZED', message: 'Missing or invalid bearer token. Send Authorization: Bearer <CRM token>.' },
        latency,
        { 'www-authenticate': 'Bearer realm="crm"' },
      );
    }
    if (req.method === 'GET' && path === '/customers') {
      const phone = query.get('phone');
      const email = query.get('email');
      const lastName = query.get('lastName');
      const customerId = query.get('customerId');
      const status = query.get('status');
      if (!phone && !email && !lastName && !customerId) {
        return json(
          note(400, { note: 'VALIDATION_ERROR' }),
          {
            error: 'VALIDATION_ERROR',
            message: 'Provide at least one search parameter: phone, email, lastName or customerId.',
          },
          latency,
        );
      }
      let results = this.customers;
      if (phone) {
        const normalized = normalizePhone(phone);
        if (!normalized) {
          return json(
            note(400, { note: 'VALIDATION_ERROR' }),
            { error: 'VALIDATION_ERROR', message: `phone "${phone}" could not be normalized to E.164.` },
            latency,
          );
        }
        results = results.filter((c) => c.phone === normalized);
      }
      if (email) results = results.filter((c) => c.email.toLowerCase() === email.trim().toLowerCase());
      if (lastName) results = results.filter((c) => c.lastName.toLowerCase() === lastName.trim().toLowerCase());
      if (customerId) results = results.filter((c) => c.customerId === customerId.trim());
      if (status) results = results.filter((c) => c.status === status.toUpperCase());
      note(200, { note: `MATCHES_${results.length}` });
      return json(
        200,
        {
          count: results.length,
          customers: results.map((c) => this.customerSummary(c)),
          query: Object.fromEntries(query.entries()),
        },
        latency,
      );
    }
    const detail = path.match(/^\/customers\/([^/]+)$/);
    if (req.method === 'GET' && detail) {
      const c = this.customers.find((x) => x.customerId === detail[1]);
      if (!c) {
        return json(note(404, { note: 'CUSTOMER_NOT_FOUND' }), { error: 'CUSTOMER_NOT_FOUND', message: `No customer ${detail[1]}.` }, latency);
      }
      note(200, { customerId: c.customerId });
      return json(200, { ...c }, latency);
    }
    return json(note(404, { note: 'NOT_FOUND' }), { error: 'NOT_FOUND', message: `No route ${req.method} ${path} on the CRM API.` }, latency);
  }

  private customerSummary(c: CustomerRecord) {
    return {
      customerId: c.customerId,
      firstName: c.firstName,
      lastName: c.lastName,
      emailMasked: maskEmail(c.email),
      phoneMasked: maskPhone(c.phone),
      city: c.city,
      state: c.state,
      status: c.status,
      accountType: c.accountType,
      loyaltyTier: c.loyaltyTier,
      createdAt: c.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Identity Verification
  // ---------------------------------------------------------------------------
  private handleVerification(
    req: VirtualRequest,
    path: string,
    _query: URLSearchParams,
    latency: number,
    note: (status: number, extra: Partial<RequestLogEntry>) => number,
  ): VirtualResponse {
    const auth = headerLookup(req.headers, 'authorization');
    if (auth !== `Bearer ${sandboxCredentials.verificationBearerToken}`) {
      return json(
        note(401, { note: 'AUTH_FAILED' }),
        { error: 'UNAUTHORIZED', message: 'Missing or invalid bearer token for the verification service.' },
        latency,
        { 'www-authenticate': 'Bearer realm="verification"' },
      );
    }
    if (req.method === 'POST' && path === '/verify') {
      const body = (req.body ?? {}) as { customerId?: unknown; factors?: Record<string, unknown> };
      if (typeof req.body === 'string') {
        return json(
          note(400, { note: 'VALIDATION_ERROR' }),
          { error: 'VALIDATION_ERROR', message: 'Request body must be JSON with content-type application/json.' },
          latency,
        );
      }
      const customerId = typeof body.customerId === 'string' ? body.customerId : undefined;
      const factors = body.factors && typeof body.factors === 'object' ? body.factors : undefined;
      if (!customerId || !factors) {
        return json(
          note(400, { note: 'VALIDATION_ERROR' }),
          {
            error: 'VALIDATION_ERROR',
            message: 'Body must include customerId (string) and factors { dateOfBirth, postalCode }.',
            received: { customerId: customerId ?? null, factors: factors ? Object.keys(factors) : null },
          },
          latency,
        );
      }
      const identity = this.identities.find((i) => i.customerId === customerId);
      if (!identity) {
        return json(note(404, { note: 'CUSTOMER_NOT_FOUND' }), { error: 'CUSTOMER_NOT_FOUND', message: `No identity record for ${customerId}.` }, latency);
      }
      const state = this.attempts.get(customerId) ?? { failedAttempts: 0, lockedUntil: null };
      if (state.lockedUntil && state.lockedUntil > this.now()) {
        return json(
          note(423, { customerId, note: 'LOCKED' }),
          {
            verified: false,
            reason: 'LOCKED',
            message: 'Too many failed attempts. Verification is locked for this customer.',
            lockedUntil: new Date(state.lockedUntil).toISOString(),
          },
          latency,
        );
      }
      const missing = ['dateOfBirth', 'postalCode'].filter((f) => typeof factors[f] !== 'string' || !(factors[f] as string).trim());
      if (missing.length) {
        return json(
          note(400, { note: 'VALIDATION_ERROR' }),
          { error: 'VALIDATION_ERROR', message: `Missing verification factor(s): ${missing.join(', ')}. Policy requires both.` },
          latency,
        );
      }
      const dobOk = normalizeDate(String(factors.dateOfBirth)) === identity.dateOfBirth;
      const postalOk = String(factors.postalCode).replace(/\s/g, '') === identity.postalCode;
      if (dobOk && postalOk) {
        const token: VerificationToken = {
          token: randomToken(),
          customerId,
          issuedAt: this.now(),
          expiresAt: this.now() + TOKEN_TTL_MINUTES * 60_000,
        };
        this.tokens.set(token.token, token);
        this.attempts.set(customerId, { failedAttempts: 0, lockedUntil: null });
        return json(
          note(200, { customerId, note: 'VERIFIED' }),
          {
            verified: true,
            customerId,
            method: 'KNOWLEDGE_FACTORS',
            token: token.token,
            expiresAt: new Date(token.expiresAt).toISOString(),
          },
          latency,
        );
      }
      const failed = state.failedAttempts + 1;
      const locked = failed >= MAX_FAILED_ATTEMPTS;
      this.attempts.set(customerId, {
        failedAttempts: failed,
        lockedUntil: locked ? this.now() + LOCK_MINUTES * 60_000 : null,
      });
      return json(
        note(200, { customerId, note: locked ? 'FACTOR_MISMATCH_LOCKED' : 'FACTOR_MISMATCH' }),
        {
          verified: false,
          reason: 'FACTOR_MISMATCH',
          message: 'One or more factors did not match our records.',
          attemptsRemaining: Math.max(0, MAX_FAILED_ATTEMPTS - failed),
        },
        latency,
      );
    }
    const status = path.match(/^\/status\/([^/]+)$/);
    if (req.method === 'GET' && status) {
      const customerId = status[1];
      const identity = this.identities.find((i) => i.customerId === customerId);
      if (!identity) {
        return json(note(404, { note: 'CUSTOMER_NOT_FOUND' }), { error: 'CUSTOMER_NOT_FOUND', message: `No identity record for ${customerId}.` }, latency);
      }
      const state = this.attempts.get(customerId) ?? { failedAttempts: 0, lockedUntil: null };
      const active = Array.from(this.tokens.values()).filter((t) => t.customerId === customerId && t.expiresAt > this.now());
      return json(
        note(200, { customerId }),
        {
          customerId,
          locked: Boolean(state.lockedUntil && state.lockedUntil > this.now()),
          failedAttempts: state.failedAttempts,
          activeTokens: active.length,
          policy: { requiredFactors: ['dateOfBirth', 'postalCode'], maxFailedAttempts: MAX_FAILED_ATTEMPTS, tokenTtlMinutes: TOKEN_TTL_MINUTES },
        },
        latency,
      );
    }
    if (req.method === 'POST' && path === '/tokens/introspect') {
      const body = (req.body ?? {}) as { token?: unknown };
      const token = typeof body.token === 'string' ? this.tokens.get(body.token) : undefined;
      if (!token || token.expiresAt <= this.now()) {
        return json(note(200, {}), { active: false }, latency);
      }
      return json(note(200, { customerId: token.customerId }), { active: true, customerId: token.customerId, expiresAt: new Date(token.expiresAt).toISOString() }, latency);
    }
    return json(note(404, { note: 'NOT_FOUND' }), { error: 'NOT_FOUND', message: `No route ${req.method} ${path} on the verification API.` }, latency);
  }

  // ---------------------------------------------------------------------------
  // Order Management — protected by the verification token
  // ---------------------------------------------------------------------------
  private handleOrders(
    req: VirtualRequest,
    path: string,
    query: URLSearchParams,
    latency: number,
    note: (status: number, extra: Partial<RequestLogEntry>) => number,
  ): VirtualResponse {
    const apiKey = headerLookup(req.headers, 'x-api-key');
    if (apiKey !== sandboxCredentials.ordersApiKey) {
      return json(note(401, { note: 'AUTH_FAILED' }), { error: 'UNAUTHORIZED', message: 'Missing or invalid X-Api-Key header for the OMS API.' }, latency);
    }
    const verificationToken = headerLookup(req.headers, 'x-verification-token');

    const guard = (customerId: string): VirtualResponse | null => {
      if (!verificationToken) {
        return json(
          note(403, { customerId, note: 'VERIFICATION_REQUIRED', protectedDataReleased: false }),
          {
            error: 'VERIFICATION_REQUIRED',
            message: 'Order data is protected. Send a valid X-Verification-Token issued by the verification service for this customer.',
          },
          latency,
        );
      }
      const t = this.tokens.get(verificationToken);
      if (!t || t.expiresAt <= this.now()) {
        return json(
          note(403, { customerId, note: 'VERIFICATION_TOKEN_INVALID', protectedDataReleased: false }),
          { error: 'VERIFICATION_TOKEN_INVALID', message: 'The verification token is unknown or has expired.' },
          latency,
        );
      }
      if (t.customerId !== customerId) {
        return json(
          note(403, { customerId, note: 'VERIFICATION_TOKEN_MISMATCH', protectedDataReleased: false }),
          {
            error: 'VERIFICATION_TOKEN_MISMATCH',
            message: 'The verification token was issued for a different customer than the one whose orders were requested.',
          },
          latency,
        );
      }
      return null;
    };

    if (req.method === 'GET' && path === '/orders') {
      const customerId = query.get('customerId');
      if (!customerId) {
        return json(note(400, { note: 'VALIDATION_ERROR' }), { error: 'VALIDATION_ERROR', message: 'customerId query parameter is required.' }, latency);
      }
      const denied = guard(customerId);
      if (denied) return denied;
      let orders = this.orders.filter((o) => o.customerId === customerId);
      const status = query.get('status');
      if (status) orders = orders.filter((o) => o.status === status.toUpperCase());
      orders = orders.sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));
      const limit = Number(query.get('limit') ?? '50');
      if (Number.isFinite(limit) && limit > 0) orders = orders.slice(0, limit);
      note(200, { customerId, protectedDataReleased: orders.length > 0, note: `ORDERS_${orders.length}` });
      return json(200, { customerId, count: orders.length, orders: orders.map((o) => ({ ...o })) }, latency);
    }
    const detail = path.match(/^\/orders\/([^/]+)$/);
    if (req.method === 'GET' && detail) {
      const order = this.orders.find((o) => o.orderId === detail[1]);
      if (!order) {
        // Deliberately require a token even to learn that an order does not exist.
        if (!verificationToken) {
          return json(
            note(403, { note: 'VERIFICATION_REQUIRED', protectedDataReleased: false }),
            { error: 'VERIFICATION_REQUIRED', message: 'Order data is protected. Send a valid X-Verification-Token.' },
            latency,
          );
        }
        return json(note(404, { note: 'ORDER_NOT_FOUND' }), { error: 'ORDER_NOT_FOUND', message: `No order ${detail[1]}.` }, latency);
      }
      const denied = guard(order.customerId);
      if (denied) return denied;
      note(200, { customerId: order.customerId, protectedDataReleased: true });
      return json(200, { ...order }, latency);
    }
    return json(note(404, { note: 'NOT_FOUND' }), { error: 'NOT_FOUND', message: `No route ${req.method} ${path} on the OMS API.` }, latency);
  }

  // ---------------------------------------------------------------------------
  // Carrier Tracking
  // ---------------------------------------------------------------------------
  private handleCarrier(
    req: VirtualRequest,
    path: string,
    query: URLSearchParams,
    latency: number,
    note: (status: number, extra: Partial<RequestLogEntry>) => number,
  ): VirtualResponse {
    const apiKey = headerLookup(req.headers, 'x-api-key');
    if (apiKey !== sandboxCredentials.carrierApiKey) {
      return json(note(401, { note: 'AUTH_FAILED' }), { error: 'UNAUTHORIZED', message: 'Missing or invalid X-Api-Key header for the carrier API.' }, latency);
    }
    let trackingNumber: string | null = null;
    const detail = path.match(/^\/shipments\/([^/]+)$/);
    if (req.method === 'GET' && detail) trackingNumber = decodeURIComponent(detail[1]);
    else if (req.method === 'GET' && path === '/shipments') trackingNumber = query.get('trackingNumber');
    if (trackingNumber !== null) {
      if (!trackingNumber) {
        return json(note(400, { note: 'VALIDATION_ERROR' }), { error: 'VALIDATION_ERROR', message: 'trackingNumber is required.' }, latency);
      }
      const shipment = this.shipments.find((s) => s.trackingNumber === trackingNumber);
      if (!shipment) {
        return json(note(404, { note: 'TRACKING_NOT_FOUND' }), { error: 'TRACKING_NOT_FOUND', message: `No shipment with tracking number ${trackingNumber}.` }, latency);
      }
      const lastEvent = shipment.events[shipment.events.length - 1] ?? null;
      note(200, {});
      return json(200, { ...shipment, lastEvent }, latency);
    }
    return json(note(404, { note: 'NOT_FOUND' }), { error: 'NOT_FOUND', message: `No route ${req.method} ${path} on the carrier API.` }, latency);
  }
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY, DD.MM.YYYY and returns YYYY-MM-DD (or the trimmed input). */
export function normalizeDate(input: string): string {
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

export type { HttpMethod };
