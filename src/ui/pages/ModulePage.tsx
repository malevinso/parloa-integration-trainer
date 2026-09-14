import { useCallback, useEffect, useMemo, useState } from 'react';
import { runScenario } from '../../core/assessment/grader';
import type { ScenarioResult } from '../../core/assessment/types';
import type { TranscriptLine, WorkflowConfig } from '../../core/engine/types';
import { scenarios } from '../../core/simulator/scenarios';
import { getStarter } from '../../core/workflows/starters';
import { modules } from '../../curriculum/modules';
import { useApp } from '../../state/AppContext';
import { Markdown } from '../Markdown';
import { CheckResults, ScenarioList } from '../components/AssessmentResults';
import { Quiz } from '../components/Quiz';
import { TraceView } from '../components/TraceView';
import { Transcript } from '../components/Transcript';
import { WorkflowEditor, type LoadOption } from '../components/WorkflowEditor';
import { href, navigate } from '../router';

type Tab = 'learn' | 'lab' | 'debug' | 'assess';

export function ModulePage({ moduleId, tab }: { moduleId: string; tab?: string }) {
  const app = useApp();
  const mod = modules.find((m) => m.id === moduleId);
  const activeTab: Tab = (['learn', 'lab', 'debug', 'assess'] as Tab[]).includes(tab as Tab) ? (tab as Tab) : 'learn';
  const [results, setResults] = useState<ScenarioResult[]>(() => app.lastRuns[moduleId]?.results ?? []);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(mod?.exercise.scenarioIds[0] ?? null);
  const [running, setRunning] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptLine[] | null>(null);

  useEffect(() => {
    if (mod) app.markVisited(mod.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  const workflow = app.getWorkflow(moduleId);
  const progress = app.getProgress(moduleId);

  const setTab = (t: Tab) => navigate(`/module/${moduleId}/${t}`);

  const loadOptions: LoadOption[] = useMemo(() => {
    if (!mod) return [];
    const opts: LoadOption[] = [{ label: `Starter for this module (${mod.exercise.starterWorkflowId})`, load: () => getStarter(mod.exercise.starterWorkflowId) }];
    for (const other of modules) {
      if (other.id === mod.id) continue;
      if (app.state.workflows[other.id]) opts.push({ label: `My draft from module ${other.order}: ${other.title}`, load: () => structuredClone(app.state.workflows[other.id]) });
    }
    if (mod.exercise.solutionWorkflowId) opts.push({ label: 'Reference solution (spoiler)', load: () => getStarter(mod.exercise.solutionWorkflowId!) });
    return opts;
  }, [mod, app.state.workflows]);

  const runOne = useCallback(
    async (scenarioId: string, watch: boolean) => {
      if (!mod) return;
      setRunning(scenarioId);
      setSelectedScenarioId(scenarioId);
      setLiveTranscript(watch ? [] : null);
      try {
        const result = await runScenario(workflow, scenarios[scenarioId], {
          speed: watch ? app.state.settings.speed : 'instant',
          onEvent: watch ? (_e, transcript) => setLiveTranscript([...transcript]) : undefined,
          onTranscript: watch ? (transcript) => setLiveTranscript([...transcript]) : undefined,
        });
        setResults((prev) => {
          const next = prev.filter((r) => r.scenarioId !== scenarioId).concat(result);
          app.recordLab(mod.id, next);
          return next;
        });
      } finally {
        setRunning(null);
        setLiveTranscript(null);
      }
    },
    [mod, workflow, app],
  );

  const runAll = useCallback(async () => {
    if (!mod) return;
    const collected: ScenarioResult[] = [];
    for (const id of mod.exercise.scenarioIds) {
      setRunning(id);
      collected.push(await runScenario(workflow, scenarios[id], { speed: 'instant' }));
      setResults([...collected]);
    }
    setRunning(null);
    app.recordLab(mod.id, collected);
    if (!collected.every((r) => r.passed)) setSelectedScenarioId(collected.find((r) => !r.passed)!.scenarioId);
  }, [mod, workflow, app]);

  if (!mod) {
    return (
      <main className="page">
        <p>Unknown module. <a href={href('/')}>Back to the dashboard</a>.</p>
      </main>
    );
  }

  const selectedResult = results.find((r) => r.scenarioId === selectedScenarioId) ?? null;
  const idx = modules.findIndex((m) => m.id === mod.id);
  const prev = modules[idx - 1];
  const next = modules[idx + 1];
  const passedCount = mod.exercise.scenarioIds.filter((id) => progress.scenarioResults[id]).length;

  return (
    <main className="page">
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="small muted">
          <a href={href('/')}>Dashboard</a> › Module {mod.order} of {modules.length}
        </div>
        <div className="row small">
          {prev ? <a href={href(`/module/${prev.id}`)}>← {prev.title}</a> : null}
          {next ? <a href={href(`/module/${next.id}`)}>{next.title} →</a> : null}
        </div>
      </div>
      <h1>
        {mod.order}. {mod.title}
      </h1>
      <p className="muted">{mod.subtitle}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className={`badge ${progress.status === 'completed' ? 'success' : progress.status === 'in_progress' ? 'primary' : ''}`}>{progress.status.replace('_', ' ')}</span>
        <span className={`badge ${progress.labPassed ? 'success' : ''}`}>
          lab: {passedCount}/{mod.exercise.scenarioIds.length} scenarios
        </span>
        <span className={`badge ${progress.quizPassed ? 'success' : ''}`}>check for understanding: {progress.quizPassed ? 'passed' : 'open'}</span>
        <span className="badge">~{mod.estimatedMinutes} min</span>
      </div>

      <div className="tabs">
        {(['learn', 'lab', 'debug', 'assess'] as Tab[]).map((t) => (
          <button key={t} className={activeTab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'learn' ? 'Learn' : t === 'lab' ? 'Lab workspace' : t === 'debug' ? 'Debug view' : 'Assessment'}
          </button>
        ))}
      </div>

      {activeTab === 'learn' ? (
        <LearnTab mod={mod} progress={progress} onLoadExample={(id) => { app.loadWorkflowFrom(mod.id, { starterId: id }); setTab('lab'); }} onRevealHint={() => app.revealHint(mod.id)} onQuizPass={() => app.recordQuiz(mod.id, true)} onGoLab={() => setTab('lab')} />
      ) : null}

      {activeTab === 'lab' ? (
        <div className="lab-grid">
          <div className="card">
            <WorkflowEditor workflow={workflow} onChange={(wf: WorkflowConfig) => app.setWorkflow(mod.id, wf)} loadOptions={loadOptions} httpOrigin={app.state.settings.httpOrigin} />
          </div>
          <div>
            <div className="card">
              <div className="card-header">
                <h3>Scenarios for this exercise</h3>
                <div className="row">
                  <button className="primary small" disabled={running !== null} onClick={runAll}>
                    {running ? `Running ${running}…` : 'Run all & grade'}
                  </button>
                </div>
              </div>
              <ScenarioList results={results} scenarioIds={mod.exercise.scenarioIds} selectedId={selectedScenarioId} onSelect={setSelectedScenarioId} persisted={progress.scenarioResults} />
              {selectedScenarioId ? (
                <div style={{ marginTop: 10 }}>
                  <div className="small muted">
                    <strong>{scenarios[selectedScenarioId].persona.displayName}:</strong> {scenarios[selectedScenarioId].summary}
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="small" disabled={running !== null} onClick={() => runOne(selectedScenarioId, true)}>
                      ▶ Run this scenario
                    </button>
                    <button className="small" disabled={!selectedResult} onClick={() => setTab('debug')}>
                      Open in Debug view
                    </button>
                    <button className="small" disabled={!selectedResult} onClick={() => setTab('assess')}>
                      See check feedback
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="card">
              <h3>Conversation</h3>
              {liveTranscript ? <p className="small muted">Running…</p> : null}
              <Transcript lines={liveTranscript ?? selectedResult?.run.transcript ?? []} emptyText="Run a scenario to see the conversation." />
              {selectedResult ? (
                <div style={{ marginTop: 10 }}>
                  <div className="row">
                    <span className={`badge ${selectedResult.passed ? 'success' : 'danger'}`}>{selectedResult.passed ? 'scenario passed' : 'scenario failed'}</span>
                    <span className="badge">outcome: {selectedResult.run.outcome}</span>
                    {selectedResult.run.fatalError ? <span className="badge danger">{selectedResult.run.fatalError.code}</span> : null}
                  </div>
                  {!selectedResult.passed ? (
                    <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>
                      {selectedResult.checks
                        .filter((c) => !c.passed)
                        .slice(0, 3)
                        .map((c, i) => (
                          <li key={i}>{c.title}</li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'debug' ? (
        <div className="lab-grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}>
          <div className="card">
            <div className="card-header">
              <h3>Execution trace{selectedResult ? ` — ${scenarios[selectedResult.scenarioId].title}` : ''}</h3>
              <select value={selectedScenarioId ?? ''} onChange={(e) => setSelectedScenarioId(e.target.value)}>
                {mod.exercise.scenarioIds.map((id) => (
                  <option key={id} value={id}>
                    {scenarios[id].title}
                    {results.some((r) => r.scenarioId === id) ? '' : ' (not run yet)'}
                  </option>
                ))}
              </select>
            </div>
            <p className="small muted">
              Every request, response, mapped value, branch decision and error is listed in execution order. Verification and protected-data events show
              exactly when identity was confirmed and when the OMS released data. Sensitive values and tokens are redacted.
            </p>
            <TraceView run={selectedResult?.run ?? null} />
            {!selectedResult && selectedScenarioId ? (
              <button className="primary small" style={{ marginTop: 8 }} disabled={running !== null} onClick={() => runOne(selectedScenarioId, false)}>
                Run "{scenarios[selectedScenarioId].title}" now
              </button>
            ) : null}
          </div>
          <div className="card">
            <h3>Conversation</h3>
            <Transcript lines={selectedResult?.run.transcript ?? []} />
          </div>
        </div>
      ) : null}

      {activeTab === 'assess' ? (
        <div className="lab-grid" style={{ gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.4fr)' }}>
          <div className="card">
            <div className="card-header">
              <h3>Scenario tests</h3>
              <button className="primary small" disabled={running !== null} onClick={runAll}>
                {running ? `Running ${running}…` : results.length ? 'Re-run all' : 'Run all & grade'}
              </button>
            </div>
            <p className="small muted">
              Grading looks only at observable behaviour: which practice APIs were called (as recorded by the systems themselves), whether verification
              succeeded, what the agent said and when, and how the conversation ended.
            </p>
            <ScenarioList results={results} scenarioIds={mod.exercise.scenarioIds} selectedId={selectedScenarioId} onSelect={setSelectedScenarioId} persisted={progress.scenarioResults} />
            <div style={{ marginTop: 12 }}>
              <h4>Completion criteria</h4>
              <Markdown text={mod.exercise.completionCriteria} />
              {progress.labPassed ? <div className="notice success">All scenarios for this module have passed.</div> : null}
            </div>
          </div>
          <div className="card">
            {selectedResult ? (
              <>
                <div className="card-header">
                  <h3>
                    {scenarios[selectedResult.scenarioId].title} — {selectedResult.passed ? 'passed' : 'failed'}
                  </h3>
                  <div className="row">
                    <button className="small" disabled={running !== null} onClick={() => runOne(selectedResult.scenarioId, false)}>
                      Retry this scenario
                    </button>
                    <button className="small" onClick={() => setTab('debug')}>
                      Open trace
                    </button>
                  </div>
                </div>
                <p className="small muted">
                  <strong>Expected:</strong> {scenarios[selectedResult.scenarioId].expectedBehaviour}
                </p>
                <CheckResults result={selectedResult} />
              </>
            ) : (
              <p className="muted small">Select a scenario and run it to see check-by-check feedback.</p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function LearnTab({
  mod,
  progress,
  onLoadExample,
  onRevealHint,
  onQuizPass,
  onGoLab,
}: {
  mod: (typeof modules)[number];
  progress: ReturnType<ReturnType<typeof useApp>['getProgress']>;
  onLoadExample: (workflowId: string) => void;
  onRevealHint: () => void;
  onQuizPass: () => void;
  onGoLab: () => void;
}) {
  const [hintsShown, setHintsShown] = useState(progress.hintsRevealed);
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)' }}>
      <div>
        <div className="card">
          <h4>Objective</h4>
          <Markdown text={mod.objective} />
        </div>
        {mod.sections.map((s, i) => (
          <div key={i} className="card">
            <h2>{s.heading}</h2>
            <Markdown text={s.body} />
          </div>
        ))}
        <div className="card">
          <h2>Worked example: {mod.workedExample.title}</h2>
          <Markdown text={mod.workedExample.body} />
          {mod.workedExample.workflowId ? (
            <button className="small" onClick={() => onLoadExample(mod.workedExample.workflowId!)}>
              Load this example into the lab workspace
            </button>
          ) : null}
        </div>
        <div className="card">
          <h2>Exercise: {mod.exercise.title}</h2>
          <Markdown text={mod.exercise.instructions} />
          <h4>Completion criteria</h4>
          <Markdown text={mod.exercise.completionCriteria} />
          <div className="row">
            <button className="primary" onClick={onGoLab}>
              Open the lab workspace
            </button>
          </div>
          <hr />
          <h4>Hints</h4>
          {mod.exercise.hints.slice(0, hintsShown).map((h, i) => (
            <div key={i} className="callout tip">
              <div className="callout-title">Hint {i + 1}</div>
              <Markdown text={h} />
            </div>
          ))}
          {hintsShown < mod.exercise.hints.length ? (
            <button
              className="small"
              onClick={() => {
                setHintsShown(hintsShown + 1);
                onRevealHint();
              }}
            >
              Reveal hint {hintsShown + 1} of {mod.exercise.hints.length}
            </button>
          ) : (
            <span className="small muted">All hints revealed.</span>
          )}
        </div>
        <div className="card">
          <h2>Check for understanding</h2>
          <Quiz questions={mod.quiz} passed={progress.quizPassed} onPass={onQuizPass} />
        </div>
      </div>
      <aside>
        <div className="card">
          <h4>Sources for this module</h4>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {mod.references.map((r, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.title}
                </a>{' '}
                <span className={`badge ${r.kind === 'parloa-docs' || r.kind === 'parloa-site' ? 'parloa' : ''}`}>{r.kind === 'parloa-docs' ? 'Parloa docs' : r.kind === 'parloa-site' ? 'Parloa' : 'external'}</span>
                {r.note ? <div className="muted tiny">{r.note}</div> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h4>How to read the labels</h4>
          <div className="callout parloa" style={{ margin: '6px 0' }}>
            <div className="callout-title">Documented Parloa behaviour</div>
            <p className="small">Backed by a linked Parloa source.</p>
          </div>
          <div className="callout general" style={{ margin: '6px 0' }}>
            <div className="callout-title">General integration concept</div>
            <p className="small">True regardless of platform.</p>
          </div>
          <div className="callout sim" style={{ margin: '6px 0' }}>
            <div className="callout-title">This trainer's simulation</div>
            <p className="small">How this app models it; not a Parloa feature.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
