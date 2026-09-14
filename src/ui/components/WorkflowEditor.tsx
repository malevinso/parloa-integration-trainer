import { useEffect, useMemo, useState } from 'react';
import type { Step, StepType, WorkflowConfig } from '../../core/engine/types';
import { validateWorkflow } from '../../core/engine/validate';
import { defaultEnv } from '../../core/workflows/env';
import { KeyValueEditor } from './editors';
import { StepForm } from './StepForm';

export interface LoadOption {
  label: string;
  load: () => WorkflowConfig;
}

export interface WorkflowEditorProps {
  workflow: WorkflowConfig;
  onChange: (wf: WorkflowConfig) => void;
  loadOptions: LoadOption[];
  httpOrigin?: string;
}

function summarize(step: Step): string {
  switch (step.type) {
    case 'http':
      return `${step.request.method} ${step.request.url}`;
    case 'set':
      return Object.keys(step.assign).join(', ');
    case 'branch':
      return `${step.cases.length} case(s)${step.otherwise ? ` → otherwise ${step.otherwise}` : ''}`;
    case 'ask':
      return `${step.slot} → ${step.saveAs}${step.sensitive ? ' (sensitive)' : ''}`;
    case 'say':
      return step.text;
    case 'end':
      return step.outcome;
  }
}

function newStep(type: StepType, id: string, steps: Step[]): Step {
  switch (type) {
    case 'http':
      return { id, type, request: { method: 'GET', url: '{{env.CRM_BASE_URL}}/', query: {}, headers: {}, timeoutMs: 5000 }, mapping: {} };
    case 'set':
      return { id, type, assign: {} };
    case 'branch':
      return { id, type, cases: [{ when: 'true', goto: steps[0]?.id ?? id }] };
    case 'ask':
      return { id, type, prompt: '', slot: 'freeText', saveAs: 'answer' };
    case 'say':
      return { id, type, text: '' };
    case 'end':
      return { id, type, outcome: 'resolved' };
  }
}

export function WorkflowEditor({ workflow, onChange, loadOptions, httpOrigin }: WorkflowEditorProps) {
  const [view, setView] = useState<'steps' | 'env' | 'json'>('steps');
  const [selected, setSelected] = useState<string | null>(workflow.steps[0]?.id ?? null);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [addType, setAddType] = useState<StepType>('http');
  const [loadChoice, setLoadChoice] = useState('');

  useEffect(() => {
    if (view === 'json') setJsonText(JSON.stringify(workflow, null, 2));
  }, [view, workflow]);

  useEffect(() => {
    if (selected && !workflow.steps.some((s) => s.id === selected)) setSelected(workflow.steps[0]?.id ?? null);
  }, [workflow, selected]);

  const problems = useMemo(() => validateWorkflow(workflow), [workflow]);
  const errors = problems.filter((p) => p.severity === 'error');
  const warnings = problems.filter((p) => p.severity === 'warning');
  const selectedStep = workflow.steps.find((s) => s.id === selected) ?? null;

  const setSteps = (steps: Step[]) => onChange({ ...workflow, steps });

  const updateStep = (oldId: string, step: Step) => {
    // Keep references consistent when a step is renamed.
    const renamed = oldId !== step.id;
    const steps = workflow.steps.map((s) => (s.id === oldId ? step : renamed ? retarget(s, oldId, step.id) : s));
    setSteps(steps);
    if (renamed) setSelected(step.id);
  };

  const addStep = () => {
    let n = workflow.steps.length + 1;
    let id = `${addType}-${n}`;
    while (workflow.steps.some((s) => s.id === id)) id = `${addType}-${++n}`;
    const step = newStep(addType, id, workflow.steps);
    const idx = selected ? workflow.steps.findIndex((s) => s.id === selected) : workflow.steps.length - 1;
    const steps = [...workflow.steps];
    steps.splice(idx + 1, 0, step);
    setSteps(steps);
    setSelected(id);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as WorkflowConfig;
      const errs = validateWorkflow(parsed).filter((p) => p.severity === 'error');
      if (errs.length) {
        setJsonError(`Applied with ${errs.length} validation error(s): ${errs[0].message}`);
      } else setJsonError(null);
      onChange(parsed);
    } catch (err) {
      setJsonError(`Invalid JSON: ${(err as Error).message}`);
    }
  };

  return (
    <div>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div>
          <strong>{workflow.name}</strong>
          {workflow.description ? <div className="small muted">{workflow.description}</div> : null}
        </div>
        <div className="row">
          <select
            value={loadChoice}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setLoadChoice('');
              if (!Number.isFinite(idx) || !loadOptions[idx]) return;
              if (window.confirm(`Replace the current draft with "${loadOptions[idx].label}"? Your current edits to this module's draft will be lost.`)) {
                onChange(loadOptions[idx].load());
                setSelected(null);
              }
            }}
          >
            <option value="">Load workflow…</option>
            {loadOptions.map((o, i) => (
              <option key={i} value={i}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={view === 'steps' ? 'active' : ''} onClick={() => setView('steps')}>
          Steps ({workflow.steps.length})
        </button>
        <button className={view === 'env' ? 'active' : ''} onClick={() => setView('env')}>
          Environment
        </button>
        <button className={view === 'json' ? 'active' : ''} onClick={() => setView('json')}>
          JSON
        </button>
        <span className="right small muted" style={{ alignSelf: 'center' }}>
          {errors.length ? <span className="badge danger">{errors.length} error(s)</span> : <span className="badge success">valid</span>}{' '}
          {warnings.length ? <span className="badge warning">{warnings.length} warning(s)</span> : null}
        </span>
      </div>

      {view === 'steps' ? (
        <div className="grid-2" style={{ gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 1.4fr)' }}>
          <div>
            <div className="step-list">
              {workflow.steps.map((s, i) => (
                <div key={s.id} className={`step-item ${s.id === selected ? 'selected' : ''}`} onClick={() => setSelected(s.id)}>
                  <span className="idx">{i + 1}</span>
                  <span className={`step-type ${s.type}`}>{s.type}</span>
                  <span>
                    <div className="id">{s.id}</div>
                    <div className="summary">{s.name ? `${s.name} · ` : ''}{summarize(s)}</div>
                  </span>
                  <span>{problems.some((p) => p.stepId === s.id && p.severity === 'error') ? <span className="badge danger">!</span> : null}</span>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <select value={addType} onChange={(e) => setAddType(e.target.value as StepType)}>
                {(['http', 'set', 'branch', 'ask', 'say', 'end'] as StepType[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button className="small" onClick={addStep}>
                + Add step after selected
              </button>
            </div>
          </div>
          <div>
            {selectedStep ? (
              <StepForm
                key={workflow.steps.indexOf(selectedStep)}
                step={selectedStep}
                steps={workflow.steps}
                onChange={(s) => updateStep(selectedStep.id, s)}
                onDelete={() => {
                  if (window.confirm(`Delete step "${selectedStep.id}"?`)) setSteps(workflow.steps.filter((s) => s.id !== selectedStep.id));
                }}
                onMove={(delta) => {
                  const idx = workflow.steps.findIndex((s) => s.id === selectedStep.id);
                  const target = idx + delta;
                  if (target < 0 || target >= workflow.steps.length) return;
                  const steps = [...workflow.steps];
                  [steps[idx], steps[target]] = [steps[target], steps[idx]];
                  setSteps(steps);
                }}
              />
            ) : (
              <p className="muted small">Select a step to edit it.</p>
            )}
          </div>
        </div>
      ) : null}

      {view === 'env' ? (
        <div>
          <p className="small muted">
            Environment variables are referenced as <code>{'{{env.NAME}}'}</code>. Keep credentials here instead of typing them into steps. Sandbox
            credentials are published in the practice-system documentation — they are not secrets.
          </p>
          <KeyValueEditor value={workflow.env} onChange={(env) => onChange({ ...workflow, env })} keyPlaceholder="CRM_TOKEN" valuePlaceholder="value" addLabel="variable" />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="small" onClick={() => onChange({ ...workflow, env: { ...workflow.env, ...defaultEnv('virtual') } })}>
              Use in-browser practice systems
            </button>
            <button className="small" onClick={() => onChange({ ...workflow, env: { ...workflow.env, ...defaultEnv('http', httpOrigin ?? 'http://localhost:8787') } })}>
              Use local HTTP server ({httpOrigin ?? 'http://localhost:8787'})
            </button>
          </div>
          <hr />
          <div className="field-label">Initial variables (JSON)</div>
          <textarea
            className="code"
            rows={4}
            defaultValue={JSON.stringify(workflow.variables ?? {}, null, 2)}
            onBlur={(e) => {
              try {
                onChange({ ...workflow, variables: JSON.parse(e.target.value || '{}') });
              } catch {
                /* ignore invalid */
              }
            }}
          />
        </div>
      ) : null}

      {view === 'json' ? (
        <div>
          <textarea className="code" style={{ minHeight: 420 }} value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary small" onClick={applyJson}>
              Apply JSON
            </button>
            <button
              className="small"
              onClick={() => {
                try {
                  setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
                  setJsonError(null);
                } catch (err) {
                  setJsonError(`Invalid JSON: ${(err as Error).message}`);
                }
              }}
            >
              Format
            </button>
            <button className="small" onClick={() => navigator.clipboard?.writeText(jsonText)}>
              Copy
            </button>
            {jsonError ? <span className="problem error">{jsonError}</span> : null}
          </div>
        </div>
      ) : null}

      {problems.length ? (
        <div className="problems">
          {problems.map((p, i) => (
            <div
              key={i}
              className={`problem ${p.severity}`}
              style={{ cursor: p.stepId ? 'pointer' : 'default' }}
              onClick={() => {
                if (p.stepId) {
                  setView('steps');
                  setSelected(p.stepId);
                }
              }}
            >
              {p.severity === 'error' ? '✖' : '⚠'} {p.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function retarget(step: Step, oldId: string, newId: string): Step {
  const swap = (v: string | undefined) => (v === oldId ? newId : v);
  const route = (r: { goto?: string } | undefined) => (r && r.goto === oldId ? { ...r, goto: newId } : r);
  switch (step.type) {
    case 'http':
      return { ...step, next: swap(step.next), onError: route(step.onError) };
    case 'set':
    case 'say':
      return { ...step, next: swap(step.next) };
    case 'ask':
      return { ...step, next: swap(step.next), onNoMatch: route(step.onNoMatch) };
    case 'branch':
      return { ...step, otherwise: swap(step.otherwise), cases: step.cases.map((c) => ({ ...c, goto: c.goto === oldId ? newId : c.goto })) };
    default:
      return step;
  }
}
