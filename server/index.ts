/**
 * Optional HTTP server exposing the practice business systems over real HTTP,
 * so they can be explored with curl, Postman, or a MuleSoft flow.
 *
 *   npm run api            → http://localhost:8787
 *   PORT=9000 npm run api  → http://localhost:9000
 *
 * Routes mirror the in-browser systems with a system prefix:
 *   /crm/api/v1/...   /verification/api/v1/...   /orders/api/v2/...   /carrier/track/v1/...
 *
 * Admin endpoints (no auth, local use only):
 *   POST /__admin/reset            restore fixtures, tokens, locks and the log
 *   GET  /__admin/log              request log (secrets never appear in it)
 *   GET  /__admin/faults           current fault configuration
 *   PUT  /__admin/faults           { "carrier": "timeout" } etc.
 *
 * Latency is real here: a "timeout" fault really takes ~30 s (cap with MAX_LATENCY_MS).
 * Group requests into a "run" (flaky / rate-limit faults, per-run quota) with an X-Run-Id header.
 */
import http from 'node:http';
import { PracticeSystems } from '../src/core/systems/practiceSystems';
import type { FaultConfig, HttpMethod, VirtualRequest } from '../src/core/systems/types';

export interface ServerOptions {
  faults?: FaultConfig;
  maxLatencyMs?: number;
  systems?: PracticeSystems;
}

export function createPracticeServer(options: ServerOptions = {}) {
  const systems = options.systems ?? new PracticeSystems();
  let faults: FaultConfig = options.faults ?? {};
  const maxLatency = options.maxLatencyMs ?? 30_000;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const method = (req.method ?? 'GET').toUpperCase();
      const origin = `http://${req.headers.host ?? 'localhost'}`;
      const url = new URL(req.url ?? '/', origin);

      const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key, X-Verification-Token, X-Run-Id',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      };
      const send = (status: number, headers: Record<string, string>, body: string) => {
        res.writeHead(status, { ...cors, ...headers });
        res.end(body);
      };
      if (method === 'OPTIONS') return send(204, {}, '');

      if (url.pathname.startsWith('/__admin/')) {
        if (url.pathname === '/__admin/reset' && method === 'POST') {
          systems.reset();
          return send(200, { 'content-type': 'application/json' }, JSON.stringify({ ok: true }));
        }
        if (url.pathname === '/__admin/log' && method === 'GET') {
          return send(200, { 'content-type': 'application/json' }, JSON.stringify(systems.getLog(url.searchParams.get('runId') ?? undefined)));
        }
        if (url.pathname === '/__admin/faults' && method === 'GET') {
          return send(200, { 'content-type': 'application/json' }, JSON.stringify(faults));
        }
        if (url.pathname === '/__admin/faults' && (method === 'PUT' || method === 'POST')) {
          try {
            faults = raw ? (JSON.parse(raw) as FaultConfig) : {};
            return send(200, { 'content-type': 'application/json' }, JSON.stringify(faults));
          } catch {
            return send(400, { 'content-type': 'application/json' }, JSON.stringify({ error: 'VALIDATION_ERROR', message: 'Body must be JSON.' }));
          }
        }
        return send(404, { 'content-type': 'application/json' }, JSON.stringify({ error: 'NOT_FOUND' }));
      }

      if (url.pathname === '/' || url.pathname === '') {
        return send(
          200,
          { 'content-type': 'application/json' },
          JSON.stringify({
            name: 'Parloa Integration Trainer — practice systems',
            systems: { crm: '/crm/api/v1', verification: '/verification/api/v1', orders: '/orders/api/v2', carrier: '/carrier/track/v1' },
            admin: ['POST /__admin/reset', 'GET /__admin/log', 'GET|PUT /__admin/faults'],
          }),
        );
      }

      let body: unknown = undefined;
      if (raw.length) {
        const ct = String(req.headers['content-type'] ?? '');
        if (ct.includes('application/json')) {
          try {
            body = JSON.parse(raw);
          } catch {
            body = raw; // the systems answer 400 for non-JSON bodies where JSON is required
          }
        } else body = raw;
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers[k] = v;
      const request: VirtualRequest = { method: method as HttpMethod, url: url.toString(), headers, body };
      const runId = headers['x-run-id'] ?? 'http';
      const response = systems.handle(request, { runId, faults });
      const latency = Math.min(response.latencyMs, maxLatency);
      setTimeout(() => {
        if (response.status === 0) {
          // Simulated timeout: hold the connection, then drop it.
          req.socket.destroy();
          return;
        }
        const text = response.rawBody !== undefined ? response.rawBody : JSON.stringify(response.body ?? null);
        send(response.status, { ...response.headers, 'x-simulated-latency-ms': String(response.latencyMs) }, text);
      }, latency);
    });
  });
  return { server, systems, setFaults: (f: FaultConfig) => (faults = f) };
}

const isMain = process.argv[1] && /server[\\/]index\.ts$/.test(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const faults = process.env.FAULTS ? (JSON.parse(process.env.FAULTS) as FaultConfig) : {};
  const { server } = createPracticeServer({ faults, maxLatencyMs: process.env.MAX_LATENCY_MS ? Number(process.env.MAX_LATENCY_MS) : undefined });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Practice systems listening on http://localhost:${port}`);
    console.log(`  CRM           http://localhost:${port}/crm/api/v1/customers?phone=602-555-0101`);
    console.log(`  Verification  http://localhost:${port}/verification/api/v1/verify`);
    console.log(`  Orders        http://localhost:${port}/orders/api/v2/orders?customerId=CUST-1001`);
    console.log(`  Carrier       http://localhost:${port}/carrier/track/v1/shipments/SP-7781-2201`);
    console.log(`  Admin         POST /__admin/reset · GET /__admin/log · PUT /__admin/faults`);
  });
}
