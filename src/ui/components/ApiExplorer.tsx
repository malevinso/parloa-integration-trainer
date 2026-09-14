import { useEffect, useState } from 'react';
import { systemDocs } from '../../core/systems/apiDocs';
import type { HttpMethod, VirtualResponse } from '../../core/systems/types';
import { useApp } from '../../state/AppContext';
import { JsonTextEditor, KeyValueEditor } from './editors';
import { JsonView } from './JsonView';

/**
 * Send ad-hoc requests to the in-browser practice systems (like curl against a
 * sandbox). Uses the shared systems instance so a token obtained here can be
 * reused in the next request.
 */
export function ApiExplorer() {
  const { systems, state, bumpSystems } = useApp();
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState(systemDocs[0].endpoints[0].sampleRequest.url);
  const [headers, setHeaders] = useState<Record<string, string>>(systemDocs[0].endpoints[0].sampleRequest.headers);
  const [body, setBody] = useState<unknown>(undefined);
  const [response, setResponse] = useState<VirtualResponse | null>(null);
  const [history, setHistory] = useState<Array<{ method: string; url: string; status: number }>>([]);
  const [session, setSession] = useState(1);

  useEffect(() => {
    // Per-run fault state (flaky / rate limit / quota) starts over when faults change.
    setSession((s) => s + 1);
  }, [state.settings.faults]);

  const send = () => {
    const res = systems.handle({ method, url, headers, body }, { runId: `explorer-${session}`, faults: state.settings.faults });
    setResponse(res);
    setHistory((h) => [{ method, url, status: res.status }, ...h].slice(0, 12));
    bumpSystems();
  };

  const loadSample = (value: string) => {
    const [sysId, idx] = value.split(':');
    const doc = systemDocs.find((d) => d.id === sysId);
    const ep = doc?.endpoints[Number(idx)];
    if (!ep) return;
    setMethod(ep.method);
    setUrl(ep.sampleRequest.url);
    setHeaders(ep.sampleRequest.headers);
    setBody(ep.sampleRequest.body);
    setResponse(null);
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <select onChange={(e) => loadSample(e.target.value)} defaultValue="">
          <option value="" disabled>
            Load a sample request…
          </option>
          {systemDocs.map((d) =>
            d.endpoints.map((ep, i) => (
              <option key={`${d.id}:${i}`} value={`${d.id}:${i}`}>
                {d.name}: {ep.method} {ep.path}
              </option>
            )),
          )}
        </select>
      </div>
      <div className="inline-fields" style={{ gridTemplateColumns: '110px 1fr' }}>
        <select value={method} onChange={(e) => setMethod(e.target.value as HttpMethod)}>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input type="text" className="code" value={url} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="field-label" style={{ marginTop: 8 }}>
        Headers
      </div>
      <KeyValueEditor value={headers} onChange={setHeaders} addLabel="header" />
      {method !== 'GET' ? (
        <>
          <div className="field-label" style={{ marginTop: 8 }}>
            Body (JSON)
          </div>
          <JsonTextEditor value={body} onChange={setBody} />
        </>
      ) : null}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={send}>
          Send request
        </button>
        <button className="small" title="Start a new 'run' for per-run faults such as flaky, rate_limit and the request quota" onClick={() => setSession((s) => s + 1)}>
          New run (reset per-run counters)
        </button>
        {Object.keys(state.settings.faults).length ? <span className="badge warning">fault injection active: {JSON.stringify(state.settings.faults)}</span> : null}
      </div>
      {response ? (
        <div style={{ marginTop: 12 }}>
          <div className="row">
            <span className={`status-pill ${response.status === 0 ? 's0' : `s${Math.floor(response.status / 100)}`}`}>{response.status === 0 ? 'timeout / no response' : response.status}</span>
            <span className="small muted">simulated latency {response.latencyMs} ms</span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Response headers
          </div>
          <JsonView value={response.headers} maxHeight={120} />
          <div className="small muted">Body</div>
          <JsonView value={response.rawBody !== undefined ? response.rawBody : response.body} />
        </div>
      ) : null}
      {history.length ? (
        <details className="plain" style={{ marginTop: 10 }}>
          <summary>Recent requests</summary>
          <ul className="small mono" style={{ paddingLeft: 18 }}>
            {history.map((h, i) => (
              <li key={i}>
                {h.method} {h.url} → {h.status}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
