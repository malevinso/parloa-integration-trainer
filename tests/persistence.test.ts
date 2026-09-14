import { beforeEach, describe, expect, it } from 'vitest';
import { emptyState, exportState, ImportError, loadState, parseImport, saveState, STORAGE_KEY } from '../src/state/store';
import { referenceWismoWorkflow } from '../src/core/workflows/referenceSolution';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

describe('persistence', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });

  it('round-trips progress, drafts and settings through localStorage', () => {
    const state = emptyState();
    state.progress.modules['m2-lookup'] = { status: 'in_progress', labPassed: false, quizPassed: true, scenarioResults: { 'lookup-none': true }, hintsRevealed: 2 };
    state.workflows['m9-capstone'] = referenceWismoWorkflow();
    state.settings.speed = 'instant';
    saveState(state);
    expect((globalThis as unknown as { localStorage: MemoryStorage }).localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    const loaded = loadState();
    expect(loaded.progress.modules['m2-lookup'].quizPassed).toBe(true);
    expect(loaded.workflows['m9-capstone'].steps.length).toBe(referenceWismoWorkflow().steps.length);
    expect(loaded.settings.speed).toBe('instant');
  });

  it('exports and imports a backup document, validating workflows', () => {
    const state = emptyState();
    state.workflows['m5-verification'] = referenceWismoWorkflow();
    const text = exportState(state);
    const imported = parseImport(text);
    expect(imported.workflows['m5-verification'].id).toBe('wismo-reference');
    expect(() => parseImport('not json')).toThrow(ImportError);
    expect(() => parseImport(JSON.stringify({ version: 2 }))).toThrow(/Unsupported export version/);
    const broken = JSON.parse(text) as { workflows: Record<string, { steps: unknown[] }> };
    broken.workflows['m5-verification'].steps = [{ id: 'x', type: 'branch', cases: [{ when: 'true', goto: 'missing' }] }];
    expect(() => parseImport(JSON.stringify(broken))).toThrow(/is invalid/);
  });

  it('survives corrupt storage', () => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadState().version).toBe(1);
  });
});
