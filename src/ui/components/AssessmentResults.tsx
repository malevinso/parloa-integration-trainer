import type { ScenarioResult } from '../../core/assessment/types';
import { scenarios } from '../../core/simulator/scenarios';

export function ScenarioList({ results, scenarioIds, selectedId, onSelect, persisted }: { results: ScenarioResult[]; scenarioIds: string[]; selectedId: string | null; onSelect: (id: string) => void; persisted: Record<string, boolean> }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {scenarioIds.map((id) => {
        const s = scenarios[id];
        const r = results.find((x) => x.scenarioId === id);
        const status = r ? (r.passed ? 'pass' : 'fail') : persisted[id] === true ? 'pass-prev' : persisted[id] === false ? 'fail-prev' : 'none';
        return (
          <div key={id} className={`scenario-row ${selectedId === id ? 'active' : ''}`} onClick={() => onSelect(id)}>
            <span className={`badge ${status.startsWith('pass') ? 'success' : status.startsWith('fail') ? 'danger' : ''}`}>
              {status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : status === 'pass-prev' ? 'passed earlier' : status === 'fail-prev' ? 'failed earlier' : 'not run'}
            </span>
            <span className="title">{s.title}</span>
            {r ? (
              <span className="small muted">
                {r.checks.filter((c) => c.passed).length}/{r.checks.length} checks
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function CheckResults({ result }: { result: ScenarioResult }) {
  return (
    <div>
      {result.checks.map((c, i) => (
        <div key={i} className={`check ${c.passed ? 'pass' : 'fail'}`}>
          <div className="mark">{c.passed ? '✓' : '✗'}</div>
          <div>
            <div>{c.title}</div>
            <div className="detail">{c.detail}</div>
            {!c.passed && c.hint ? (
              <div className="hint">
                <strong>Hint:</strong> {c.hint}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
