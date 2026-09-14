/**
 * Workflow executor: runs a WorkflowConfig against a Transport while talking to
 * a Customer (scripted simulator or a human in the UI) and records a full trace.
 */
import type { VirtualRequest } from '../systems/types';
import { SYSTEM_HOSTS } from '../systems/types';
import { ExpressionError, evaluate, renderJson, renderTemplate, stringify, truthy } from './expressions';
import type { Transport } from './transport';
import type {
  AskStep,
  BranchEvaluation,
  BranchStep,
  EndOutcome,
  ErrorRoute,
  HttpStep,
  MappingResult,
  RunResult,
  SayStep,
  SetStep,
  Step,
  TraceEvent,
  TraceRequest,
  TranscriptLine,
  VerificationState,
  WorkflowConfig,
} from './types';
import { validateWorkflow } from './validate';

export interface AskQuestion {
  stepId: string;
  slot: AskStep['slot'];
  prompt: string;
  options?: Array<{ label: string; value: unknown }>;
  sensitive: boolean;
}

export interface CustomerAnswer {
  text: string;
  /** Index into options when the customer picked one; null/undefined otherwise. */
  optionIndex?: number | null;
}

/** The party the agent talks to: a scripted persona or a human typing in the UI. */
export interface Customer {
  opening(): { text: string; slots: Record<string, string> };
  answer(question: AskQuestion): Promise<CustomerAnswer>;
}

export interface RunOptions {
  transport: Transport;
  customer: Customer;
  runId?: string;
  scenarioId?: string;
  /** Values that must never appear in the trace (e.g. verification factors). */
  secretValues?: string[];
  /** Optional callback for live UI updates. */
  onEvent?: (event: TraceEvent, transcript: TranscriptLine[]) => void;
  /** Called whenever a transcript line is added (before the customer answers a question). */
  onTranscript?: (transcript: TranscriptLine[]) => void;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_STEPS = 60;
const DEFAULT_RETRY_ON: Array<number | 'timeout' | 'network' | 'malformed'> = [503, 429, 'timeout', 'network'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventInput = DistributiveOmit<TraceEvent, 'seq' | 'at'> & { at?: number };

let runCounter = 0;
export function newRunId(): string {
  runCounter += 1;
  return `run_${Date.now().toString(36)}_${runCounter}`;
}

class RunAbort extends Error {
  constructor(public readonly outcome: EndOutcome | 'error') {
    super('run aborted');
  }
}

export async function runWorkflow(config: WorkflowConfig, options: RunOptions): Promise<RunResult> {
  const runId = options.runId ?? newRunId();
  const startedAt = Date.now();
  const trace: TraceEvent[] = [];
  const transcript: TranscriptLine[] = [];
  const vars: Record<string, unknown> = structuredClone(config.variables ?? {});
  const env: Record<string, string> = { ...(config.env ?? {}) };
  const stepResults: Record<string, unknown> = {};
  const sensitiveVars = new Set<string>();
  const sensitiveValues = new Set<string>(options.secretValues ?? []);
  const verification: VerificationState = { verified: false };
  let seq = 0;
  let simulatedMs = 0;
  let stepsExecuted = 0;
  let endReason: string | undefined;
  let fatalError: RunResult['fatalError'];

  const redact = (value: unknown): unknown => redactValue(value, sensitiveValues);

  const emit = (event: EventInput) => {
    seq += 1;
    const full = { ...event, seq, at: event.at ?? Date.now() } as TraceEvent;
    trace.push(full);
    options.onEvent?.(full, transcript);
  };
  const speak = (role: TranscriptLine['role'], text: string, stepId?: string, sensitive?: boolean) => {
    transcript.push({ role, text, stepId, sensitive, at: Date.now() });
    options.onTranscript?.(transcript);
  };

  const context = (extra: Record<string, unknown> = {}) => ({ vars, env, input, steps: stepResults, ...extra });

  emit({ kind: 'run_start', workflowId: config.id, scenarioId: options.scenarioId });

  const opening = options.customer.opening();
  const input = { message: opening.text, slots: { ...opening.slots } };
  speak('customer', opening.text);

  const problems = validateWorkflow(config);
  if (problems.some((p) => p.severity === 'error')) {
    const first = problems.find((p) => p.severity === 'error')!;
    fatalError = {
      code: 'INVALID_CONFIG',
      message: first.message,
      explanation: `The workflow configuration is invalid and cannot run. Fix: ${first.message}${first.stepId ? ` (step "${first.stepId}")` : ''}.`,
      stepId: first.stepId,
    };
    emit({ kind: 'error', stepId: first.stepId ?? '', code: 'INVALID_CONFIG', message: first.message, explanation: fatalError.explanation, routedTo: null });
    emit({ kind: 'end', stepId: null, outcome: 'abandoned', reason: 'invalid configuration' });
    return finish('error');
  }

  const stepIndex = new Map<string, number>();
  config.steps.forEach((s, i) => stepIndex.set(s.id, i));
  const maxSteps = config.settings?.maxSteps ?? DEFAULT_MAX_STEPS;

  const gotoIndex = (id: string, from: Step): number => {
    const idx = stepIndex.get(id);
    if (idx === undefined) {
      throw fatal('UNKNOWN_STEP', `Step "${from.id}" routes to unknown step id "${id}".`, `Check the goto/next/otherwise targets of step "${from.id}"; available ids: ${config.steps.map((s) => s.id).join(', ')}.`, from.id);
    }
    return idx;
  };

  function fatal(code: string, message: string, explanation: string, stepId?: string): RunAbort {
    fatalError = { code, message, explanation, stepId };
    emit({ kind: 'error', stepId: stepId ?? '', code, message, explanation, routedTo: null });
    emit({ kind: 'end', stepId: null, outcome: 'abandoned', reason: `unhandled error: ${code}` });
    return new RunAbort('error');
  }

  /** Apply an error route. Returns the next step index, or throws RunAbort when the run ends. */
  async function applyRoute(step: Step, route: ErrorRoute | undefined, code: string, message: string, explanation: string, extraCtx: Record<string, unknown>): Promise<number> {
    if (!route || (!route.goto && !route.end && !route.say && !route.setVars)) {
      throw fatal(code, message, `${explanation} No onError route is configured for step "${step.id}", so the conversation aborted. Add an onError with a goto, say or end.`, step.id);
    }
    const routedTo = route.goto ?? (route.end ? `end:${route.end}` : 'next');
    emit({ kind: 'error', stepId: step.id, code, message, explanation, routedTo });
    const errCtx = context({ error: { code, message, ...extraCtx } });
    if (route.setVars) {
      const results: MappingResult[] = [];
      for (const [name, expr] of Object.entries(route.setVars)) {
        try {
          const value = await evaluate(expr, errCtx);
          vars[name] = value;
          results.push({ variable: name, expression: expr, value: redact(value) });
        } catch (err) {
          results.push({ variable: name, expression: expr, error: (err as Error).message });
        }
      }
      emit({ kind: 'set', stepId: step.id, results });
    }
    if (route.say) {
      await say(step.id, route.say, errCtx);
    }
    if (route.end) {
      endRun(step.id, route.end, `${code}: ${message}`);
      throw new RunAbort(route.end);
    }
    if (route.goto) return gotoIndex(route.goto, step);
    return stepIndex.get(step.id)! + 1;
  }

  async function say(stepId: string, template: string, ctx: unknown) {
    let text: string;
    try {
      text = (await renderTemplate(template, ctx)).text;
    } catch (err) {
      throw fatal('TEMPLATE_ERROR', (err as Error).message, `The text of step "${stepId}" could not be rendered. Check the {{ }} expressions: ${(err as ExpressionError).expression ?? ''}`, stepId);
    }
    // Guard: never speak a sensitive value back to the customer.
    let leaked = false;
    for (const v of sensitiveValues) {
      if (v && text.includes(v)) {
        leaked = true;
        text = text.split(v).join('[redacted]');
      }
    }
    if (leaked) {
      emit({
        kind: 'error',
        stepId,
        code: 'SENSITIVE_DISCLOSURE',
        message: 'A sensitive value (verification factor) was about to be spoken to the customer and was redacted.',
        explanation: 'Verification factors and other sensitive inputs must never be echoed back. Do not reference sensitive variables in say/ask templates.',
        routedTo: null,
      });
    }
    speak('agent', text, stepId);
    emit({ kind: 'say', stepId, text });
  }

  function endRun(stepId: string | null, o: EndOutcome, reason?: string) {
    endReason = reason;
    emit({ kind: 'end', stepId, outcome: o, reason });
  }

  function finish(finalOutcome: EndOutcome | 'error'): RunResult {
    const systemLog = options.transport.systemLog?.(runId) ?? [];
    return {
      runId,
      workflowId: config.id,
      scenarioId: options.scenarioId,
      outcome: finalOutcome,
      endReason,
      trace,
      transcript: transcript.map((line) => (line.sensitive ? line : { ...line, text: stringify(redact(line.text)) })),
      variables: redact(vars) as Record<string, unknown>,
      sensitiveVariables: Array.from(sensitiveVars),
      verification: { verified: verification.verified, customerId: verification.customerId, at: verification.at, stepId: verification.stepId },
      systemLog,
      startedAt,
      finishedAt: Date.now(),
      simulatedMs,
      stepsExecuted,
      fatalError,
    };
  }

  // ---------------------------------------------------------------------------
  // Step handlers
  // ---------------------------------------------------------------------------

  async function runHttp(step: HttpStep): Promise<number> {
    const ctx = context();
    let url: string;
    const headers: Record<string, string> = {};
    let body: unknown;
    try {
      url = (await renderTemplate(step.request.url, ctx)).text.trim();
      const params: string[] = [];
      for (const [k, v] of Object.entries(step.request.query ?? {})) {
        const rendered = (await renderTemplate(v, ctx)).text;
        if (rendered !== '') params.push(`${encodeURIComponent(k)}=${encodeURIComponent(rendered)}`);
      }
      if (params.length) url += (url.includes('?') ? '&' : '?') + params.join('&');
      for (const [k, v] of Object.entries(step.request.headers ?? {})) {
        const rendered = (await renderTemplate(v, ctx)).text;
        if (rendered !== '') headers[k] = rendered;
      }
      body = step.request.body === undefined ? undefined : await renderJson(step.request.body, ctx);
    } catch (err) {
      const e = err as ExpressionError;
      return applyRoute(step, step.onError, 'REQUEST_BUILD_ERROR', e.message, `The request for step "${step.id}" could not be built because a template expression failed${e.expression ? ` (${e.expression})` : ''}.`, {});
    }
    const request: VirtualRequest = { method: step.request.method, url, headers, body };
    const timeoutMs = step.request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retry = step.retry ?? { maxAttempts: 1, backoffMs: 0 };
    const maxAttempts = Math.max(1, retry.maxAttempts || 1);
    const retryOn = retry.retryOn ?? DEFAULT_RETRY_ON;
    const expected = step.expectStatus && step.expectStatus.length ? step.expectStatus : null;
    const isExpected = (status: number) => (expected ? expected.includes(status) : status >= 200 && status < 300);
    const system = systemOf(url);

    let attempt = 0;
    let attempts = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      attempts = attempt;
      const traceReq: TraceRequest = { method: request.method, url: stringify(redact(request.url)), headers: redact({ ...headers }) as Record<string, string>, body: redact(body) };
      emit({ kind: 'http_request', stepId: step.id, attempt, request: traceReq });
      const result = await options.transport.send(request, { timeoutMs, runId });
      const computeWait = (retryAfterHeader?: string) => {
        const base = retry.backoff === 'exponential' ? retry.backoffMs * 2 ** (attempt - 1) : retry.backoffMs;
        const ra = retryAfterHeader && retry.respectRetryAfter !== false ? Number(retryAfterHeader) * 1000 : 0;
        return Math.max(base, Number.isFinite(ra) ? ra : 0);
      };

      if (!result.ok) {
        simulatedMs += result.error.elapsedMs;
        emit({ kind: 'http_error', stepId: step.id, attempt, error: result.error });
        stepResults[step.id] = { error: result.error, attempts };
        const canRetry = attempt < maxAttempts && retryOn.includes(result.error.kind);
        if (canRetry) {
          const waitMs = computeWait();
          simulatedMs += waitMs;
          emit({ kind: 'retry', stepId: step.id, attempt: attempt + 1, reason: result.error.kind, waitMs });
          await options.transport.wait(waitMs);
          continue;
        }
        const code = result.error.kind === 'timeout' ? 'TIMEOUT' : 'NETWORK_ERROR';
        return applyRoute(step, step.onError, code, result.error.message, explainTransportFailure(result.error.kind, attempts, maxAttempts, timeoutMs, system), { attempts });
      }

      const response = result.response;
      simulatedMs += response.elapsedMs;
      const ok = isExpected(response.status) && !response.parseError;
      // Observe first so that a freshly issued verification token is redacted in the trace below.
      const securityEvents = observeSecurity(step.id, system, url, request, response.status, response.body);
      emit({ kind: 'http_response', stepId: step.id, attempt, response: { ...response, body: redact(response.body) }, ok });
      for (const ev of securityEvents) emit(ev);
      stepResults[step.id] = { status: response.status, headers: response.headers, body: response.body, attempts, elapsedMs: response.elapsedMs };

      if (response.parseError) {
        const canRetry = attempt < maxAttempts && retryOn.includes('malformed');
        if (canRetry) {
          const waitMs = computeWait();
          simulatedMs += waitMs;
          emit({ kind: 'retry', stepId: step.id, attempt: attempt + 1, reason: 'malformed', waitMs });
          await options.transport.wait(waitMs);
          continue;
        }
        return applyRoute(step, step.onError, 'MALFORMED_RESPONSE', response.parseError, `Step "${step.id}" received HTTP ${response.status} but the body could not be parsed as JSON. Treat this like an outage: route to a fallback rather than mapping fields from a broken payload.`, { status: response.status, attempts });
      }
      if (!isExpected(response.status)) {
        const canRetry = attempt < maxAttempts && retryOn.includes(response.status);
        if (canRetry) {
          const waitMs = computeWait(response.headers['retry-after']);
          simulatedMs += waitMs;
          emit({ kind: 'retry', stepId: step.id, attempt: attempt + 1, reason: `HTTP ${response.status}`, waitMs });
          await options.transport.wait(waitMs);
          continue;
        }
        const bodyObj = (response.body ?? {}) as { error?: string; message?: string };
        const code = `HTTP_${response.status}`;
        const message = bodyObj.error ? `${bodyObj.error}${bodyObj.message ? `: ${bodyObj.message}` : ''}` : `Unexpected HTTP status ${response.status}`;
        return applyRoute(step, step.onError, code, message, explainHttpFailure(response.status, bodyObj, system, step), { status: response.status, body: response.body, attempts });
      }

      // Success: mapping
      const results: MappingResult[] = [];
      let failed = false;
      if (step.mapping) {
        const mapCtx = context({ response: { status: response.status, headers: response.headers, body: response.body, ok: true } });
        for (const [name, expr] of Object.entries(step.mapping)) {
          try {
            const value = await evaluate(expr, mapCtx);
            vars[name] = value;
            results.push({ variable: name, expression: expr, value: redact(value) });
          } catch (err) {
            failed = true;
            results.push({ variable: name, expression: expr, error: (err as Error).message });
          }
        }
        emit({ kind: 'mapping', stepId: step.id, results });
      }
      if (failed) {
        const first = results.find((r) => r.error)!;
        return applyRoute(step, step.onError, 'MAPPING_ERROR', `${first.variable}: ${first.error}`, `A response mapping expression in step "${step.id}" failed. Expression: ${first.expression}`, { status: response.status, body: response.body });
      }
      return step.next ? gotoIndex(step.next, step) : stepIndex.get(step.id)! + 1;
    }
    throw fatal('RETRY_LOOP', 'Retry loop ended unexpectedly.', 'Internal error.', step.id);
  }

  type SecurityEvent = DistributiveOmit<Extract<TraceEvent, { kind: 'verification' } | { kind: 'protected_data' }>, 'seq' | 'at'>;

  /** Derive verification / protected-data events from a response. Returns events for the caller to emit. */
  function observeSecurity(stepId: string, system: string | null, url: string, request: VirtualRequest, status: number, body: unknown): SecurityEvent[] {
    const events: SecurityEvent[] = [];
    if (system === 'verification' && /\/verify(\?|$)/.test(url) && request.method === 'POST') {
      const b = (body ?? {}) as { verified?: boolean; customerId?: string; token?: string; reason?: string };
      if (status === 200 && b.verified === true) {
        verification.verified = true;
        verification.customerId = b.customerId;
        verification.token = b.token;
        verification.at = Date.now();
        verification.stepId = stepId;
        if (b.token) sensitiveValues.add(b.token);
        events.push({ kind: 'verification', stepId, verified: true, customerId: b.customerId, detail: `Verification service confirmed identity for ${b.customerId} and issued a token.` });
      } else {
        const reqBody = (request.body ?? {}) as { customerId?: string };
        events.push({ kind: 'verification', stepId, verified: false, customerId: reqBody.customerId, detail: `Verification did not succeed (HTTP ${status}${b.reason ? `, reason ${b.reason}` : ''}). No token issued.` });
      }
    }
    if (system === 'orders') {
      const b = (body ?? {}) as { customerId?: string; count?: number; orderId?: string; error?: string };
      if (status === 200) {
        events.push({ kind: 'protected_data', stepId, customerId: b.customerId, released: true, detail: `OMS released protected order data${b.customerId ? ` for ${b.customerId}` : ''} (verification token accepted).` });
      } else if (status === 403) {
        events.push({ kind: 'protected_data', stepId, released: false, detail: `OMS refused to release order data: ${b.error ?? `HTTP ${status}`}.` });
      }
    }
    return events;
  }

  async function runSet(step: SetStep): Promise<number> {
    const results: MappingResult[] = [];
    for (const [name, expr] of Object.entries(step.assign)) {
      try {
        const value = await evaluate(expr, context());
        vars[name] = value;
        results.push({ variable: name, expression: expr, value: redact(value) });
      } catch (err) {
        results.push({ variable: name, expression: expr, error: (err as Error).message });
        emit({ kind: 'set', stepId: step.id, results });
        throw fatal('EXPRESSION_ERROR', `${name}: ${(err as Error).message}`, `An assignment in step "${step.id}" failed. Expression: ${expr}`, step.id);
      }
    }
    emit({ kind: 'set', stepId: step.id, results });
    return step.next ? gotoIndex(step.next, step) : stepIndex.get(step.id)! + 1;
  }

  async function runBranch(step: BranchStep): Promise<number> {
    const evaluated: BranchEvaluation[] = [];
    let chosen: string | null = null;
    for (const c of step.cases) {
      try {
        const result = await evaluate(c.when, context());
        const matched = truthy(result);
        evaluated.push({ label: c.label, when: c.when, result: redact(result), matched, goto: c.goto });
        if (matched) {
          chosen = c.goto;
          break;
        }
      } catch (err) {
        evaluated.push({ label: c.label, when: c.when, result: undefined, matched: false, goto: c.goto, error: (err as Error).message });
        emit({ kind: 'branch', stepId: step.id, evaluated, chosen: null });
        throw fatal('EXPRESSION_ERROR', (err as Error).message, `A condition in branch "${step.id}" failed to evaluate: ${c.when}`, step.id);
      }
    }
    if (!chosen && step.otherwise) chosen = step.otherwise;
    emit({ kind: 'branch', stepId: step.id, evaluated, chosen });
    return chosen ? gotoIndex(chosen, step) : stepIndex.get(step.id)! + 1;
  }

  async function runAsk(step: AskStep): Promise<number> {
    const ctx = context();
    let prompt: string;
    let optionList: Array<{ label: string; value: unknown }> | undefined;
    try {
      prompt = (await renderTemplate(step.prompt, ctx)).text;
      if (step.options) {
        const raw = await evaluate(step.options.items, ctx);
        const items = raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw];
        optionList = [];
        for (const item of items) {
          const label = (await renderTemplate(step.options.label, context({ item }))).text;
          const value = step.options.value ? await evaluate(step.options.value, context({ item })) : item;
          optionList.push({ label, value });
        }
      }
    } catch (err) {
      throw fatal('TEMPLATE_ERROR', (err as Error).message, `The question in step "${step.id}" could not be rendered. Check its prompt/options expressions.`, step.id);
    }
    for (const v of sensitiveValues) {
      if (v && prompt.includes(v)) prompt = prompt.split(v).join('[redacted]');
    }
    const spoken = optionList && optionList.length ? `${prompt} ${optionList.map((o, i) => `(${i + 1}) ${o.label}`).join(' ')}` : prompt;
    speak('agent', spoken, step.id);
    const answer = await options.customer.answer({ stepId: step.id, slot: step.slot, prompt, options: optionList, sensitive: Boolean(step.sensitive) });
    let saved: unknown = answer.text;
    let matched = true;
    if (optionList) {
      let idx = answer.optionIndex ?? null;
      if (idx === null || idx === undefined || idx < 0 || idx >= optionList.length) {
        const lower = answer.text.toLowerCase();
        const found = optionList.findIndex((o) => o.label.toLowerCase() === lower || (lower.length > 2 && o.label.toLowerCase().includes(lower)));
        idx = found >= 0 ? found : null;
      }
      if (idx === null) {
        matched = false;
        saved = null;
      } else {
        saved = optionList[idx].value;
      }
    }
    if (step.sensitive) {
      sensitiveVars.add(step.saveAs);
      if (typeof saved === 'string' && saved) sensitiveValues.add(saved);
    }
    vars[step.saveAs] = saved;
    speak('customer', step.sensitive ? `•••• (${describeSlot(step.slot)} provided)` : answer.text, step.id, Boolean(step.sensitive));
    emit({
      kind: 'ask',
      stepId: step.id,
      slot: step.slot,
      prompt,
      options: optionList?.map((o) => ({ label: o.label, value: redact(o.value) })),
      answer: step.sensitive ? '[redacted]' : answer.text,
      saved: { variable: step.saveAs, value: step.sensitive ? '[redacted]' : redact(saved) },
      matched,
      sensitive: Boolean(step.sensitive),
    });
    if (!matched) {
      return applyRoute(step, step.onNoMatch, 'ASK_NO_MATCH', `The customer's answer "${answer.text}" did not match any offered option.`, `Step "${step.id}" offered ${optionList?.length ?? 0} option(s) but the answer matched none. Handle this with onNoMatch (re-ask, offer help, or hand over).`, {});
    }
    return step.next ? gotoIndex(step.next, step) : stepIndex.get(step.id)! + 1;
  }

  async function runSay(step: SayStep): Promise<number> {
    await say(step.id, step.text, context());
    return step.next ? gotoIndex(step.next, step) : stepIndex.get(step.id)! + 1;
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  try {
    let idx = 0;
    while (idx < config.steps.length) {
      if (stepsExecuted >= maxSteps) {
        throw fatal('STEP_LIMIT', `More than ${maxSteps} steps were executed.`, 'The workflow is probably looping. Check branch/goto targets.', config.steps[idx].id);
      }
      const step = config.steps[idx];
      stepsExecuted += 1;
      emit({ kind: 'step_start', stepId: step.id, stepType: step.type, name: step.name });
      switch (step.type) {
        case 'http':
          idx = await runHttp(step);
          break;
        case 'set':
          idx = await runSet(step);
          break;
        case 'branch':
          idx = await runBranch(step);
          break;
        case 'ask':
          idx = await runAsk(step);
          break;
        case 'say':
          idx = await runSay(step);
          break;
        case 'end':
          endRun(step.id, step.outcome, step.reason);
          return finish(step.outcome);
      }
    }
    speak('system', 'The workflow reached the end of its step list without an explicit end step.');
    endRun(null, 'resolved', 'implicit end');
    return finish('resolved');
  } catch (err) {
    if (err instanceof RunAbort) return finish(err.outcome);
    const e = err as Error;
    fatalError = { code: 'INTERNAL_ERROR', message: e.message, explanation: 'Unexpected engine error. This is a bug in the trainer, not in your workflow.' };
    emit({ kind: 'error', stepId: '', code: 'INTERNAL_ERROR', message: e.message, explanation: fatalError.explanation, routedTo: null });
    emit({ kind: 'end', stepId: null, outcome: 'abandoned', reason: 'internal error' });
    return finish('error');
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function systemOf(url: string): string | null {
  try {
    const u = new URL(url);
    for (const [id, host] of Object.entries(SYSTEM_HOSTS)) if (u.hostname === host) return id;
    const m = u.pathname.match(/^\/(crm|verification|orders|carrier)\//);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function describeSlot(slot: AskStep['slot']): string {
  switch (slot) {
    case 'dateOfBirth':
      return 'date of birth';
    case 'postalCode':
      return 'postal code';
    case 'phone':
      return 'phone number';
    case 'email':
      return 'email address';
    case 'lastName':
      return 'last name';
    case 'customerId':
      return 'customer number';
    case 'orderId':
      return 'order number';
    case 'accountType':
      return 'account type';
    case 'orderChoice':
      return 'order choice';
    case 'customerChoice':
      return 'account choice';
    case 'confirmation':
      return 'confirmation';
    default:
      return 'answer';
  }
}

export function redactValue(value: unknown, secrets: Set<string>): unknown {
  if (secrets.size === 0) return value;
  if (typeof value === 'string') {
    let out = value;
    for (const s of secrets) {
      if (s && out.includes(s)) out = out.split(s).join(s.startsWith('vt_') ? 'vt_[redacted]' : '[redacted]');
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(v, secrets));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactValue(v, secrets);
    return out;
  }
  return value;
}

function explainTransportFailure(kind: 'timeout' | 'network', attempts: number, maxAttempts: number, timeoutMs: number, system: string | null): string {
  const sys = system ? `the ${system} system` : 'the target host';
  if (kind === 'timeout') {
    return `${sys} did not answer within ${timeoutMs} ms on ${attempts} attempt(s) (retry policy allows ${maxAttempts}). A timed-out call must not be treated as "no data": decide whether to retry with backoff, degrade gracefully (tell the customer what you do know), or hand over.`;
  }
  return `The request could not reach ${sys}. Check the URL (env base URL) and that the host is one of the practice systems.`;
}

function explainHttpFailure(status: number, body: { error?: string; message?: string }, system: string | null, step: HttpStep): string {
  const sys = system ?? 'the system';
  switch (status) {
    case 400:
      return `${sys} rejected the request as invalid (${body.error ?? 'VALIDATION_ERROR'}): ${body.message ?? ''} Compare the request in the trace against the API documentation.`;
    case 401:
      return `${sys} rejected the credentials. Check the ${system === 'orders' || system === 'carrier' ? 'X-Api-Key header' : 'Authorization: Bearer header'} on step "${step.id}" and the env variable it references.`;
    case 403:
      if (body.error === 'VERIFICATION_REQUIRED') {
        return 'The OMS refuses to release order data without a verification token. Call the verification service first, map the returned token into a variable, and send it in the X-Verification-Token header. Finding a customer record is not the same as verifying the caller.';
      }
      if (body.error === 'VERIFICATION_TOKEN_MISMATCH') {
        return 'The token was issued for a different customer than the customerId in this request. After a duplicate-record clarification, make sure you verify and query the SAME customer id.';
      }
      if (body.error === 'VERIFICATION_TOKEN_INVALID') {
        return 'The verification token is unknown or expired. Tokens are short-lived; verify again if the conversation has run long.';
      }
      return `${sys} refused access (${body.error ?? 'FORBIDDEN'}): ${body.message ?? ''}`;
    case 404:
      return `${sys} has no such resource (${body.error ?? 'NOT_FOUND'}): ${body.message ?? ''} Check the path and the identifier you interpolated.`;
    case 423:
      return 'Verification is locked for this customer after too many failed attempts. The agent should stop retrying, explain the lock and offer a handover.';
    case 429:
      return 'The system rate-limited the call. Honour the Retry-After header, cap retries, and avoid tight retry loops.';
    case 503:
      return `${sys} is temporarily unavailable. Retry with backoff a limited number of times; if it stays down, degrade gracefully instead of failing the whole conversation.`;
    default:
      return `${sys} answered HTTP ${status}${body.error ? ` (${body.error})` : ''}. ${body.message ?? ''}`;
  }
}
