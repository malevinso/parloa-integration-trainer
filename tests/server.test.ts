import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createPracticeServer } from '../server/index';
import { sandboxCredentials } from '../src/core/systems/fixtures';
import { HttpTransport } from '../src/core/engine/transport';
import { runWorkflow } from '../src/core/engine/executor';
import { ScriptedCustomer } from '../src/core/simulator/customer';
import { personas } from '../src/core/simulator/personas';
import { referenceWismoWorkflow } from '../src/core/workflows/referenceSolution';
import { defaultEnv } from '../src/core/workflows/env';

describe('HTTP practice server', () => {
  const { server, setFaults } = createPracticeServer({ maxLatencyMs: 50 });
  let origin = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('serves the CRM with authentication and the OMS verification boundary', async () => {
    const unauthorized = await fetch(`${origin}/crm/api/v1/customers?phone=6025550101`);
    expect(unauthorized.status).toBe(401);

    const ok = await fetch(`${origin}/crm/api/v1/customers?phone=6025550101`, { headers: { Authorization: `Bearer ${sandboxCredentials.crmBearerToken}` } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('x-simulated-latency-ms')).toBe('120');
    const body = (await ok.json()) as { count: number };
    expect(body.count).toBe(1);

    const denied = await fetch(`${origin}/orders/api/v2/orders?customerId=CUST-1001`, { headers: { 'X-Api-Key': sandboxCredentials.ordersApiKey } });
    expect(denied.status).toBe(403);

    const verify = await fetch(`${origin}/verification/api/v1/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sandboxCredentials.verificationBearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: 'CUST-1001', factors: { dateOfBirth: '1988-03-14', postalCode: '85004' } }),
    });
    const { token } = (await verify.json()) as { token: string };
    const orders = await fetch(`${origin}/orders/api/v2/orders?customerId=CUST-1001`, { headers: { 'X-Api-Key': sandboxCredentials.ordersApiKey, 'X-Verification-Token': token } });
    expect(orders.status).toBe(200);
    expect(((await orders.json()) as { count: number }).count).toBe(1);
  });

  it('exposes admin endpoints for reset, faults and the log', async () => {
    const put = await fetch(`${origin}/__admin/faults`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ carrier: 'unavailable' }) });
    expect(put.status).toBe(200);
    const down = await fetch(`${origin}/carrier/track/v1/shipments/SP-7781-2201`, { headers: { 'X-Api-Key': sandboxCredentials.carrierApiKey } });
    expect(down.status).toBe(503);
    expect(down.headers.get('retry-after')).toBe('2');
    setFaults({});
    const log = (await (await fetch(`${origin}/__admin/log`)).json()) as Array<{ system: string; status: number }>;
    expect(log.some((e) => e.system === 'carrier' && e.status === 503)).toBe(true);
    const reset = await fetch(`${origin}/__admin/reset`, { method: 'POST' });
    expect(reset.status).toBe(200);
    expect(((await (await fetch(`${origin}/__admin/log`)).json()) as unknown[]).length).toBe(0);
  });

  it('runs the reference workflow end to end over real HTTP', async () => {
    const workflow = referenceWismoWorkflow();
    workflow.env = defaultEnv('http', origin);
    const result = await runWorkflow(workflow, { transport: new HttpTransport(), customer: new ScriptedCustomer(personas.priya) });
    expect(result.outcome).toBe('resolved');
    expect(result.verification.verified).toBe(true);
    expect(result.transcript.at(-1)?.text).toContain('ORD-10021');
    expect(JSON.stringify(result)).not.toContain('1988-03-14');
  });
});
