import { describe, expect, it } from 'vitest';
import { runScenario, runScenarios, summarize } from '../src/core/assessment/grader';
import type { WorkflowConfig } from '../src/core/engine/types';
import { labScenarioIds, scenarios } from '../src/core/simulator/scenarios';
import { referenceWismoWorkflow } from '../src/core/workflows/referenceSolution';

function withoutVerification(): WorkflowConfig {
  // A tempting shortcut: skip verification and go straight to the orders API.
  const wf = referenceWismoWorkflow();
  wf.id = 'no-verification';
  wf.steps = wf.steps.filter((s) => !['ask-dob', 'ask-postal', 'verify', 'route-verified', 'not-verified', 'end-blocked'].includes(s.id));
  const pick = wf.steps.find((s) => s.id === 'pick-single');
  if (pick && pick.type === 'set') pick.next = 'get-orders';
  const orders = wf.steps.find((s) => s.id === 'get-orders');
  if (orders && orders.type === 'http') delete orders.request.headers!['X-Verification-Token'];
  return wf;
}

function disclosingBeforeVerification(): WorkflowConfig {
  const wf = referenceWismoWorkflow();
  wf.id = 'early-disclosure';
  const idx = wf.steps.findIndex((s) => s.id === 'ask-dob');
  wf.steps.splice(idx, 0, { id: 'eager', type: 'say', text: 'Great news, your Adjustable Laptop Stand is on its way!' });
  const pick = wf.steps.find((s) => s.id === 'pick-single');
  if (pick && pick.type === 'set') pick.next = 'eager';
  return wf;
}

function unboundedRetries(): WorkflowConfig {
  const wf = referenceWismoWorkflow();
  wf.id = 'retry-storm';
  const track = wf.steps.find((s) => s.id === 'track');
  if (track && track.type === 'http') track.retry = { maxAttempts: 8, backoffMs: 100, retryOn: ['timeout'] };
  return wf;
}

describe('assessment grades observable behaviour', () => {
  it('the reference solution passes the whole lab', async () => {
    const results = await runScenarios(referenceWismoWorkflow(), labScenarioIds.map((id) => scenarios[id]));
    const summary = summarize(results);
    expect(summary.allPassed).toBe(true);
    expect(summary.total).toBe(7);
    expect(summary.checksPassed).toBe(summary.checksTotal);
  });

  it('a workflow that skips verification is blocked by the OMS and fails with an explanation', async () => {
    const result = await runScenario(withoutVerification(), scenarios['wismo-happy-path']);
    expect(result.passed).toBe(false);
    const released = result.checks.find((c) => c.check.type === 'protected_data_released');
    expect(released?.passed).toBe(false);
    expect(released?.detail).toContain('VERIFICATION_REQUIRED');
    const verified = result.checks.find((c) => c.check.type === 'verification');
    expect(verified?.passed).toBe(false);
    expect(verified?.detail).toContain('never called');
    // The mock service, not the UI, enforces the boundary: no order data left the OMS.
    expect(result.run.systemLog.filter((e) => e.system === 'orders').every((e) => e.status === 403)).toBe(true);
    expect(JSON.stringify(result.run.transcript)).not.toContain('ORD-10021');
  });

  it('speaking order details before verification is caught with the offending step', async () => {
    const result = await runScenario(disclosingBeforeVerification(), scenarios['wismo-happy-path']);
    const check = result.checks.find((c) => c.check.type === 'no_disclosure_before_verification');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('Step "eager"');
    expect(check?.detail).toContain('laptop stand');
  });

  it('unbounded retries fail the outage scenario with a count', async () => {
    const result = await runScenario(unboundedRetries(), scenarios['wismo-carrier-timeout']);
    const check = result.checks.find((c) => c.check.type === 'api_called' && c.check.system === 'carrier');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('observed 8');
    expect(check?.hint).toContain('maxAttempts');
  });

  it('the failed-verification scenario really fails verification and blocks data', async () => {
    const result = await runScenario(referenceWismoWorkflow(), scenarios['wismo-failed-verification']);
    expect(result.passed).toBe(true);
    expect(result.run.outcome).toBe('blocked');
    expect(result.run.verification.verified).toBe(false);
    expect(result.run.systemLog.some((e) => e.system === 'orders')).toBe(false);
  });

  it('retrying after a failed run works (fresh systems per scenario)', async () => {
    const first = await runScenario(withoutVerification(), scenarios['wismo-happy-path']);
    const second = await runScenario(referenceWismoWorkflow(), scenarios['wismo-happy-path']);
    expect(first.passed).toBe(false);
    expect(second.passed).toBe(true);
  });
});

describe('starter workflows behave as the lessons describe', () => {
  it('the mapping solution passes the mapping scenario and the mapping starter does not', async () => {
    const { solutionMapping, starterMapping, starterAuth, starterVerification, starterDebugging, starterResilience, starterBranching, starterLookup } = await import('../src/core/workflows/starters');
    expect((await runScenario(solutionMapping(), scenarios['mapping-order-view'])).passed).toBe(true);
    expect((await runScenario(starterMapping(), scenarios['mapping-order-view'])).passed).toBe(false);
    // Every starter is at least structurally valid and runs without an engine crash.
    for (const factory of [starterAuth, starterVerification, starterDebugging, starterResilience, starterBranching, starterLookup]) {
      const result = await runScenario(factory(), scenarios['wismo-happy-path']);
      expect(result.run.fatalError?.code).not.toBe('INVALID_CONFIG');
      expect(result.run.fatalError?.code).not.toBe('INTERNAL_ERROR');
    }
    expect((await runScenario(starterAuth(), scenarios['auth-crm-and-oms'])).passed).toBe(false);
    expect((await runScenario(starterVerification(), scenarios['verify-then-orders'])).passed).toBe(false);
    expect((await runScenario(starterDebugging(), scenarios['wismo-happy-path'])).passed).toBe(false);
    expect((await runScenario(starterResilience(), scenarios['wismo-carrier-timeout'])).passed).toBe(false);
    expect((await runScenario(starterBranching(), scenarios['wismo-multiple-orders'])).passed).toBe(false);
    expect((await runScenario(starterLookup(), scenarios['lookup-single-match'])).passed).toBe(false);
  });
});
