/**
 * Transports carry a request from the workflow engine to a practice system.
 *
 *  - VirtualTransport: in-browser, calls the PracticeSystems router directly and
 *    simulates latency/timeouts without needing a server.
 *  - HttpTransport: real HTTP via fetch (used with the optional Node server).
 */
import type { FaultConfig, VirtualRequest } from '../systems/types';
import type { PracticeSystems } from '../systems/practiceSystems';
import type { TraceResponse, TransportError } from './types';

export interface SendOptions {
  timeoutMs: number;
  runId: string;
}

export type SendResult =
  | { ok: true; response: TraceResponse }
  | { ok: false; error: TransportError };

export interface Transport {
  readonly kind: 'virtual' | 'http';
  send(request: VirtualRequest, options: SendOptions): Promise<SendResult>;
  /** Wait for a retry backoff. Virtual transport can skip real waiting. */
  wait(ms: number): Promise<void>;
  /** Request log for a run (virtual only). */
  systemLog?(runId: string): import('../systems/types').RequestLogEntry[];
}

export interface VirtualTransportOptions {
  faults?: FaultConfig;
  /** 'instant' never sleeps (tests); 'realistic' sleeps a capped real delay for UX. */
  speed?: 'instant' | 'realistic';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class VirtualTransport implements Transport {
  readonly kind = 'virtual' as const;
  faults: FaultConfig;
  speed: 'instant' | 'realistic';

  constructor(
    private readonly systems: PracticeSystems,
    options: VirtualTransportOptions = {},
  ) {
    this.faults = options.faults ?? {};
    this.speed = options.speed ?? 'instant';
  }

  async send(request: VirtualRequest, options: SendOptions): Promise<SendResult> {
    const response = this.systems.handle(request, { runId: options.runId, faults: this.faults });
    if (response.status === 0 && response.latencyMs === 0) {
      const body = response.body as { message?: string } | undefined;
      return { ok: false, error: { kind: 'network', message: body?.message ?? 'Network error', elapsedMs: 0 } };
    }
    const latency = response.latencyMs;
    if (latency > options.timeoutMs) {
      await this.pause(Math.min(options.timeoutMs, 400));
      return {
        ok: false,
        error: {
          kind: 'timeout',
          message: `No response within ${options.timeoutMs} ms (the service would have answered after ~${latency} ms).`,
          elapsedMs: options.timeoutMs,
        },
      };
    }
    await this.pause(Math.min(latency, 250));
    const traceResponse: TraceResponse = {
      status: response.status,
      headers: response.headers,
      body: response.body,
      rawBody: response.rawBody,
      elapsedMs: latency,
      simulatedLatencyMs: latency,
    };
    if (response.rawBody !== undefined && response.body === undefined) {
      traceResponse.parseError = describeParseError(response.rawBody);
    }
    return { ok: true, response: traceResponse };
  }

  async wait(ms: number): Promise<void> {
    await this.pause(Math.min(ms, 300));
  }

  systemLog(runId: string) {
    return this.systems.getLog(runId);
  }

  private async pause(ms: number): Promise<void> {
    if (this.speed === 'realistic' && ms > 0) await sleep(ms);
  }
}

export class HttpTransport implements Transport {
  readonly kind = 'http' as const;

  async send(request: VirtualRequest, options: SendOptions): Promise<SendResult> {
    const controller = new AbortController();
    const started = Date.now();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const headers: Record<string, string> = { ...request.headers };
      let body: string | undefined;
      if (request.body !== undefined && request.method !== 'GET') {
        body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
        if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
          headers['content-type'] = 'application/json';
        }
      }
      const res = await fetch(request.url, { method: request.method, headers, body, signal: controller.signal });
      const text = await res.text();
      const elapsedMs = Date.now() - started;
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => (resHeaders[k] = v));
      let parsed: unknown = undefined;
      let parseError: string | undefined;
      if (text.length) {
        try {
          parsed = JSON.parse(text);
        } catch {
          parseError = describeParseError(text);
        }
      }
      return {
        ok: true,
        response: { status: res.status, headers: resHeaders, body: parsed, rawBody: parseError ? text : undefined, parseError, elapsedMs },
      };
    } catch (err) {
      const elapsedMs = Date.now() - started;
      const isAbort = (err as Error).name === 'AbortError';
      return {
        ok: false,
        error: {
          kind: isAbort ? 'timeout' : 'network',
          message: isAbort ? `No response within ${options.timeoutMs} ms.` : `Network error: ${(err as Error).message}`,
          elapsedMs,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async wait(ms: number): Promise<void> {
    await sleep(Math.min(ms, 5_000));
  }
}

export function describeParseError(raw: string): string {
  const preview = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
  try {
    JSON.parse(raw);
    return 'Body is valid JSON';
  } catch (err) {
    return `Response body is not valid JSON (${(err as Error).message}). Body starts with: ${JSON.stringify(preview)}`;
  }
}
