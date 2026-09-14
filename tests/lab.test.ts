import { describe, expect, it } from 'vitest';
import { runScenario, runScenarios, summarize } from '../src/core/assessment/grader';
import { labScenarioIds, scenarios } from '../src/core/simulator/scenarios';
import { referenceWismoWorkflow } from '../src/core/workflows/referenceSolution';
import { PracticeSystems } from '../src/core/systems/practiceSystems';

describe('"Where is my order?" lab — reference solution', () => {
  for (const id of labScenarioIds) {
    it(`passes scenario ${id}`, async () => {
      const result = await runScenario(referenceWismoWorkflow(), scenarios[id]);
      const failed = result.checks.filter((c) => !c.passed).map((c) => `${c.title}: ${c.detail}`);
      expect(failed, `failed checks:\n${failed.join('\n')}`).toEqual([]);
      expect(result.run.fatalError).toBeUndefined();
    });
  }

  it('passes every module scenario too', async () => {
    const all = Object.values(scenarios);
    const results = await runScenarios(referenceWismoWorkflow(), all);
    const failures = results
      .filter((r) => !r.passed)
      .map((r) => `${r.scenarioId}: ${r.checks.filter((c) => !c.passed).map((c) => c.title).join(' | ')}`);
    // mapping-order-view is a module-specific exercise (needs vars.orderView); it is expected to fail here.
    expect(failures.filter((f) => !f.startsWith('mapping-order-view'))).toEqual([]);
    expect(summarize(results).total).toBe(all.length);
  });

  it('never leaks verification secrets into the trace, transcript or variables', async () => {
    const systems = new PracticeSystems();
    const secrets = systems.secretValues();
    const result = await runScenario(referenceWismoWorkflow(), scenarios['wismo-happy-path'], { systems });
    const visible = JSON.stringify({ trace: result.run.trace, transcript: result.run.transcript, variables: result.run.variables });
    for (const s of secrets) expect(visible, `secret ${s} leaked`).not.toContain(s);
    // The token itself is also redacted in learner-visible output.
    expect(visible).not.toMatch(/vt_[a-z0-9]{6,}/);
    expect(visible).toContain('vt_[redacted]');
  });

  it('records an explicit verification event and protected data release in the trace', async () => {
    const result = await runScenario(referenceWismoWorkflow(), scenarios['wismo-happy-path']);
    const kinds = result.run.trace.map((e) => e.kind);
    expect(kinds).toContain('verification');
    expect(kinds).toContain('protected_data');
    const verification = result.run.trace.find((e) => e.kind === 'verification');
    expect(verification && 'verified' in verification && verification.verified).toBe(true);
  });
});
