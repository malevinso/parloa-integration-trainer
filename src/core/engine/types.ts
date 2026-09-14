/**
 * Workflow configuration model.
 *
 * A workflow is an ordered list of steps — deliberately close to a MuleSoft
 * flow: an HTTP requester, a set-variable transformer, a choice router, and
 * conversational steps (ask / say / end) that a Mule flow does not have.
 *
 * Expressions use JSONata (https://jsonata.org), the closest widely used
 * open standard to DataWeave. Text fields support {{ expression }} templates.
 *
 * This model is THIS TRAINER'S simulation format. It is not Parloa's
 * configuration format — see the "Parloa concepts" lesson for how these ideas
 * map to documented Parloa features.
 */

import type { HttpMethod } from '../systems/types';

export type StepType = 'http' | 'set' | 'branch' | 'ask' | 'say' | 'end';

export interface ErrorRoute {
  /** Continue at this step id. */
  goto?: string;
  /** Say this (templated) text to the customer before routing. */
  say?: string;
  /** End the conversation with this outcome. */
  end?: EndOutcome;
  /** JSONata assignments applied before routing (e.g. record the failure). */
  setVars?: Record<string, string>;
}

export interface RetryPolicy {
  /** Total attempts including the first one (1 = no retry). */
  maxAttempts: number;
  /** Delay before the second attempt; doubled for each further attempt when backoff is exponential. */
  backoffMs: number;
  backoff?: 'fixed' | 'exponential';
  /** HTTP statuses and error kinds that trigger a retry. Default: [503, 429, 'timeout', 'network']. */
  retryOn?: Array<number | 'timeout' | 'network' | 'malformed'>;
  /** Honour the Retry-After response header when present (default true). */
  respectRetryAfter?: boolean;
}

export interface HttpRequestConfig {
  method: HttpMethod;
  /** Templated absolute URL, e.g. {{env.CRM_BASE_URL}}/customers */
  url: string;
  /** Templated header values. */
  headers?: Record<string, string>;
  /** Templated query parameters (appended to the URL). Empty values are omitted. */
  query?: Record<string, string>;
  /** JSON body; every string leaf is templated. A whole-body expression can be given as a string starting with "=". */
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpStep {
  id: string;
  type: 'http';
  name?: string;
  description?: string;
  request: HttpRequestConfig;
  retry?: RetryPolicy;
  /** Statuses treated as success. Default: 200–299. */
  expectStatus?: number[];
  /** Variable name → JSONata expression evaluated with `response` in scope. */
  mapping?: Record<string, string>;
  /** Route taken when the status is unexpected, the body is malformed, a timeout/network error remains after retries, or mapping fails. */
  onError?: ErrorRoute;
  next?: string;
}

export interface SetStep {
  id: string;
  type: 'set';
  name?: string;
  description?: string;
  /** Variable name → JSONata expression. */
  assign: Record<string, string>;
  next?: string;
}

export interface BranchCase {
  label?: string;
  /** JSONata condition. */
  when: string;
  goto: string;
}

export interface BranchStep {
  id: string;
  type: 'branch';
  name?: string;
  description?: string;
  cases: BranchCase[];
  /** Step id when no case matches; defaults to the next step in order. */
  otherwise?: string;
}

export type SlotName =
  | 'phone'
  | 'email'
  | 'lastName'
  | 'customerId'
  | 'orderId'
  | 'dateOfBirth'
  | 'postalCode'
  | 'accountType'
  | 'orderChoice'
  | 'customerChoice'
  | 'confirmation'
  | 'freeText';

export interface AskOptions {
  /** JSONata expression returning the array of candidate items. */
  items: string;
  /** Template rendered per item (item is bound as `item`). */
  label: string;
  /** JSONata expression per item giving the value stored when chosen (defaults to the item). */
  value?: string;
}

export interface AskStep {
  id: string;
  type: 'ask';
  name?: string;
  description?: string;
  /** Templated question. */
  prompt: string;
  /** What the question is about; the simulated customer answers based on this. */
  slot: SlotName;
  /** Variable that receives the answer (or the chosen option value). */
  saveAs: string;
  /** Sensitive answers are redacted in traces and cannot be spoken back. */
  sensitive?: boolean;
  options?: AskOptions;
  /** Route when the customer's answer does not match any option or they cannot answer. */
  onNoMatch?: ErrorRoute;
  next?: string;
}

export interface SayStep {
  id: string;
  type: 'say';
  name?: string;
  description?: string;
  text: string;
  next?: string;
}

export type EndOutcome = 'resolved' | 'handover' | 'blocked' | 'abandoned';

export interface EndStep {
  id: string;
  type: 'end';
  name?: string;
  description?: string;
  outcome: EndOutcome;
  reason?: string;
}

export type Step = HttpStep | SetStep | BranchStep | AskStep | SayStep | EndStep;

export interface WorkflowConfig {
  id: string;
  name: string;
  description?: string;
  /** Environment variables (base URLs, sandbox credentials). Referenced as env.NAME. */
  env: Record<string, string>;
  /** Initial workflow variables. Referenced as vars.NAME. */
  variables: Record<string, unknown>;
  steps: Step[];
  settings?: {
    /** Safety limit for the number of executed steps (loops). Default 60. */
    maxSteps?: number;
  };
}

// -----------------------------------------------------------------------------
// Execution trace
// -----------------------------------------------------------------------------

export interface TraceRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface TraceResponse {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
  rawBody?: string;
  parseError?: string;
  elapsedMs: number;
  simulatedLatencyMs?: number;
}

export interface TransportError {
  kind: 'timeout' | 'network';
  message: string;
  elapsedMs: number;
}

export type TraceEvent =
  | { seq: number; kind: 'run_start'; workflowId: string; scenarioId?: string; at: number }
  | { seq: number; kind: 'step_start'; stepId: string; stepType: StepType; name?: string; at: number }
  | { seq: number; kind: 'http_request'; stepId: string; attempt: number; request: TraceRequest; at: number }
  | { seq: number; kind: 'http_response'; stepId: string; attempt: number; response: TraceResponse; ok: boolean; at: number }
  | { seq: number; kind: 'http_error'; stepId: string; attempt: number; error: TransportError; at: number }
  | { seq: number; kind: 'retry'; stepId: string; attempt: number; reason: string; waitMs: number; at: number }
  | { seq: number; kind: 'mapping'; stepId: string; results: MappingResult[]; at: number }
  | { seq: number; kind: 'set'; stepId: string; results: MappingResult[]; at: number }
  | { seq: number; kind: 'branch'; stepId: string; evaluated: BranchEvaluation[]; chosen: string | null; at: number }
  | {
      seq: number;
      kind: 'ask';
      stepId: string;
      slot: SlotName;
      prompt: string;
      options?: Array<{ label: string; value: unknown }>;
      answer: string;
      saved: { variable: string; value: unknown };
      matched: boolean;
      sensitive: boolean;
      at: number;
    }
  | { seq: number; kind: 'say'; stepId: string; text: string; at: number }
  | { seq: number; kind: 'verification'; stepId: string; verified: boolean; customerId?: string; detail: string; at: number }
  | { seq: number; kind: 'protected_data'; stepId: string; customerId?: string; released: boolean; detail: string; at: number }
  | { seq: number; kind: 'error'; stepId: string; code: string; message: string; explanation: string; routedTo: string | null; at: number }
  | { seq: number; kind: 'end'; stepId: string | null; outcome: EndOutcome; reason?: string; at: number };

export interface MappingResult {
  variable: string;
  expression: string;
  value?: unknown;
  error?: string;
  sensitive?: boolean;
}

export interface BranchEvaluation {
  label?: string;
  when: string;
  result: unknown;
  matched: boolean;
  goto: string;
  error?: string;
}

export interface TranscriptLine {
  role: 'customer' | 'agent' | 'system';
  text: string;
  stepId?: string;
  /** True when the customer's line contained a sensitive value (rendered masked). */
  sensitive?: boolean;
  at: number;
}

export interface VerificationState {
  verified: boolean;
  customerId?: string;
  /** Present only in memory; redacted in the debug view. */
  token?: string;
  at?: number;
  stepId?: string;
}

export interface RunResult {
  runId: string;
  workflowId: string;
  scenarioId?: string;
  outcome: EndOutcome | 'error';
  endReason?: string;
  trace: TraceEvent[];
  transcript: TranscriptLine[];
  variables: Record<string, unknown>;
  sensitiveVariables: string[];
  verification: VerificationState;
  /** Requests as seen by the practice systems, in order. */
  systemLog: import('../systems/types').RequestLogEntry[];
  startedAt: number;
  finishedAt: number;
  /** Wall-clock milliseconds of simulated time consumed (latency + backoff). */
  simulatedMs: number;
  stepsExecuted: number;
  fatalError?: { code: string; message: string; explanation: string; stepId?: string };
}
