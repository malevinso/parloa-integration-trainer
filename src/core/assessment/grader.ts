/**
 * Grader: runs a workflow against a scenario and evaluates its checks.
 * Feedback is written for a developer: what was expected, what was observed,
 * and a hint on where to look.
 */
import { evaluate, truthy } from '../engine/expressions';
import { runWorkflow } from '../engine/executor';
import { VirtualTransport } from '../engine/transport';
import type { RunResult, TraceEvent, TranscriptLine, WorkflowConfig } from '../engine/types';
import { PracticeSystems } from '../systems/practiceSystems';
import { SYSTEM_LABELS, type RequestLogEntry } from '../systems/types';
import { ScriptedCustomer } from '../simulator/customer';
import type { Check, CheckResult, Scenario, ScenarioResult } from './types';

export interface RunScenarioOptions {
  systems?: PracticeSystems;
  speed?: 'instant' | 'realistic';
  onEvent?: (event: TraceEvent, transcript: TranscriptLine[]) => void;
  onTranscript?: (transcript: TranscriptLine[]) => void;
}

/** Execute one scenario. Each scenario gets a fresh copy of the practice systems unless one is supplied. */
export async function runScenario(config: WorkflowConfig, scenario: Scenario, options: RunScenarioOptions = {}): Promise<ScenarioResult> {
  const systems = options.systems ?? new PracticeSystems();
  const transport = new VirtualTransport(systems, { faults: scenario.faults ?? {}, speed: options.speed ?? 'instant' });
  const customer = new ScriptedCustomer(scenario.persona);
  const run = await runWorkflow(config, {
    transport,
    customer,
    scenarioId: scenario.id,
    secretValues: systems.secretValues(),
    onEvent: options.onEvent,
    onTranscript: options.onTranscript,
  });
  const checks = await gradeRun(run, scenario);
  return { scenarioId: scenario.id, passed: checks.every((c) => c.passed), checks, run };
}

export async function runScenarios(config: WorkflowConfig, scenarios: Scenario[], options: RunScenarioOptions = {}): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const s of scenarios) results.push(await runScenario(config, s, { ...options, systems: undefined }));
  return results;
}

export async function gradeRun(run: RunResult, scenario: Scenario): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of scenario.checks) results.push(await evaluateCheck(check, run));
  return results;
}

function describeCalls(log: RequestLogEntry[]): string {
  if (!log.length) return 'no requests were made';
  return log.map((e) => `${e.method} ${e.system}:${e.path} → ${e.status}${e.note ? ` (${e.note})` : ''}`).join('; ');
}

function agentLines(run: RunResult): string[] {
  return run.transcript.filter((l) => l.role === 'agent').map((l) => l.text);
}

function containsAny(haystack: string, needles: string[]): string | null {
  const lower = haystack.toLowerCase();
  for (const n of needles) if (n && lower.includes(n.toLowerCase())) return n;
  return null;
}

export async function evaluateCheck(check: Check, run: RunResult): Promise<CheckResult> {
  const base = { check, title: check.title, hint: check.hint };
  switch (check.type) {
    case 'api_called': {
      const re = check.pathPattern ? new RegExp(check.pathPattern) : null;
      const calls = run.systemLog.filter((e) => e.system === check.system && (!check.method || e.method === check.method) && (!re || re.test(e.path)));
      const n = calls.length;
      const min = check.min ?? 1;
      const max = check.max ?? Number.POSITIVE_INFINITY;
      const passed = n >= min && n <= max;
      const range = check.max !== undefined ? `between ${min} and ${check.max}` : `at least ${min}`;
      return {
        ...base,
        passed,
        detail: passed
          ? `${SYSTEM_LABELS[check.system]} was called ${n} time(s)${check.pathPattern ? ` matching ${check.pathPattern}` : ''}.`
          : `Expected ${SYSTEM_LABELS[check.system]}${check.pathPattern ? ` (${check.pathPattern})` : ''} to be called ${range} time(s); observed ${n}. Requests made: ${describeCalls(run.systemLog)}.`,
      };
    }
    case 'api_not_called': {
      const re = check.pathPattern ? new RegExp(check.pathPattern) : null;
      const calls = run.systemLog.filter((e) => e.system === check.system && (!re || re.test(e.path)));
      const passed = calls.length === 0;
      return {
        ...base,
        passed,
        detail: passed ? `${SYSTEM_LABELS[check.system]} was not called.` : `${SYSTEM_LABELS[check.system]} was called ${calls.length} time(s): ${describeCalls(calls)}.`,
      };
    }
    case 'no_status': {
      const hits = run.systemLog.filter((e) => e.status === check.status && (!check.system || e.system === check.system));
      const passed = hits.length === 0;
      return {
        ...base,
        passed,
        detail: passed ? `No response with HTTP ${check.status} was observed.` : `HTTP ${check.status} was returned ${hits.length} time(s): ${describeCalls(hits)}.`,
      };
    }
    case 'verification': {
      const verified = run.systemLog.filter((e) => e.system === 'verification' && e.note === 'VERIFIED' && (!check.customerId || e.customerId === check.customerId));
      const attempts = run.systemLog.filter((e) => e.system === 'verification' && /\/verify/.test(e.path));
      const passed = check.expected ? verified.length > 0 : verified.length === 0;
      let detail: string;
      if (check.expected) {
        detail = passed
          ? `The verification service issued a token for ${verified[0].customerId}.`
          : attempts.length === 0
            ? 'The verification service was never called (POST /verify).'
            : `POST /verify was called ${attempts.length} time(s) but never returned verified = true${check.customerId ? ` for ${check.customerId}` : ''}: ${describeCalls(attempts)}.`;
      } else {
        detail = passed ? 'No verification token was issued, as expected for this scenario.' : `Unexpectedly, verification succeeded for ${verified[0].customerId}.`;
      }
      return { ...base, passed, detail };
    }
    case 'protected_data_released': {
      const released = run.systemLog.filter((e) => e.system === 'orders' && e.protectedDataReleased && (!check.customerId || e.customerId === check.customerId));
      const denied = run.systemLog.filter((e) => e.system === 'orders' && e.status === 403);
      const passed = check.expected ? released.length > 0 : released.length === 0;
      let detail: string;
      if (check.expected) {
        detail = passed
          ? `The OMS released order data${check.customerId ? ` for ${check.customerId}` : ''} (${released.length} response(s)).`
          : denied.length
            ? `The OMS refused every orders request: ${describeCalls(denied)}.`
            : `No OMS response released order data${check.customerId ? ` for ${check.customerId}` : ''}. Requests made: ${describeCalls(run.systemLog)}.`;
      } else {
        detail = passed
          ? `No protected order data was released${check.customerId ? ` for ${check.customerId}` : ''}${denied.length ? ` (the OMS answered 403 ${denied.length} time(s))` : ''}.`
          : `The OMS released order data${check.customerId ? ` for ${check.customerId}` : ''}: ${describeCalls(released)}.`;
      }
      return { ...base, passed, detail };
    }
    case 'no_disclosure_before_verification': {
      let verified = false;
      for (const ev of run.trace) {
        if (ev.kind === 'verification' && ev.verified) verified = true;
        if (!verified && (ev.kind === 'say' || ev.kind === 'ask')) {
          const text = ev.kind === 'say' ? ev.text : `${ev.prompt} ${(ev.options ?? []).map((o) => o.label).join(' ')}`;
          const hit = containsAny(text, check.protectedTerms);
          if (hit) {
            return { ...base, passed: false, detail: `Step "${ev.stepId}" spoke "${hit}" before the verification service confirmed the caller: "${text}".` };
          }
        }
      }
      return { ...base, passed: true, detail: verified ? 'Order details were only spoken after verification succeeded.' : 'No protected term was spoken (verification never succeeded in this run).' };
    }
    case 'agent_said': {
      let lines = agentLines(run);
      if (check.afterVerification) {
        const idx = run.trace.findIndex((e) => e.kind === 'verification' && e.verified);
        const after = new Set(run.trace.slice(idx + 1).flatMap((e) => (e.kind === 'say' ? [e.text] : [])));
        lines = lines.filter((l) => after.has(l));
      }
      const hitLine = lines.find((l) => containsAny(l, check.anyOf));
      const passed = Boolean(hitLine);
      return {
        ...base,
        passed,
        detail: passed
          ? `Found "${containsAny(hitLine!, check.anyOf)}" in: "${hitLine}".`
          : `None of the agent's lines contained any of: ${check.anyOf.map((s) => `"${s}"`).join(', ')}. Agent said: ${lines.length ? lines.map((l) => `"${l}"`).join(' | ') : '(nothing)'}.`,
      };
    }
    case 'agent_not_said': {
      const lines = agentLines(run);
      for (const l of lines) {
        const hit = containsAny(l, check.anyOf);
        if (hit) return { ...base, passed: false, detail: `The agent said "${hit}": "${l}".` };
      }
      return { ...base, passed: true, detail: 'None of the forbidden terms were spoken.' };
    }
    case 'asked_slot': {
      const asks = run.trace.filter((e) => e.kind === 'ask' && check.slots.includes(e.slot));
      const n = asks.length;
      const min = check.min ?? 1;
      const max = check.max ?? Number.POSITIVE_INFINITY;
      const passed = n >= min && n <= max;
      const allAsks = run.trace.flatMap((e) => (e.kind === 'ask' ? [e.slot] : []));
      return {
        ...base,
        passed,
        detail: passed
          ? `The agent asked ${n} question(s) with slot ${check.slots.join('/')}.`
          : `Expected ${min}${check.max !== undefined ? `–${check.max}` : '+'} question(s) with slot ${check.slots.join(' or ')}; observed ${n}. Questions asked (slots): ${allAsks.length ? allAsks.join(', ') : 'none'}.`,
      };
    }
    case 'outcome': {
      const passed = check.anyOf.includes(run.outcome);
      return {
        ...base,
        passed,
        detail: passed ? `Outcome was "${run.outcome}".` : `Outcome was "${run.outcome}"${run.endReason ? ` (${run.endReason})` : ''}; expected one of ${check.anyOf.join(', ')}.`,
      };
    }
    case 'no_fatal_error': {
      const passed = !run.fatalError;
      return {
        ...base,
        passed,
        detail: passed ? 'No unhandled error.' : `Unhandled error ${run.fatalError!.code}${run.fatalError!.stepId ? ` in step "${run.fatalError!.stepId}"` : ''}: ${run.fatalError!.message} — ${run.fatalError!.explanation}`,
      };
    }
    case 'variables_satisfy': {
      try {
        const value = await evaluate(check.expression, { vars: run.variables });
        const passed = truthy(value);
        return {
          ...base,
          passed,
          detail: passed ? `Condition holds: ${check.expression}` : `Condition is false: ${check.expression}. Final variables: ${JSON.stringify(run.variables).slice(0, 600)}`,
        };
      } catch (err) {
        return { ...base, passed: false, detail: `Could not evaluate ${check.expression}: ${(err as Error).message}` };
      }
    }
    case 'max_steps': {
      const passed = run.stepsExecuted <= check.max;
      return { ...base, passed, detail: passed ? `${run.stepsExecuted} steps executed.` : `${run.stepsExecuted} steps executed; expected at most ${check.max}.` };
    }
  }
}

export function summarize(results: ScenarioResult[]) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const checksTotal = results.reduce((n, r) => n + r.checks.length, 0);
  const checksPassed = results.reduce((n, r) => n + r.checks.filter((c) => c.passed).length, 0);
  return { total, passed, checksTotal, checksPassed, allPassed: passed === total };
}
