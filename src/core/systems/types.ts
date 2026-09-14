/**
 * Transport-agnostic request/response shapes for the practice business systems.
 *
 * The same router serves two transports:
 *  - the in-browser "virtual HTTP" transport (no server needed), and
 *  - the optional Node HTTP server in /server (real HTTP for curl/Postman).
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface VirtualRequest {
  method: HttpMethod;
  /** Absolute URL, e.g. https://crm.practice.local/api/v1/customers?phone=... */
  url: string;
  headers: Record<string, string>;
  /** Parsed JSON body (object/array/primitive) or raw string. */
  body?: unknown;
}

export interface VirtualResponse {
  status: number;
  headers: Record<string, string>;
  /** JSON body. `undefined` when the response is not valid JSON (see rawBody). */
  body?: unknown;
  /** Exact response text; set when the body is deliberately malformed. */
  rawBody?: string;
  /** Simulated latency in milliseconds. Transports decide whether to really wait. */
  latencyMs: number;
}

export type SystemId = 'crm' | 'verification' | 'orders' | 'carrier';

export type FaultMode =
  | 'none'
  | 'timeout' // every request exceeds any reasonable timeout
  | 'slow' // 2.5 s latency, succeeds
  | 'unavailable' // 503 on every request
  | 'flaky' // first request in a run fails with 503, later ones succeed
  | 'malformed' // 200 with a truncated JSON body
  | 'rate_limit'; // only 1 request per run; then 429 with Retry-After

export type FaultConfig = Partial<Record<SystemId, FaultMode>>;

export interface RequestLogEntry {
  seq: number;
  runId: string;
  system: SystemId;
  method: HttpMethod;
  path: string;
  status: number;
  timestamp: number;
  /** Which customer (if any) the request concerned. */
  customerId?: string;
  /** Whether protected data was released (orders endpoints only). */
  protectedDataReleased?: boolean;
  /** Short machine-readable note, e.g. AUTH_FAILED, VERIFICATION_REQUIRED, FAULT_TIMEOUT. */
  note?: string;
}

export const SYSTEM_LABELS: Record<SystemId, string> = {
  crm: 'Customer Master (CRM)',
  verification: 'Identity Verification Service',
  orders: 'Order Management System (OMS)',
  carrier: 'Carrier Tracking API',
};

/** Hosts used by the in-browser transport. */
export const SYSTEM_HOSTS: Record<SystemId, string> = {
  crm: 'crm.practice.local',
  verification: 'verify.practice.local',
  orders: 'orders.practice.local',
  carrier: 'carrier.practice.local',
};

/** Base path of each API (after the host, or after the /<system> prefix on the HTTP server). */
export const SYSTEM_BASE_PATHS: Record<SystemId, string> = {
  crm: '/api/v1',
  verification: '/api/v1',
  orders: '/api/v2',
  carrier: '/track/v1',
};

export const ALL_SYSTEMS: SystemId[] = ['crm', 'verification', 'orders', 'carrier'];

/** Base URLs for the in-browser transport, exposed to workflows as env variables. */
export function virtualBaseUrls(): Record<string, string> {
  return {
    CRM_BASE_URL: `https://${SYSTEM_HOSTS.crm}${SYSTEM_BASE_PATHS.crm}`,
    VERIFY_BASE_URL: `https://${SYSTEM_HOSTS.verification}${SYSTEM_BASE_PATHS.verification}`,
    ORDERS_BASE_URL: `https://${SYSTEM_HOSTS.orders}${SYSTEM_BASE_PATHS.orders}`,
    CARRIER_BASE_URL: `https://${SYSTEM_HOSTS.carrier}${SYSTEM_BASE_PATHS.carrier}`,
  };
}

/** Base URLs when the optional Node HTTP server is used. */
export function httpBaseUrls(origin: string): Record<string, string> {
  const o = origin.replace(/\/$/, '');
  return {
    CRM_BASE_URL: `${o}/crm${SYSTEM_BASE_PATHS.crm}`,
    VERIFY_BASE_URL: `${o}/verification${SYSTEM_BASE_PATHS.verification}`,
    ORDERS_BASE_URL: `${o}/orders${SYSTEM_BASE_PATHS.orders}`,
    CARRIER_BASE_URL: `${o}/carrier${SYSTEM_BASE_PATHS.carrier}`,
  };
}
