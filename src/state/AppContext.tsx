import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowConfig } from '../core/engine/types';
import type { ScenarioResult } from '../core/assessment/types';
import { PracticeSystems } from '../core/systems/practiceSystems';
import { getStarter } from '../core/workflows/starters';
import { modules } from '../curriculum/modules';
import { emptyModuleProgress, loadState, saveState, clearState, type ModuleProgress, type PersistedState, type Settings } from './store';

export interface RunRecord {
  moduleId: string;
  results: ScenarioResult[];
  at: number;
}

interface AppContextValue {
  state: PersistedState;
  /** Shared practice systems instance for manual exploration (API explorer, free simulator). */
  systems: PracticeSystems;
  /** In-memory results of the last assessment per module (not persisted in full). */
  lastRuns: Record<string, RunRecord>;
  getWorkflow: (moduleId: string) => WorkflowConfig;
  setWorkflow: (moduleId: string, workflow: WorkflowConfig) => void;
  resetWorkflow: (moduleId: string) => WorkflowConfig;
  loadWorkflowFrom: (moduleId: string, source: { starterId?: string; fromModuleId?: string; workflow?: WorkflowConfig }) => WorkflowConfig;
  getProgress: (moduleId: string) => ModuleProgress;
  markVisited: (moduleId: string) => void;
  recordLab: (moduleId: string, results: ScenarioResult[]) => void;
  recordQuiz: (moduleId: string, passed: boolean) => void;
  revealHint: (moduleId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  replaceState: (next: PersistedState) => void;
  resetAll: () => void;
  bumpSystems: () => void;
  systemsVersion: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [lastRuns, setLastRuns] = useState<Record<string, RunRecord>>({});
  const systemsRef = useRef(new PracticeSystems());
  const [systemsVersion, setSystemsVersion] = useState(0);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    saveState(state);
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.settings.theme);
  }, [state.settings.theme]);

  const moduleById = useMemo(() => new Map(modules.map((m) => [m.id, m])), []);

  const getWorkflow = useCallback(
    (moduleId: string): WorkflowConfig => {
      const existing = state.workflows[moduleId];
      if (existing) return existing;
      const mod = moduleById.get(moduleId);
      return getStarter(mod?.exercise.starterWorkflowId ?? 'capstone');
    },
    [state.workflows, moduleById],
  );

  const setWorkflow = useCallback((moduleId: string, workflow: WorkflowConfig) => {
    setState((s) => ({ ...s, workflows: { ...s.workflows, [moduleId]: workflow } }));
  }, []);

  const resetWorkflow = useCallback(
    (moduleId: string) => {
      const mod = moduleById.get(moduleId);
      const wf = getStarter(mod?.exercise.starterWorkflowId ?? 'capstone');
      setWorkflow(moduleId, wf);
      return wf;
    },
    [moduleById, setWorkflow],
  );

  const loadWorkflowFrom = useCallback(
    (moduleId: string, source: { starterId?: string; fromModuleId?: string; workflow?: WorkflowConfig }) => {
      let wf: WorkflowConfig;
      if (source.workflow) wf = structuredClone(source.workflow);
      else if (source.starterId) wf = getStarter(source.starterId);
      else if (source.fromModuleId) wf = structuredClone(getWorkflow(source.fromModuleId));
      else wf = resetWorkflow(moduleId);
      setWorkflow(moduleId, wf);
      return wf;
    },
    [getWorkflow, resetWorkflow, setWorkflow],
  );

  const getProgress = useCallback((moduleId: string) => state.progress.modules[moduleId] ?? emptyModuleProgress(), [state.progress.modules]);

  const patchProgress = useCallback((moduleId: string, patch: (p: ModuleProgress) => ModuleProgress) => {
    setState((s) => {
      const current = s.progress.modules[moduleId] ?? emptyModuleProgress();
      const next = patch(current);
      const completed = next.labPassed && next.quizPassed;
      const status: ModuleProgress['status'] = completed ? 'completed' : next.status === 'not_started' ? 'in_progress' : next.status;
      const finalized: ModuleProgress = { ...next, status, completedAt: completed ? (next.completedAt ?? Date.now()) : undefined };
      return { ...s, progress: { ...s.progress, modules: { ...s.progress.modules, [moduleId]: finalized } } };
    });
  }, []);

  const markVisited = useCallback(
    (moduleId: string) => {
      setState((s) => ({ ...s, progress: { ...s.progress, lastModuleId: moduleId } }));
      patchProgress(moduleId, (p) => ({ ...p, lastVisitedAt: Date.now(), status: p.status === 'not_started' ? 'in_progress' : p.status }));
    },
    [patchProgress],
  );

  const recordLab = useCallback(
    (moduleId: string, results: ScenarioResult[]) => {
      setLastRuns((r) => ({ ...r, [moduleId]: { moduleId, results, at: Date.now() } }));
      const mod = moduleById.get(moduleId);
      const required = new Set(mod?.exercise.scenarioIds ?? []);
      patchProgress(moduleId, (p) => {
        const scenarioResults = { ...p.scenarioResults };
        for (const r of results) scenarioResults[r.scenarioId] = r.passed;
        const labPassed = Array.from(required).every((id) => scenarioResults[id] === true);
        return { ...p, scenarioResults, labPassed: p.labPassed || labPassed };
      });
    },
    [moduleById, patchProgress],
  );

  const recordQuiz = useCallback((moduleId: string, passed: boolean) => patchProgress(moduleId, (p) => ({ ...p, quizPassed: p.quizPassed || passed })), [patchProgress]);
  const revealHint = useCallback((moduleId: string) => patchProgress(moduleId, (p) => ({ ...p, hintsRevealed: p.hintsRevealed + 1 })), [patchProgress]);

  const updateSettings = useCallback((patch: Partial<Settings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);
  const replaceState = useCallback((next: PersistedState) => setState(next), []);
  const resetAll = useCallback(() => {
    clearState();
    setState(loadState());
    setLastRuns({});
    systemsRef.current.reset();
    setSystemsVersion((v) => v + 1);
  }, []);
  const bumpSystems = useCallback(() => setSystemsVersion((v) => v + 1), []);

  const value: AppContextValue = {
    state,
    systems: systemsRef.current,
    lastRuns,
    getWorkflow,
    setWorkflow,
    resetWorkflow,
    loadWorkflowFrom,
    getProgress,
    markVisited,
    recordLab,
    recordQuiz,
    revealHint,
    updateSettings,
    replaceState,
    resetAll,
    bumpSystems,
    systemsVersion,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
