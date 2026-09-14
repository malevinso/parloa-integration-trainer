import type { RunResult, TraceEvent } from '../../core/engine/types';
import { JsonView } from './JsonView';

function StatusPill({ status }: { status: number }) {
  const cls = status === 0 ? 's0' : `s${Math.floor(status / 100)}`;
  return <span className={`status-pill ${cls}`}>{status === 0 ? 'no response' : status}</span>;
}

function eventClass(e: TraceEvent): string {
  switch (e.kind) {
    case 'error':
      return 'error';
    case 'http_error':
      return 'error';
    case 'http_response':
      return e.ok ? 'ok' : 'error';
    case 'verification':
    case 'protected_data':
      return 'security';
    case 'step_start':
      return 'step';
    default:
      return '';
  }
}

function Summary({ e }: { e: TraceEvent }) {
  switch (e.kind) {
    case 'run_start':
      return <span>Run started{e.scenarioId ? ` · scenario ${e.scenarioId}` : ''}</span>;
    case 'step_start':
      return (
        <span>
          <span className={`step-type ${e.stepType}`}>{e.stepType}</span> <span className="mono">{e.stepId}</span>
          {e.name ? <span className="muted"> — {e.name}</span> : null}
        </span>
      );
    case 'http_request':
      return (
        <span>
          <span className="mono">
            {e.request.method} {e.request.url}
          </span>
          {e.attempt > 1 ? <span className="badge warning" style={{ marginLeft: 6 }}>attempt {e.attempt}</span> : null}
        </span>
      );
    case 'http_response':
      return (
        <span>
          <StatusPill status={e.response.status} /> <span className="muted small">{e.response.elapsedMs} ms</span>
          {e.response.parseError ? <span className="badge danger" style={{ marginLeft: 6 }}>malformed body</span> : null}
          {!e.ok && !e.response.parseError ? <span className="badge danger" style={{ marginLeft: 6 }}>unexpected status</span> : null}
        </span>
      );
    case 'http_error':
      return (
        <span>
          <span className="badge danger">{e.error.kind}</span> {e.error.message}
        </span>
      );
    case 'retry':
      return (
        <span>
          Retrying (attempt {e.attempt}) after {e.reason} — waiting {e.waitMs} ms
        </span>
      );
    case 'mapping':
      return (
        <span>
          Mapped {e.results.length} variable(s){e.results.some((r) => r.error) ? <span className="badge danger" style={{ marginLeft: 6 }}>error</span> : null}
        </span>
      );
    case 'set':
      return <span>Set {e.results.map((r) => r.variable).join(', ')}</span>;
    case 'branch':
      return <span>Branch → {e.chosen ? <span className="mono">{e.chosen}</span> : <em>next step</em>}</span>;
    case 'ask':
      return (
        <span>
          Asked <span className="badge">{e.slot}</span> → saved <span className="mono">{e.saved.variable}</span>
          {!e.matched ? <span className="badge danger" style={{ marginLeft: 6 }}>no match</span> : null}
        </span>
      );
    case 'say':
      return <span>"{e.text.length > 110 ? `${e.text.slice(0, 110)}…` : e.text}"</span>;
    case 'verification':
      return (
        <span>
          <span className={`badge ${e.verified ? 'success' : 'danger'}`}>{e.verified ? 'VERIFIED' : 'NOT VERIFIED'}</span> {e.detail}
        </span>
      );
    case 'protected_data':
      return (
        <span>
          <span className={`badge ${e.released ? 'warning' : 'success'}`}>{e.released ? 'DATA RELEASED' : 'DATA WITHHELD'}</span> {e.detail}
        </span>
      );
    case 'error':
      return (
        <span>
          <span className="badge danger">{e.code}</span> {e.message}
        </span>
      );
    case 'end':
      return (
        <span>
          Conversation ended: <span className="badge primary">{e.outcome}</span>
          {e.reason ? <span className="muted"> — {e.reason}</span> : null}
        </span>
      );
  }
}

function Body({ e }: { e: TraceEvent }) {
  switch (e.kind) {
    case 'http_request':
      return (
        <div>
          <div className="small muted">Headers</div>
          <JsonView value={e.request.headers} maxHeight={160} />
          {e.request.body !== undefined ? (
            <>
              <div className="small muted">Body</div>
              <JsonView value={e.request.body} />
            </>
          ) : null}
        </div>
      );
    case 'http_response':
      return (
        <div>
          <div className="small muted">Headers</div>
          <JsonView value={e.response.headers} maxHeight={120} />
          {e.response.parseError ? (
            <div className="notice danger" style={{ margin: '6px 0' }}>
              {e.response.parseError}
            </div>
          ) : null}
          <div className="small muted">{e.response.rawBody !== undefined ? 'Raw body' : 'Body'}</div>
          <JsonView value={e.response.rawBody !== undefined ? e.response.rawBody : e.response.body} />
        </div>
      );
    case 'http_error':
      return <div className="small">Elapsed {e.error.elapsedMs} ms. {e.error.message}</div>;
    case 'mapping':
    case 'set':
      return (
        <table className="data">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Expression</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {e.results.map((r) => (
              <tr key={r.variable}>
                <td className="mono">{r.variable}</td>
                <td className="mono">{r.expression}</td>
                <td>{r.error ? <span className="badge danger">{r.error}</span> : <JsonView value={r.value} maxHeight={140} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'branch':
      return (
        <table className="data">
          <thead>
            <tr>
              <th>Case</th>
              <th>Condition</th>
              <th>Result</th>
              <th>Goto</th>
            </tr>
          </thead>
          <tbody>
            {e.evaluated.map((c, i) => (
              <tr key={i}>
                <td>{c.label ?? i + 1}</td>
                <td className="mono">{c.when}</td>
                <td>{c.error ? <span className="badge danger">{c.error}</span> : <span className={`badge ${c.matched ? 'success' : ''}`}>{JSON.stringify(c.result)}</span>}</td>
                <td className="mono">{c.goto}</td>
              </tr>
            ))}
            {!e.evaluated.some((c) => c.matched) ? (
              <tr>
                <td colSpan={4} className="muted small">
                  No case matched → {e.chosen ? `otherwise: ${e.chosen}` : 'next step in order'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      );
    case 'ask':
      return (
        <div className="small">
          <div>
            <strong>Prompt:</strong> {e.prompt}
          </div>
          {e.options ? (
            <div>
              <strong>Options:</strong>
              <ol style={{ margin: '4px 0 6px', paddingLeft: 20 }}>
                {e.options.map((o, i) => (
                  <li key={i}>{o.label}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <div>
            <strong>Customer answered:</strong> {e.answer}
            {e.sensitive ? <span className="badge parloa" style={{ marginLeft: 6 }}>sensitive · redacted</span> : null}
          </div>
          <div>
            <strong>Saved:</strong> <span className="mono">{e.saved.variable}</span> = <code>{JSON.stringify(e.saved.value)}</code>
          </div>
        </div>
      );
    case 'say':
      return <div className="small">{e.text}</div>;
    case 'error':
      return (
        <div className="small">
          <p>{e.explanation}</p>
          <p className="muted">Routed to: {e.routedTo ?? 'nowhere (unhandled — the run aborted)'}</p>
        </div>
      );
    default:
      return null;
  }
}

export function TraceView({ run }: { run: RunResult | null }) {
  if (!run) return <p className="muted small">Run a scenario to see its execution trace here.</p>;
  const errors = run.trace.filter((e) => e.kind === 'error');
  return (
    <div className="stack">
      <div className="row">
        <span className="badge primary">outcome: {run.outcome}</span>
        <span className={`badge ${run.verification.verified ? 'success' : 'warning'}`}>{run.verification.verified ? `verified ${run.verification.customerId}` : 'not verified'}</span>
        <span className="badge">{run.stepsExecuted} steps</span>
        <span className="badge">{run.systemLog.length} API calls</span>
        <span className="badge">{run.simulatedMs} ms simulated</span>
        {errors.length ? <span className="badge danger">{errors.length} error event(s)</span> : <span className="badge success">no errors</span>}
      </div>
      {run.fatalError ? (
        <div className="notice danger">
          <strong>{run.fatalError.code}</strong>: {run.fatalError.message}
          <div className="small" style={{ marginTop: 4 }}>
            {run.fatalError.explanation}
          </div>
        </div>
      ) : null}
      <div className="trace">
        {run.trace.map((e) => (
          <details key={e.seq} className={`trace-event ${eventClass(e)}`} open={e.kind === 'error' || e.kind === 'http_error'}>
            <summary>
              <span className="kind">{e.kind.replace('_', ' ')}</span>
              <Summary e={e} />
            </summary>
            <div className="body">
              <Body e={e} />
            </div>
          </details>
        ))}
      </div>
      <details className="plain">
        <summary>Final variables (sensitive values redacted)</summary>
        <JsonView value={run.variables} maxHeight={400} />
      </details>
      <details className="plain">
        <summary>Requests as seen by the practice systems ({run.systemLog.length})</summary>
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>System</th>
              <th>Request</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {run.systemLog.map((l) => (
              <tr key={l.seq}>
                <td>{l.seq}</td>
                <td>{l.system}</td>
                <td className="mono">
                  {l.method} {l.path}
                </td>
                <td>
                  <StatusPill status={l.status} />
                </td>
                <td className="small muted">
                  {l.note ?? ''}
                  {l.protectedDataReleased ? ' · protected data released' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
