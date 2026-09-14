/**
 * Persistence: progress, workflow drafts and settings are stored in
 * localStorage and can be exported/imported as one JSON document.
 */
import type { WorkflowConfig } from '../core/engine/types';
import { validateWorkflow } from '../core/engine/validate';
import type { FaultConfig } from '../core/systems/types';

export const STORAGE_KEY = 'parloa-integration-trainer.v1';

export interface ModuleProgress {
  status: 'not_started' | 'in_progress' | 'completed';
  labPassed: boolean;
  quizPassed: boolean;
  /** Pass/fail of the last assessment per scenario id. */
  scenarioResults: Record<string, boolean>;
  hintsRevealed: number;
  lastVisitedAt?: number;
  completedAt?: number;
}

export interface Settings {
  transport: 'virtual' | 'http';
  httpOrigin: string;
  speed: 'instant' | 'realistic';
  /** Fault injection for manual runs (simulator and API explorer). Graded runs use scenario faults. */
  faults: FaultConfig;
  theme: 'system' | 'light' | 'dark';
}

export interface PersistedState {
  version: 1;
  progress: { modules: Record<string, ModuleProgress>; lastModuleId?: string };
  workflows: Record<string, WorkflowConfig>;
  settings: Settings;
  updatedAt: number;
}

export function emptyModuleProgress(): ModuleProgress {
  return { status: 'not_started', labPassed: false, quizPassed: false, scenarioResults: {}, hintsRevealed: 0 };
}

export function defaultSettings(): Settings {
  return { transport: 'virtual', httpOrigin: 'http://localhost:8787', speed: 'realistic', faults: {}, theme: 'system' };
}

export function emptyState(): PersistedState {
  return { version: 1, progress: { modules: {} }, workflows: {}, settings: defaultSettings(), updatedAt: Date.now() };
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadState(): PersistedState {
  const s = storage();
  if (!s) return emptyState();
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export function saveState(state: PersistedState): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // quota exceeded or storage disabled: keep running in memory
  }
}

export function clearState(): void {
  storage()?.removeItem(STORAGE_KEY);
}

export function exportState(state: PersistedState): string {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'parloa-integration-trainer' }, null, 2);
}

export class ImportError extends Error {}

/** Validate and normalize an imported document. Throws ImportError with a readable message. */
export function parseImport(text: string): PersistedState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new ImportError(`Not valid JSON: ${(err as Error).message}`);
  }
  if (!data || typeof data !== 'object') throw new ImportError('The file does not contain a JSON object.');
  const obj = data as Partial<PersistedState>;
  if (obj.version !== 1) throw new ImportError(`Unsupported export version ${String(obj.version)} (expected 1).`);
  const state = normalizeState(obj);
  for (const [id, wf] of Object.entries(state.workflows)) {
    const errors = validateWorkflow(wf).filter((p) => p.severity === 'error');
    if (errors.length) throw new ImportError(`Workflow "${id}" is invalid: ${errors[0].message}`);
  }
  return state;
}

export function normalizeState(input: unknown): PersistedState {
  const base = emptyState();
  if (!input || typeof input !== 'object') return base;
  const obj = input as Partial<PersistedState>;
  const modules: Record<string, ModuleProgress> = {};
  for (const [id, p] of Object.entries(obj.progress?.modules ?? {})) {
    const mp = p as Partial<ModuleProgress>;
    modules[id] = {
      status: mp.status === 'completed' || mp.status === 'in_progress' ? mp.status : 'not_started',
      labPassed: Boolean(mp.labPassed),
      quizPassed: Boolean(mp.quizPassed),
      scenarioResults: mp.scenarioResults && typeof mp.scenarioResults === 'object' ? mp.scenarioResults : {},
      hintsRevealed: typeof mp.hintsRevealed === 'number' ? mp.hintsRevealed : 0,
      lastVisitedAt: mp.lastVisitedAt,
      completedAt: mp.completedAt,
    };
  }
  const workflows: Record<string, WorkflowConfig> = {};
  for (const [id, wf] of Object.entries(obj.workflows ?? {})) {
    if (wf && typeof wf === 'object' && Array.isArray((wf as WorkflowConfig).steps)) workflows[id] = wf as WorkflowConfig;
  }
  const s: Partial<Settings> = (obj.settings ?? {}) as Partial<Settings>;
  return {
    version: 1,
    progress: { modules, lastModuleId: obj.progress?.lastModuleId },
    workflows,
    settings: {
      transport: s.transport === 'http' ? 'http' : 'virtual',
      httpOrigin: typeof s.httpOrigin === 'string' && s.httpOrigin ? s.httpOrigin : 'http://localhost:8787',
      speed: s.speed === 'instant' ? 'instant' : 'realistic',
      faults: s.faults && typeof s.faults === 'object' ? s.faults : {},
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'system',
    },
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
  };
}
