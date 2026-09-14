import { describe, expect, it } from 'vitest';
import { runWorkflow } from '../src/core/engine/executor';
import { VirtualTransport } from '../src/core/engine/transport';
import type { Step, WorkflowConfig } from '../src/core/engine/types';
import { validateWorkflow } from '../src/core/engine/validate';
import { PracticeSystems } from '../src/core/systems/practiceSystems';
import { ScriptedCustomer } from '../src/core/simulator/customer';
import { personas } from '../src/core/simulator/personas';
import { defaultEnv } from '../src/core/workflows/env';
import { referenceWismoWorkflow } from '../src/core/workflows/referenceSolution';
import type { FaultConfig } from '../src/core/systems/types';

function workflow(steps: Step[], extra: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return { id: 'test', name: 'test', env: defaultEnv(), variables: {}, steps, ...extra };
}

async function run(config: WorkflowConfig, opts: { faults?: FaultConfig; persona?: typeof personas.priya } = {}) {
  const systems = new PracticeSystems();
  const transport = new VirtualTransport(systems, { faults: opts.faults ?? {} });
  return runWorkflow(config, { transport, customer: new ScriptedCustomer(opts.persona ?? personas.priya), secretValues: systems.secretValues() });
}

describe('templating, set and say', () => {
  it('renders JSONata templates and stores variables', async () => {
    const result = await run(
      workflow([
        { id: 's', type: 'set', assign: { greeting: '"Hello " & input.slots.phone', n: '1 + 2', list: '[1,2,3]' } },
        { id: 'say', type: 'say', text: '{{vars.greeting}} / {{vars.n}} / {{$join($map(vars.list, $string), "-")}}' },
        { id: 'end', type: 'end', outcome: 'resolved' },
      ]),
    );
    expect(result.outcome).toBe('resolved');
    expect(result.transcript.at(-1)?.text).toBe('Hello 602-555-0101 / 3 / 1-2-3');
    expect(result.variables.n).toBe(3);
  });

  it('reports invalid configuration before running anything', async () => {
    const result = await run(workflow([{ id: 'x', type: 'branch', cases: [{ when: 'true', goto: 'missing' }] }]));
    expect(result.outcome).toBe('error');
    expect(result.fatalError?.code).toBe('INVALID_CONFIG');
    expect(result.fatalError?.message).toContain('unknown step "missing"');
  });

  it('validation produces warnings for http steps without onError', () => {
    const problems = validateWorkflow(referenceWismoWorkflow());
    expect(problems.filter((p) => p.severity === 'error')).toEqual([]);
    const noRoute = validateWorkflow(workflow([{ id: 'h', type: 'http', request: { method: 'GET', url: 'x' } }]));
    expect(noRoute.some((p) => p.severity === 'warning' && p.message.includes('onError'))).toBe(true);
    const badExpr = validateWorkflow(workflow([{ id: 's', type: 'set', assign: { a: 'vars.x[' } }]));
    expect(badExpr.some((p) => p.severity === 'error' && p.message.includes('Invalid JSONata'))).toBe(true);
  });

  it('stops runaway loops', async () => {
    const result = await run(workflow([{ id: 'loop', type: 'set', assign: { i: '(vars.i ? vars.i : 0) + 1' }, next: 'loop' }]));
    expect(result.fatalError?.code).toBe('STEP_LIMIT');
  });
});

describe('http step error handling', () => {
  const lookup = (overrides: Partial<Extract<Step, { type: 'http' }>> = {}): Extract<Step, { type: 'http' }> => ({
    id: 'lookup',
    type: 'http',
    request: { method: 'GET', url: '{{env.CRM_BASE_URL}}/customers', query: { phone: '{{input.slots.phone}}' }, headers: { Authorization: 'Bearer {{env.CRM_TOKEN}}' } },
    mapping: { count: 'response.body.count' },
    ...overrides,
  });

  it('routes 401 to onError with an explanation that names the header', async () => {
    const result = await run(
      workflow([
        lookup({ request: { method: 'GET', url: '{{env.CRM_BASE_URL}}/customers', query: { phone: '{{input.slots.phone}}' } }, onError: { say: 'Sorry, something went wrong.', end: 'handover' } }),
        { id: 'end', type: 'end', outcome: 'resolved' },
      ]),
    );
    expect(result.outcome).toBe('handover');
    const err = result.trace.find((e) => e.kind === 'error');
    expect(err && err.kind === 'error' && err.code).toBe('HTTP_401');
    expect(err && err.kind === 'error' && err.explanation).toContain('Authorization: Bearer');
    expect(result.transcript.at(-1)?.text).toBe('Sorry, something went wrong.');
  });

  it('aborts with a readable fatal error when no onError route exists', async () => {
    const result = await run(workflow([lookup({ request: { method: 'GET', url: 'https://nowhere.example.com/customers' } })]));
    expect(result.outcome).toBe('error');
    expect(result.fatalError?.code).toBe('NETWORK_ERROR');
    expect(result.fatalError?.explanation).toContain('No onError route');
  });

  it('retries a flaky service and succeeds on the second attempt', async () => {
    const result = await run(
      workflow([
        lookup({ retry: { maxAttempts: 3, backoffMs: 100, backoff: 'exponential', retryOn: [503] }, onError: { end: 'handover' } }),
        { id: 'end', type: 'end', outcome: 'resolved' },
      ]),
      { faults: { crm: 'flaky' } },
    );
    expect(result.outcome).toBe('resolved');
    expect(result.trace.filter((e) => e.kind === 'http_request')).toHaveLength(2);
    const retry = result.trace.find((e) => e.kind === 'retry');
    // The 503 carries Retry-After: 2, which outranks the configured 100 ms backoff.
    expect(retry && retry.kind === 'retry' && retry.waitMs).toBe(2000);
    expect(result.systemLog.map((e) => e.status)).toEqual([503, 200]);
  });

  it('honours Retry-After for 429 and gives up after maxAttempts', async () => {
    const result = await run(
      workflow([
        lookup({ retry: { maxAttempts: 2, backoffMs: 0, retryOn: [503] } }),
        lookup({ id: 'second', retry: { maxAttempts: 3, backoffMs: 10, retryOn: [429] }, onError: { say: 'Busy, please try later.', end: 'handover' } }),
        { id: 'end', type: 'end', outcome: 'resolved' },
      ]),
      { faults: { crm: 'rate_limit' } },
    );
    expect(result.outcome).toBe('handover');
    const retries = result.trace.filter((e) => e.kind === 'retry');
    expect(retries).toHaveLength(2);
    expect(retries.every((r) => r.kind === 'retry' && r.waitMs === 1000)).toBe(true);
    const err = result.trace.find((e) => e.kind === 'error');
    expect(err && err.kind === 'error' && err.code).toBe('HTTP_429');
  });

  it('treats timeouts as errors after bounded retries and records simulated time', async () => {
    const result = await run(
      workflow([
        lookup({ request: { method: 'GET', url: '{{env.CRM_BASE_URL}}/customers', query: { phone: '{{input.slots.phone}}' }, headers: { Authorization: 'Bearer {{env.CRM_TOKEN}}' }, timeoutMs: 2000 }, retry: { maxAttempts: 2, backoffMs: 500, retryOn: ['timeout'] }, onError: { say: 'Our systems are slow right now.', end: 'handover' } }),
      ]),
      { faults: { crm: 'timeout' } },
    );
    expect(result.outcome).toBe('handover');
    expect(result.trace.filter((e) => e.kind === 'http_error')).toHaveLength(2);
    expect(result.simulatedMs).toBe(2000 + 500 + 2000);
    const err = result.trace.find((e) => e.kind === 'error');
    expect(err && err.kind === 'error' && err.code).toBe('TIMEOUT');
  });

  it('detects malformed JSON bodies instead of mapping garbage', async () => {
    const result = await run(
      workflow([lookup({ onError: { setVars: { failure: 'error.code' }, say: 'We have a technical problem.', end: 'handover' } })]),
      { faults: { crm: 'malformed' } },
    );
    expect(result.outcome).toBe('handover');
    expect(result.variables.failure).toBe('MALFORMED_RESPONSE');
    const resp = result.trace.find((e) => e.kind === 'http_response');
    expect(resp && resp.kind === 'http_response' && resp.response.parseError).toContain('not valid JSON');
  });

  it('routes mapping failures to onError', async () => {
    const result = await run(workflow([lookup({ mapping: { bad: '$notAFunction(response.body)' }, onError: { end: 'blocked' } })]));
    expect(result.outcome).toBe('blocked');
    const err = result.trace.find((e) => e.kind === 'error');
    expect(err && err.kind === 'error' && err.code).toBe('MAPPING_ERROR');
  });

  it('accepts custom expected statuses', async () => {
    const result = await run(
      workflow([
        { id: 'orders', type: 'http', request: { method: 'GET', url: '{{env.ORDERS_BASE_URL}}/orders', query: { customerId: 'CUST-1001' }, headers: { 'X-Api-Key': '{{env.OMS_API_KEY}}' } }, expectStatus: [200, 403], mapping: { denied: 'response.status = 403' } },
        { id: 'end', type: 'end', outcome: 'resolved' },
      ]),
    );
    expect(result.outcome).toBe('resolved');
    expect(result.variables.denied).toBe(true);
    const protectedEvent = result.trace.find((e) => e.kind === 'protected_data');
    expect(protectedEvent && protectedEvent.kind === 'protected_data' && protectedEvent.released).toBe(false);
  });
});

describe('conversation steps', () => {
  it('asks with options, matches the persona choice, and routes no-match answers', async () => {
    const result = await run(
      workflow([
        { id: 'items', type: 'set', assign: { orders: '[{"orderId":"A","name":"Yoga Mat"},{"orderId":"B","name":"Wireless Headphones"}]' } },
        { id: 'ask', type: 'ask', prompt: 'Which order?', slot: 'orderChoice', saveAs: 'chosen', options: { items: 'vars.orders', label: '{{item.name}}', value: 'item.orderId' } },
        { id: 'say', type: 'say', text: 'You chose {{vars.chosen}}.' },
        { id: 'ask2', type: 'ask', prompt: 'Pick again?', slot: 'orderChoice', saveAs: 'again', options: { items: '[{"name":"Nothing matching"}]', label: '{{item.name}}' }, onNoMatch: { say: 'No match.', end: 'handover' } },
      ]),
      { persona: personas.wei },
    );
    expect(result.variables.chosen).toBe('B');
    expect(result.transcript.map((l) => l.text)).toContain('You chose B.');
    expect(result.outcome).toBe('handover');
    const ask = result.trace.find((e) => e.kind === 'ask');
    expect(ask && ask.kind === 'ask' && ask.matched).toBe(true);
  });

  it('masks sensitive answers and blocks speaking them back', async () => {
    const result = await run(
      workflow([
        { id: 'ask', type: 'ask', prompt: 'Date of birth?', slot: 'dateOfBirth', saveAs: 'dob', sensitive: true },
        { id: 'leak', type: 'say', text: 'You said {{vars.dob}}.' },
        { id: 'end', type: 'end', outcome: 'resolved' },
      ]),
    );
    const customerLine = result.transcript.find((l) => l.role === 'customer' && l.stepId === 'ask');
    expect(customerLine?.text).toContain('date of birth provided');
    expect(customerLine?.text).not.toContain('1988');
    const agentLine = result.transcript.at(-1)!;
    expect(agentLine.text).toBe('You said [redacted].');
    expect(result.trace.some((e) => e.kind === 'error' && e.code === 'SENSITIVE_DISCLOSURE')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('1988-03-14');
    expect(result.sensitiveVariables).toEqual(['dob']);
  });

  it('uses opening slots from the persona and ends implicitly when steps run out', async () => {
    const result = await run(workflow([{ id: 'say', type: 'say', text: 'Phone: {{input.slots.phone}}' }]), { persona: personas.wei });
    expect(result.transcript[1].text).toBe('Phone: ');
    expect(result.outcome).toBe('resolved');
    expect(result.endReason).toBe('implicit end');
  });
});
