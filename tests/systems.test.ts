import { beforeEach, describe, expect, it } from 'vitest';
import { PracticeSystems, normalizePhone, resolveRoute } from '../src/core/systems/practiceSystems';
import { sandboxCredentials } from '../src/core/systems/fixtures';
import type { VirtualRequest } from '../src/core/systems/types';

const CRM = 'https://crm.practice.local/api/v1';
const VERIFY = 'https://verify.practice.local/api/v1';
const OMS = 'https://orders.practice.local/api/v2';
const CARRIER = 'https://carrier.practice.local/track/v1';

const crmAuth = { Authorization: `Bearer ${sandboxCredentials.crmBearerToken}` };
const verifyAuth = { Authorization: `Bearer ${sandboxCredentials.verificationBearerToken}` };
const omsKey = { 'X-Api-Key': sandboxCredentials.ordersApiKey };
const carrierKey = { 'X-Api-Key': sandboxCredentials.carrierApiKey };

function get(url: string, headers: Record<string, string> = {}): VirtualRequest {
  return { method: 'GET', url, headers };
}
function post(url: string, body: unknown, headers: Record<string, string> = {}): VirtualRequest {
  return { method: 'POST', url, headers: { 'content-type': 'application/json', ...headers }, body };
}

describe('routing helpers', () => {
  it('resolves virtual hosts and HTTP-server prefixes to the same system', () => {
    const a = resolveRoute('https://orders.practice.local/api/v2/orders?customerId=CUST-1001');
    const b = resolveRoute('http://localhost:8787/orders/api/v2/orders?customerId=CUST-1001');
    expect(a.ok && a.match.system).toBe('orders');
    expect(b.ok && b.match.system).toBe('orders');
    expect(a.ok && a.match.path).toBe('/orders');
    expect(b.ok && b.match.path).toBe('/orders');
  });
  it('rejects unknown hosts and relative URLs with helpful messages', () => {
    const unknown = resolveRoute('https://example.com/api');
    expect(unknown.ok).toBe(false);
    expect(!unknown.ok && unknown.error).toBe('UNKNOWN_HOST');
    const relative = resolveRoute('/customers');
    expect(!relative.ok && relative.error).toBe('INVALID_URL');
    expect(!relative.ok && relative.message).toContain('env.CRM_BASE_URL');
  });
  it('normalizes phone numbers to E.164', () => {
    expect(normalizePhone('602-555-0101')).toBe('+16025550101');
    expect(normalizePhone('(602) 555 0101')).toBe('+16025550101');
    expect(normalizePhone('+1 602 555 0101')).toBe('+16025550101');
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('Customer Master', () => {
  let systems: PracticeSystems;
  beforeEach(() => {
    systems = new PracticeSystems();
  });

  it('requires a bearer token', () => {
    const res = systems.handle(get(`${CRM}/customers?phone=6025550101`));
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Bearer');
    const wrong = systems.handle(get(`${CRM}/customers?phone=6025550101`, { Authorization: 'Bearer nope' }));
    expect(wrong.status).toBe(401);
  });

  it('finds a single customer by loosely formatted phone', () => {
    const res = systems.handle(get(`${CRM}/customers?phone=${encodeURIComponent('602-555-0101')}`, crmAuth));
    expect(res.status).toBe(200);
    const body = res.body as { count: number; customers: Array<{ customerId: string; emailMasked: string }> };
    expect(body.count).toBe(1);
    expect(body.customers[0].customerId).toBe('CUST-1001');
    expect(body.customers[0].emailMasked).toBe('p***n@example.com');
    expect(JSON.stringify(body)).not.toContain('priya.raman@example.com');
  });

  it('returns duplicates for a shared phone number and supports narrowing', () => {
    const res = systems.handle(get(`${CRM}/customers?phone=6025550102`, crmAuth));
    expect((res.body as { count: number }).count).toBe(2);
    const narrowed = systems.handle(get(`${CRM}/customers?phone=6025550102&email=maria.garcia%40example.com`, crmAuth));
    const body = narrowed.body as { count: number; customers: Array<{ customerId: string }> };
    expect(body.count).toBe(1);
    expect(body.customers[0].customerId).toBe('CUST-1002');
    const byType = systems.handle(get(`${CRM}/customers?phone=6025550102&status=ACTIVE`, crmAuth));
    expect((byType.body as { count: number }).count).toBe(2);
  });

  it('filters inactive legacy records with status=ACTIVE', () => {
    const all = systems.handle(get(`${CRM}/customers?phone=6025550109`, crmAuth));
    expect((all.body as { count: number }).count).toBe(2);
    const active = systems.handle(get(`${CRM}/customers?phone=6025550109&status=ACTIVE`, crmAuth));
    expect((active.body as { count: number; customers: Array<{ customerId: string }> }).customers[0].customerId).toBe('CUST-1009');
  });

  it('returns ambiguous matches for a last name and empty results for unknown identifiers', () => {
    expect((systems.handle(get(`${CRM}/customers?lastName=garcia`, crmAuth)).body as { count: number }).count).toBe(3);
    const none = systems.handle(get(`${CRM}/customers?phone=6025550199`, crmAuth));
    expect(none.status).toBe(200);
    expect((none.body as { count: number }).count).toBe(0);
  });

  it('validates search parameters', () => {
    expect(systems.handle(get(`${CRM}/customers`, crmAuth)).status).toBe(400);
    expect(systems.handle(get(`${CRM}/customers?phone=12`, crmAuth)).status).toBe(400);
    expect(systems.handle(get(`${CRM}/customers/CUST-9999`, crmAuth)).status).toBe(404);
    expect(systems.handle(get(`${CRM}/nope`, crmAuth)).status).toBe(404);
    expect(systems.handle(get(`https://crm.practice.local/wrong/customers`, crmAuth)).status).toBe(404);
  });
});

describe('Identity Verification', () => {
  let now = Date.parse('2026-09-14T12:00:00Z');
  let systems: PracticeSystems;
  beforeEach(() => {
    now = Date.parse('2026-09-14T12:00:00Z');
    systems = new PracticeSystems({ now: () => now });
  });

  it('issues a token only when both factors match', () => {
    const bad = systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1001', factors: { dateOfBirth: '1988-03-15', postalCode: '85004' } }, verifyAuth));
    expect(bad.status).toBe(200);
    expect(bad.body).toMatchObject({ verified: false, reason: 'FACTOR_MISMATCH', attemptsRemaining: 2 });
    expect(JSON.stringify(bad.body)).not.toContain('1988-03-14');

    const good = systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1001', factors: { dateOfBirth: '03/14/1988', postalCode: '85004' } }, verifyAuth));
    expect(good.status).toBe(200);
    const body = good.body as { verified: boolean; token: string; customerId: string };
    expect(body.verified).toBe(true);
    expect(body.token).toMatch(/^vt_/);
    expect(systems.isValidToken(body.token, 'CUST-1001')).toBe(true);
    expect(systems.isValidToken(body.token, 'CUST-1002')).toBe(false);
  });

  it('locks the customer after three failed attempts and reset() clears the lock', () => {
    const wrong = { customerId: 'CUST-1004', factors: { dateOfBirth: '1990-07-23', postalCode: '85281' } };
    systems.handle(post(`${VERIFY}/verify`, wrong, verifyAuth));
    systems.handle(post(`${VERIFY}/verify`, wrong, verifyAuth));
    const third = systems.handle(post(`${VERIFY}/verify`, wrong, verifyAuth));
    expect((third.body as { attemptsRemaining: number }).attemptsRemaining).toBe(0);
    const right = { customerId: 'CUST-1004', factors: { dateOfBirth: '1990-07-22', postalCode: '85281' } };
    const locked = systems.handle(post(`${VERIFY}/verify`, right, verifyAuth));
    expect(locked.status).toBe(423);
    expect(locked.body).toMatchObject({ verified: false, reason: 'LOCKED' });
    const status = systems.handle(get(`${VERIFY}/status/CUST-1004`, verifyAuth));
    expect(status.body).toMatchObject({ locked: true, failedAttempts: 3 });
    systems.reset();
    expect(systems.handle(post(`${VERIFY}/verify`, right, verifyAuth)).body).toMatchObject({ verified: true });
  });

  it('validates input and authentication', () => {
    expect(systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1001' }, verifyAuth)).status).toBe(400);
    expect(systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1001', factors: { dateOfBirth: '1988-03-14' } }, verifyAuth)).status).toBe(400);
    expect(systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-9999', factors: { dateOfBirth: 'x', postalCode: 'y' } }, verifyAuth)).status).toBe(404);
    expect(systems.handle(post(`${VERIFY}/verify`, {}, {})).status).toBe(401);
    expect(systems.handle(post(`${VERIFY}/verify`, 'not json', verifyAuth)).status).toBe(400);
  });

  it('introspects tokens and expires them after 15 minutes', () => {
    const good = systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1001', factors: { dateOfBirth: '1988-03-14', postalCode: '85004' } }, verifyAuth));
    const token = (good.body as { token: string }).token;
    expect(systems.handle(post(`${VERIFY}/tokens/introspect`, { token }, verifyAuth)).body).toMatchObject({ active: true, customerId: 'CUST-1001' });
    now += 16 * 60_000;
    expect(systems.handle(post(`${VERIFY}/tokens/introspect`, { token }, verifyAuth)).body).toMatchObject({ active: false });
    const orders = systems.handle(get(`${OMS}/orders?customerId=CUST-1001`, { ...omsKey, 'X-Verification-Token': token }));
    expect(orders.status).toBe(403);
    expect((orders.body as { error: string }).error).toBe('VERIFICATION_TOKEN_INVALID');
  });
});

describe('Order Management — verification boundary', () => {
  let systems: PracticeSystems;
  let token: string;
  beforeEach(() => {
    systems = new PracticeSystems();
    const good = systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1005', factors: { dateOfBirth: '1985-01-30', postalCode: '85016' } }, verifyAuth));
    token = (good.body as { token: string }).token;
  });

  it('requires the API key', () => {
    expect(systems.handle(get(`${OMS}/orders?customerId=CUST-1005`)).status).toBe(401);
  });

  it('refuses to release orders without a verification token', () => {
    const res = systems.handle(get(`${OMS}/orders?customerId=CUST-1005`, omsKey));
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe('VERIFICATION_REQUIRED');
    expect(JSON.stringify(res.body)).not.toContain('ORD-');
    const log = systems.getLog().find((e) => e.system === 'orders');
    expect(log?.protectedDataReleased).toBe(false);
  });

  it('refuses a token issued for another customer', () => {
    const res = systems.handle(get(`${OMS}/orders?customerId=CUST-1001`, { ...omsKey, 'X-Verification-Token': token }));
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe('VERIFICATION_TOKEN_MISMATCH');
    const detail = systems.handle(get(`${OMS}/orders/ORD-10021`, { ...omsKey, 'X-Verification-Token': token }));
    expect(detail.status).toBe(403);
  });

  it('releases orders (newest first) with a matching token, and an empty list for customers without orders', () => {
    const res = systems.handle(get(`${OMS}/orders?customerId=CUST-1005`, { ...omsKey, 'X-Verification-Token': token }));
    expect(res.status).toBe(200);
    const body = res.body as { count: number; orders: Array<{ orderId: string }> };
    expect(body.count).toBe(3);
    expect(body.orders.map((o) => o.orderId)).toEqual(['ORD-10052', 'ORD-10051', 'ORD-10050']);
    expect(systems.getLog().at(-1)?.protectedDataReleased).toBe(true);

    const filtered = systems.handle(get(`${OMS}/orders?customerId=CUST-1005&status=in_transit`, { ...omsKey, 'X-Verification-Token': token }));
    expect((filtered.body as { count: number }).count).toBe(1);

    const aishaToken = (systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1006', factors: { dateOfBirth: '1993-09-09', postalCode: '85254' } }, verifyAuth)).body as { token: string }).token;
    const empty = systems.handle(get(`${OMS}/orders?customerId=CUST-1006`, { ...omsKey, 'X-Verification-Token': aishaToken }));
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ count: 0, orders: [] });
  });

  it('protects order detail and requires customerId on the list endpoint', () => {
    expect(systems.handle(get(`${OMS}/orders`, omsKey)).status).toBe(400);
    expect(systems.handle(get(`${OMS}/orders/ORD-10051`, omsKey)).status).toBe(403);
    expect(systems.handle(get(`${OMS}/orders/ORD-99999`, omsKey)).status).toBe(403);
    expect(systems.handle(get(`${OMS}/orders/ORD-99999`, { ...omsKey, 'X-Verification-Token': token })).status).toBe(404);
    const ok = systems.handle(get(`${OMS}/orders/ORD-10051`, { ...omsKey, 'X-Verification-Token': token }));
    expect(ok.status).toBe(200);
    expect((ok.body as { orderId: string }).orderId).toBe('ORD-10051');
  });
});

describe('Carrier Tracking', () => {
  const systems = new PracticeSystems();
  it('requires an API key and returns the last event', () => {
    expect(systems.handle(get(`${CARRIER}/shipments/SP-7781-2201`)).status).toBe(401);
    const res = systems.handle(get(`${CARRIER}/shipments/SP-7781-2201`, carrierKey));
    expect(res.status).toBe(200);
    expect((res.body as { lastEvent: { description: string } }).lastEvent.description).toBe('Arrived at regional hub');
    expect(systems.handle(get(`${CARRIER}/shipments?trackingNumber=SP-7781-2201`, carrierKey)).status).toBe(200);
    expect(systems.handle(get(`${CARRIER}/shipments/NOPE-1`, carrierKey)).status).toBe(404);
    expect(systems.handle(get(`${CARRIER}/shipments?trackingNumber=`, carrierKey)).status).toBe(400);
  });
});

describe('Fault injection', () => {
  it('simulates timeouts, outages, flakiness, malformed bodies and rate limits per run', () => {
    const systems = new PracticeSystems();
    const req = get(`${CARRIER}/shipments/SP-7781-2201`, carrierKey);
    const timeout = systems.handle(req, { runId: 'r1', faults: { carrier: 'timeout' } });
    expect(timeout.status).toBe(0);
    expect(timeout.latencyMs).toBeGreaterThan(10_000);

    const down = systems.handle(req, { runId: 'r2', faults: { carrier: 'unavailable' } });
    expect(down.status).toBe(503);
    expect(down.headers['retry-after']).toBe('2');

    expect(systems.handle(req, { runId: 'r3', faults: { carrier: 'flaky' } }).status).toBe(503);
    expect(systems.handle(req, { runId: 'r3', faults: { carrier: 'flaky' } }).status).toBe(200);
    expect(systems.handle(req, { runId: 'r4', faults: { carrier: 'flaky' } }).status).toBe(503);

    const malformed = systems.handle(req, { runId: 'r5', faults: { carrier: 'malformed' } });
    expect(malformed.status).toBe(200);
    expect(malformed.body).toBeUndefined();
    expect(malformed.rawBody).toContain('{"orders"');

    expect(systems.handle(req, { runId: 'r6', faults: { carrier: 'rate_limit' } }).status).toBe(200);
    const limited = systems.handle(req, { runId: 'r6', faults: { carrier: 'rate_limit' } });
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('1');

    const slow = systems.handle(req, { runId: 'r7', faults: { carrier: 'slow' } });
    expect(slow.status).toBe(200);
    expect(slow.latencyMs).toBe(2500);
  });

  it('applies a default per-run quota so runaway loops get 429', () => {
    const systems = new PracticeSystems();
    const req = get(`${CRM}/customers?phone=6025550101`, crmAuth);
    for (let i = 0; i < 25; i += 1) expect(systems.handle(req, { runId: 'loop' }).status).toBe(200);
    expect(systems.handle(req, { runId: 'loop' }).status).toBe(429);
    expect(systems.handle(req, { runId: 'other' }).status).toBe(200);
  });
});

describe('Secrets never leave the practice systems', () => {
  it('no response body contains a verification factor', () => {
    const systems = new PracticeSystems();
    const secrets = systems.secretValues();
    const responses: unknown[] = [];
    for (const phone of ['6025550101', '6025550102', '6025550104', '6025550105', '6025550109']) {
      responses.push(systems.handle(get(`${CRM}/customers?phone=${phone}`, crmAuth)).body);
    }
    for (const id of ['CUST-1001', 'CUST-1002', 'CUST-1003', 'CUST-1009']) {
      responses.push(systems.handle(get(`${CRM}/customers/${id}`, crmAuth)).body);
      responses.push(systems.handle(get(`${VERIFY}/status/${id}`, verifyAuth)).body);
    }
    responses.push(systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1001', factors: { dateOfBirth: '2000-01-01', postalCode: '00000' } }, verifyAuth)).body);
    const good = systems.handle(post(`${VERIFY}/verify`, { customerId: 'CUST-1001', factors: { dateOfBirth: '1988-03-14', postalCode: '85004' } }, verifyAuth));
    responses.push(good.body);
    const token = (good.body as { token: string }).token;
    responses.push(systems.handle(get(`${OMS}/orders?customerId=CUST-1001`, { ...omsKey, 'X-Verification-Token': token })).body);
    responses.push(systems.handle(get(`${CARRIER}/shipments/SP-7781-2201`, carrierKey)).body);
    responses.push(systems.snapshot());
    const text = JSON.stringify(responses);
    for (const s of secrets) expect(text, `secret ${s} appeared in a response`).not.toContain(s);
  });
});
