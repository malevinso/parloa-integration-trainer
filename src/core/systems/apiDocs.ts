/**
 * Documentation of the practice APIs, rendered on the "Practice systems" page
 * and used as the source of truth for lessons.
 */
import { sandboxCredentials } from './fixtures';
import { SYSTEM_BASE_PATHS, SYSTEM_HOSTS, type SystemId } from './types';

export interface EndpointDoc {
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  params?: Array<{ name: string; where: 'query' | 'path' | 'body' | 'header'; description: string; required?: boolean }>;
  sampleRequest: { url: string; headers: Record<string, string>; body?: unknown };
  sampleResponse: { status: number; body: unknown };
  errors: Array<{ status: number; error: string; when: string }>;
}

export interface SystemDoc {
  id: SystemId;
  name: string;
  purpose: string;
  auth: { scheme: string; header: string; value: string; envVar: string };
  baseUrlEnv: string;
  latencyMs: number;
  notes: string[];
  endpoints: EndpointDoc[];
}

const base = (id: SystemId) => `https://${SYSTEM_HOSTS[id]}${SYSTEM_BASE_PATHS[id]}`;

export const systemDocs: SystemDoc[] = [
  {
    id: 'crm',
    name: 'Customer Master (CRM)',
    purpose: 'System of record for customer identities. Search by identifier, read a record. Never returns verification factors.',
    auth: { scheme: 'Bearer token', header: 'Authorization', value: `Bearer ${sandboxCredentials.crmBearerToken}`, envVar: 'CRM_TOKEN' },
    baseUrlEnv: 'CRM_BASE_URL',
    latencyMs: 120,
    notes: [
      'Search parameters combine with AND. Phone numbers are normalized to E.164 before matching (digits only, 10 digits → +1…).',
      'Search results mask e-mail and phone (emailMasked, phoneMasked); the detail endpoint returns them in clear.',
      'Duplicate and legacy records exist on purpose: two ACTIVE accounts share +1 602 555 0102, and +1 602 555 0109 also matches an INACTIVE merged record. Use status=ACTIVE and clarification questions.',
      'Empty results are HTTP 200 with count 0, not 404.',
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/customers',
        summary: 'Search customers by phone, email, lastName and/or customerId (at least one).',
        params: [
          { name: 'phone', where: 'query', description: 'Any common format; normalized to E.164.' },
          { name: 'email', where: 'query', description: 'Exact match, case-insensitive.' },
          { name: 'lastName', where: 'query', description: 'Exact match, case-insensitive (can be ambiguous).' },
          { name: 'customerId', where: 'query', description: 'Exact customer number.' },
          { name: 'status', where: 'query', description: 'ACTIVE or INACTIVE filter.' },
        ],
        sampleRequest: { url: `${base('crm')}/customers?phone=602-555-0101`, headers: { Authorization: `Bearer ${sandboxCredentials.crmBearerToken}` } },
        sampleResponse: {
          status: 200,
          body: {
            count: 1,
            customers: [
              {
                customerId: 'CUST-1001',
                firstName: 'Priya',
                lastName: 'Raman',
                emailMasked: 'p***n@example.com',
                phoneMasked: '+1•••••0101',
                city: 'Phoenix',
                state: 'AZ',
                status: 'ACTIVE',
                accountType: 'PERSONAL',
                loyaltyTier: 'GOLD',
                createdAt: '2022-04-11T15:22:00Z',
              },
            ],
            query: { phone: '602-555-0101' },
          },
        },
        errors: [
          { status: 400, error: 'VALIDATION_ERROR', when: 'No search parameter, or a phone number that cannot be normalized.' },
          { status: 401, error: 'UNAUTHORIZED', when: 'Missing or wrong bearer token.' },
        ],
      },
      {
        method: 'GET',
        path: '/customers/{customerId}',
        summary: 'Read one customer record (contact details in clear; still no verification factors).',
        params: [{ name: 'customerId', where: 'path', description: 'e.g. CUST-1001', required: true }],
        sampleRequest: { url: `${base('crm')}/customers/CUST-1001`, headers: { Authorization: `Bearer ${sandboxCredentials.crmBearerToken}` } },
        sampleResponse: {
          status: 200,
          body: { customerId: 'CUST-1001', firstName: 'Priya', lastName: 'Raman', email: 'priya.raman@example.com', phone: '+16025550101', city: 'Phoenix', state: 'AZ', country: 'US', status: 'ACTIVE', accountType: 'PERSONAL', loyaltyTier: 'GOLD', createdAt: '2022-04-11T15:22:00Z' },
        },
        errors: [
          { status: 404, error: 'CUSTOMER_NOT_FOUND', when: 'Unknown customer id.' },
          { status: 401, error: 'UNAUTHORIZED', when: 'Missing or wrong bearer token.' },
        ],
      },
    ],
  },
  {
    id: 'verification',
    name: 'Identity Verification Service',
    purpose: 'Checks knowledge factors supplied by the caller against records it holds privately, and issues a short-lived verification token.',
    auth: { scheme: 'Bearer token', header: 'Authorization', value: `Bearer ${sandboxCredentials.verificationBearerToken}`, envVar: 'VERIFY_TOKEN' },
    baseUrlEnv: 'VERIFY_BASE_URL',
    latencyMs: 210,
    notes: [
      'Policy: both factors (dateOfBirth and postalCode) are required. Dates accept YYYY-MM-DD, MM/DD/YYYY and DD.MM.YYYY.',
      'A failed check is a business outcome: HTTP 200 with verified=false and attemptsRemaining. After 3 failures the customer is locked (HTTP 423) for 30 minutes.',
      'Tokens (vt_…) expire after 15 minutes and are bound to one customerId. The response never echoes the factors.',
      'The trainer redacts factor values from traces; the systems never return them.',
    ],
    endpoints: [
      {
        method: 'POST',
        path: '/verify',
        summary: 'Verify a customer by knowledge factors and obtain a token.',
        params: [
          { name: 'customerId', where: 'body', description: 'Customer to verify.', required: true },
          { name: 'factors.dateOfBirth', where: 'body', description: 'As stated by the caller.', required: true },
          { name: 'factors.postalCode', where: 'body', description: 'As stated by the caller.', required: true },
        ],
        sampleRequest: {
          url: `${base('verification')}/verify`,
          headers: { Authorization: `Bearer ${sandboxCredentials.verificationBearerToken}`, 'Content-Type': 'application/json' },
          body: { customerId: 'CUST-1001', factors: { dateOfBirth: '<as stated by caller>', postalCode: '<as stated by caller>' } },
        },
        sampleResponse: { status: 200, body: { verified: true, customerId: 'CUST-1001', method: 'KNOWLEDGE_FACTORS', token: 'vt_…', expiresAt: '2026-09-14T12:15:00.000Z' } },
        errors: [
          { status: 200, error: 'verified=false, reason FACTOR_MISMATCH', when: 'One or more factors did not match (attemptsRemaining decreases).' },
          { status: 423, error: 'LOCKED', when: 'Three failed attempts; lockedUntil is returned.' },
          { status: 400, error: 'VALIDATION_ERROR', when: 'Missing customerId or factors, or body not JSON.' },
          { status: 404, error: 'CUSTOMER_NOT_FOUND', when: 'Unknown customer id.' },
          { status: 401, error: 'UNAUTHORIZED', when: 'Missing or wrong bearer token.' },
        ],
      },
      {
        method: 'GET',
        path: '/status/{customerId}',
        summary: 'Inspect lock state, failed attempts and active tokens (for debugging).',
        params: [{ name: 'customerId', where: 'path', description: 'e.g. CUST-1004', required: true }],
        sampleRequest: { url: `${base('verification')}/status/CUST-1004`, headers: { Authorization: `Bearer ${sandboxCredentials.verificationBearerToken}` } },
        sampleResponse: { status: 200, body: { customerId: 'CUST-1004', locked: false, failedAttempts: 1, activeTokens: 0, policy: { requiredFactors: ['dateOfBirth', 'postalCode'], maxFailedAttempts: 3, tokenTtlMinutes: 15 } } },
        errors: [{ status: 404, error: 'CUSTOMER_NOT_FOUND', when: 'Unknown customer id.' }],
      },
      {
        method: 'POST',
        path: '/tokens/introspect',
        summary: 'Check whether a token is active and for whom.',
        params: [{ name: 'token', where: 'body', description: 'The vt_… token.', required: true }],
        sampleRequest: { url: `${base('verification')}/tokens/introspect`, headers: { Authorization: `Bearer ${sandboxCredentials.verificationBearerToken}`, 'Content-Type': 'application/json' }, body: { token: 'vt_…' } },
        sampleResponse: { status: 200, body: { active: true, customerId: 'CUST-1001', expiresAt: '2026-09-14T12:15:00.000Z' } },
        errors: [],
      },
    ],
  },
  {
    id: 'orders',
    name: 'Order Management System (OMS)',
    purpose: 'Orders and their shipment references. PROTECTED: releases data only with a valid verification token for the same customer.',
    auth: { scheme: 'API key + verification token', header: 'X-Api-Key', value: sandboxCredentials.ordersApiKey, envVar: 'OMS_API_KEY' },
    baseUrlEnv: 'ORDERS_BASE_URL',
    latencyMs: 160,
    notes: [
      'Two headers are needed: X-Api-Key (identifies the calling application) and X-Verification-Token (proves the caller was verified).',
      'A missing token → 403 VERIFICATION_REQUIRED; an unknown/expired token → 403 VERIFICATION_TOKEN_INVALID; a token for another customer → 403 VERIFICATION_TOKEN_MISMATCH.',
      'Orders are sorted newest first. A customer without orders gets 200 with an empty list.',
      'Order statuses: PROCESSING, SHIPPED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, DELAYED, CANCELLED, RETURNED. shipment is null until a label exists.',
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/orders',
        summary: 'List the orders of one customer.',
        params: [
          { name: 'customerId', where: 'query', description: 'Required.', required: true },
          { name: 'status', where: 'query', description: 'Optional status filter.' },
          { name: 'limit', where: 'query', description: 'Optional maximum number of orders.' },
          { name: 'X-Verification-Token', where: 'header', description: 'Token from POST /verify for this customer.', required: true },
        ],
        sampleRequest: { url: `${base('orders')}/orders?customerId=CUST-1001`, headers: { 'X-Api-Key': sandboxCredentials.ordersApiKey, 'X-Verification-Token': 'vt_…' } },
        sampleResponse: {
          status: 200,
          body: {
            customerId: 'CUST-1001',
            count: 1,
            orders: [
              {
                orderId: 'ORD-10021',
                customerId: 'CUST-1001',
                status: 'IN_TRANSIT',
                placedAt: '2026-09-08T16:40:00Z',
                items: [{ sku: 'SKU-STAND-01', name: 'Adjustable Laptop Stand', quantity: 1, unitPrice: 49 }],
                currency: 'USD',
                total: 49,
                shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-2201' },
                estimatedDelivery: '2026-09-16',
              },
            ],
          },
        },
        errors: [
          { status: 400, error: 'VALIDATION_ERROR', when: 'customerId missing.' },
          { status: 401, error: 'UNAUTHORIZED', when: 'Missing or wrong X-Api-Key.' },
          { status: 403, error: 'VERIFICATION_REQUIRED / VERIFICATION_TOKEN_INVALID / VERIFICATION_TOKEN_MISMATCH', when: 'Token missing, expired, or issued for another customer.' },
        ],
      },
      {
        method: 'GET',
        path: '/orders/{orderId}',
        summary: 'Read one order (token must belong to the order owner).',
        params: [
          { name: 'orderId', where: 'path', description: 'e.g. ORD-10021', required: true },
          { name: 'X-Verification-Token', where: 'header', description: 'Token for the order owner.', required: true },
        ],
        sampleRequest: { url: `${base('orders')}/orders/ORD-10021`, headers: { 'X-Api-Key': sandboxCredentials.ordersApiKey, 'X-Verification-Token': 'vt_…' } },
        sampleResponse: { status: 200, body: { orderId: 'ORD-10021', customerId: 'CUST-1001', status: 'IN_TRANSIT', placedAt: '2026-09-08T16:40:00Z', items: [{ sku: 'SKU-STAND-01', name: 'Adjustable Laptop Stand', quantity: 1, unitPrice: 49 }], currency: 'USD', total: 49, shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-2201' }, estimatedDelivery: '2026-09-16' } },
        errors: [
          { status: 404, error: 'ORDER_NOT_FOUND', when: 'Unknown order (only reported when a token was sent).' },
          { status: 403, error: 'VERIFICATION_*', when: 'Token missing, expired, or for another customer.' },
        ],
      },
    ],
  },
  {
    id: 'carrier',
    name: 'Carrier Tracking API',
    purpose: 'Shipment events and estimated delivery from the carriers. The slowest and least reliable system in the set.',
    auth: { scheme: 'API key', header: 'X-Api-Key', value: sandboxCredentials.carrierApiKey, envVar: 'CARRIER_API_KEY' },
    baseUrlEnv: 'CARRIER_BASE_URL',
    latencyMs: 420,
    notes: [
      'Shipment statuses: LABEL_CREATED, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, EXCEPTION, RETURNED. exception is null unless the shipment is held.',
      'lastEvent is a convenience copy of the newest entry in events.',
      'Scenario fault injection targets this API most often: timeouts, 503s, flaky first calls, malformed bodies.',
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/shipments/{trackingNumber}',
        summary: 'Track a shipment. Also available as /shipments?trackingNumber=…',
        params: [{ name: 'trackingNumber', where: 'path', description: 'e.g. SP-7781-2201', required: true }],
        sampleRequest: { url: `${base('carrier')}/shipments/SP-7781-2201`, headers: { 'X-Api-Key': sandboxCredentials.carrierApiKey } },
        sampleResponse: {
          status: 200,
          body: {
            trackingNumber: 'SP-7781-2201',
            carrier: 'SwiftParcel',
            status: 'IN_TRANSIT',
            estimatedDelivery: '2026-09-16',
            events: [
              { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-09-09T14:02:00Z' },
              { code: 'DP', description: 'Departed sorting facility', location: 'Phoenix, AZ', timestamp: '2026-09-10T03:15:00Z' },
              { code: 'AR', description: 'Arrived at regional hub', location: 'Tucson, AZ', timestamp: '2026-09-13T22:40:00Z' },
            ],
            exception: null,
            lastEvent: { code: 'AR', description: 'Arrived at regional hub', location: 'Tucson, AZ', timestamp: '2026-09-13T22:40:00Z' },
          },
        },
        errors: [
          { status: 404, error: 'TRACKING_NOT_FOUND', when: 'Unknown tracking number.' },
          { status: 401, error: 'UNAUTHORIZED', when: 'Missing or wrong X-Api-Key.' },
        ],
      },
    ],
  },
];

export const faultDocs: Array<{ mode: string; effect: string }> = [
  { mode: 'timeout', effect: 'Every request takes ~30 s: any sensible timeoutMs expires. Tests bounded retries and graceful degradation.' },
  { mode: 'slow', effect: 'Every request takes 2.5 s but succeeds. Tests timeout values that are too aggressive.' },
  { mode: 'unavailable', effect: 'HTTP 503 with Retry-After: 2 on every request.' },
  { mode: 'flaky', effect: 'The first request of each run fails with 503; later requests succeed. A retry policy recovers.' },
  { mode: 'malformed', effect: 'HTTP 200 with a truncated JSON body. Tests parse-error handling (MALFORMED_RESPONSE).' },
  { mode: 'rate_limit', effect: 'Only one request per run; the next ones get 429 with Retry-After: 1.' },
];
