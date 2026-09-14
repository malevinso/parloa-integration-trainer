import { describe, expect, it } from 'vitest';
import { modules } from '../src/curriculum/modules';
import { scenarios } from '../src/core/simulator/scenarios';
import { starters, getStarter } from '../src/core/workflows/starters';
import { validateWorkflow } from '../src/core/engine/validate';
import { parloaReferences } from '../src/curriculum/parloaConcepts';

describe('curriculum consistency', () => {
  it('has unique ids and orders, and every module has the required parts', () => {
    const ids = new Set<string>();
    const orders = new Set<number>();
    for (const m of modules) {
      expect(ids.has(m.id), `duplicate id ${m.id}`).toBe(false);
      ids.add(m.id);
      expect(orders.has(m.order), `duplicate order ${m.order}`).toBe(false);
      orders.add(m.order);
      expect(m.objective.length).toBeGreaterThan(40);
      expect(m.sections.length).toBeGreaterThanOrEqual(3);
      for (const s of m.sections) expect(s.body.length, `${m.id} section ${s.heading}`).toBeGreaterThan(200);
      expect(m.workedExample.body.length).toBeGreaterThan(200);
      expect(m.exercise.instructions.length).toBeGreaterThan(100);
      expect(m.exercise.completionCriteria.length).toBeGreaterThan(40);
      expect(m.exercise.hints.length).toBeGreaterThanOrEqual(3);
      expect(m.quiz.length).toBeGreaterThanOrEqual(3);
      expect(m.references.length).toBeGreaterThanOrEqual(2);
    }
    expect(modules.length).toBe(9);
  });

  it('references only existing scenarios and starter workflows', () => {
    for (const m of modules) {
      expect(m.exercise.scenarioIds.length, m.id).toBeGreaterThan(0);
      for (const id of m.exercise.scenarioIds) expect(scenarios[id], `${m.id} → scenario ${id}`).toBeDefined();
      expect(starters[m.exercise.starterWorkflowId], `${m.id} → starter ${m.exercise.starterWorkflowId}`).toBeDefined();
      if (m.exercise.solutionWorkflowId) expect(starters[m.exercise.solutionWorkflowId]).toBeDefined();
      if (m.workedExample.workflowId) expect(starters[m.workedExample.workflowId]).toBeDefined();
      if (m.workedExample.scenarioId) expect(scenarios[m.workedExample.scenarioId]).toBeDefined();
    }
  });

  it('quiz answers point at existing choices and explanations are present', () => {
    for (const m of modules) {
      for (const q of m.quiz) {
        expect(q.choices.length).toBeGreaterThanOrEqual(3);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        expect(q.explanation.length).toBeGreaterThan(30);
      }
    }
  });

  it('labels every Parloa claim with a linked source', () => {
    for (const m of modules) {
      const text = m.sections.map((s) => s.body).join('\n');
      const parloaCallouts = text.match(/\[!PARLOA\][^\n]*/g) ?? [];
      for (const c of parloaCallouts) expect(c, `${m.id}: ${c.slice(0, 60)}`).toMatch(/https?:\/\/(www\.parloa\.com|docs\.parloa\.com|docs\.amp\.parloa\.com|openai\.com)/);
    }
    for (const r of Object.values(parloaReferences)) expect(r.url).toMatch(/^https:\/\//);
  });

  it('every starter workflow is structurally valid', () => {
    for (const id of Object.keys(starters)) {
      const errors = validateWorkflow(getStarter(id)).filter((p) => p.severity === 'error');
      expect(errors, `${id}: ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
    }
  });

  it('every scenario has a persona, checks and a summary', () => {
    for (const s of Object.values(scenarios)) {
      expect(s.persona).toBeDefined();
      expect(s.checks.length).toBeGreaterThan(2);
      expect(s.summary.length).toBeGreaterThan(30);
      expect(s.expectedBehaviour.length).toBeGreaterThan(30);
    }
  });
});
