import { useEffect, useState } from 'react';
import type { EndOutcome, ErrorRoute, RetryPolicy, Step } from '../../core/engine/types';

/** Key/value table editor that keeps row order while typing. */
export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = 'name',
  valuePlaceholder = 'value',
  addLabel = 'Add',
  mono = true,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  mono?: boolean;
}) {
  const [rows, setRows] = useState<Array<{ k: string; v: string }>>(() => Object.entries(value).map(([k, v]) => ({ k, v })));
  useEffect(() => {
    // Re-sync when the outside value changes shape (e.g. after loading another workflow).
    const outside = Object.entries(value);
    const inside = rows.filter((r) => r.k.trim());
    const same = outside.length === inside.length && outside.every(([k, v], i) => inside[i]?.k === k && inside[i]?.v === v);
    if (!same) setRows(outside.map(([k, v]) => ({ k, v })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (next: Array<{ k: string; v: string }>) => {
    setRows(next);
    const obj: Record<string, string> = {};
    for (const r of next) if (r.k.trim()) obj[r.k.trim()] = r.v;
    onChange(obj);
  };
  return (
    <table className="kv-table">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="key">
              <input type="text" className={mono ? 'code' : ''} value={r.k} placeholder={keyPlaceholder} onChange={(e) => commit(rows.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
            </td>
            <td>
              <input type="text" className={mono ? 'code' : ''} value={r.v} placeholder={valuePlaceholder} onChange={(e) => commit(rows.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
            </td>
            <td className="actions">
              <button className="small" title="Remove" onClick={() => commit(rows.filter((_, j) => j !== i))}>
                ×
              </button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={3}>
            <button className="small" onClick={() => commit([...rows, { k: '', v: '' }])}>
              + {addLabel}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function StepSelect({ value, onChange, steps, allowNone = true, noneLabel = '(next step in order)' }: { value: string | undefined; onChange: (v: string | undefined) => void; steps: Step[]; allowNone?: boolean; noneLabel?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowNone ? <option value="">{noneLabel}</option> : null}
      {steps.map((s) => (
        <option key={s.id} value={s.id}>
          {s.id} ({s.type}){s.name ? ` — ${s.name}` : ''}
        </option>
      ))}
    </select>
  );
}

const OUTCOMES: EndOutcome[] = ['resolved', 'handover', 'blocked', 'abandoned'];

export function ErrorRouteEditor({ value, onChange, steps, title, description }: { value: ErrorRoute | undefined; onChange: (v: ErrorRoute | undefined) => void; steps: Step[]; title: string; description?: string }) {
  const enabled = value !== undefined;
  const route = value ?? {};
  const update = (patch: Partial<ErrorRoute>) => {
    const next = { ...route, ...patch };
    for (const k of Object.keys(next) as Array<keyof ErrorRoute>) if (next[k] === undefined || next[k] === '') delete next[k];
    onChange(next);
  };
  return (
    <fieldset>
      <legend>{title}</legend>
      {description ? <p className="small muted">{description}</p> : null}
      <label className="checkbox">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked ? {} : undefined)} /> configure a route
      </label>
      {enabled ? (
        <div className="stack" style={{ marginTop: 8 }}>
          <label className="field">
            <span>Say to the customer (template, optional)</span>
            <textarea value={route.say ?? ''} onChange={(e) => update({ say: e.target.value || undefined })} placeholder="I'm sorry, I can't reach that system right now…" />
          </label>
          <div className="inline-fields">
            <label className="field">
              <span>Then go to step</span>
              <StepSelect value={route.goto} onChange={(v) => update({ goto: v })} steps={steps} noneLabel="(none)" />
            </label>
            <label className="field">
              <span>Or end the conversation</span>
              <select value={route.end ?? ''} onChange={(e) => update({ end: (e.target.value || undefined) as EndOutcome | undefined })}>
                <option value="">(do not end)</option>
                {OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <div className="field-label">Set variables before routing (name → JSONata; `error.code` and `error.message` are in scope)</div>
            <KeyValueEditor value={route.setVars ?? {}} onChange={(v) => update({ setVars: Object.keys(v).length ? v : undefined })} keyPlaceholder="variable" valuePlaceholder="error.code" />
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}

const RETRY_TRIGGERS: Array<{ id: number | 'timeout' | 'network' | 'malformed'; label: string }> = [
  { id: 503, label: '503 unavailable' },
  { id: 502, label: '502 bad gateway' },
  { id: 500, label: '500 server error' },
  { id: 429, label: '429 rate limited' },
  { id: 'timeout', label: 'timeout' },
  { id: 'network', label: 'network error' },
  { id: 'malformed', label: 'malformed body' },
];

export function RetryEditor({ value, onChange }: { value: RetryPolicy | undefined; onChange: (v: RetryPolicy | undefined) => void }) {
  const enabled = value !== undefined;
  const policy: RetryPolicy = value ?? { maxAttempts: 3, backoffMs: 500, backoff: 'exponential', retryOn: [503, 429, 'timeout', 'network'], respectRetryAfter: true };
  const update = (patch: Partial<RetryPolicy>) => onChange({ ...policy, ...patch });
  const triggers = policy.retryOn ?? [503, 429, 'timeout', 'network'];
  return (
    <fieldset>
      <legend>Retry policy</legend>
      <label className="checkbox">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked ? policy : undefined)} /> retry failed attempts
      </label>
      {enabled ? (
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="inline-fields">
            <label className="field">
              <span>Max attempts (incl. first)</span>
              <input type="number" min={1} max={10} value={policy.maxAttempts} onChange={(e) => update({ maxAttempts: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Backoff (ms)</span>
              <input type="number" min={0} value={policy.backoffMs} onChange={(e) => update({ backoffMs: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Backoff strategy</span>
              <select value={policy.backoff ?? 'fixed'} onChange={(e) => update({ backoff: e.target.value as 'fixed' | 'exponential' })}>
                <option value="fixed">fixed</option>
                <option value="exponential">exponential</option>
              </select>
            </label>
          </div>
          <div>
            <div className="field-label">Retry on</div>
            {RETRY_TRIGGERS.map((t) => (
              <label key={String(t.id)} className="checkbox">
                <input
                  type="checkbox"
                  checked={triggers.includes(t.id)}
                  onChange={(e) => update({ retryOn: e.target.checked ? [...triggers, t.id] : triggers.filter((x) => x !== t.id) })}
                />
                {t.label}
              </label>
            ))}
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={policy.respectRetryAfter !== false} onChange={(e) => update({ respectRetryAfter: e.target.checked })} /> honour Retry-After headers
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}

/** JSON textarea that only commits when the text parses. */
export function JsonTextEditor({ value, onChange, placeholder, rows = 6, allowEmpty = true }: { value: unknown; onChange: (v: unknown) => void; placeholder?: string; rows?: number; allowEmpty?: boolean }) {
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const serialized = value === undefined ? '' : JSON.stringify(value, null, 2);
    let current: unknown = undefined;
    try {
      current = text.trim() ? JSON.parse(text) : undefined;
    } catch {
      return; // user is mid-edit
    }
    if (JSON.stringify(current) !== JSON.stringify(value)) setText(serialized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div>
      <textarea
        className="code"
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (!t.trim()) {
            if (allowEmpty) {
              setError(null);
              onChange(undefined);
            }
            return;
          }
          try {
            onChange(JSON.parse(t));
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      />
      {error ? <div className="problem error">Not applied — invalid JSON: {error}</div> : null}
    </div>
  );
}
