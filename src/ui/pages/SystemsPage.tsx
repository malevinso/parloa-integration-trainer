import { useMemo, useState } from 'react';
import { faultDocs, systemDocs } from '../../core/systems/apiDocs';
import { ALL_SYSTEMS, SYSTEM_LABELS, virtualBaseUrls, type FaultMode, type SystemId } from '../../core/systems/types';
import { useApp } from '../../state/AppContext';
import { ApiExplorer } from '../components/ApiExplorer';
import { JsonView } from '../components/JsonView';

const FAULT_MODES: FaultMode[] = ['none', 'timeout', 'slow', 'unavailable', 'flaky', 'malformed', 'rate_limit'];

export function SystemsPage() {
  const { systems, systemsVersion, bumpSystems, state, updateSettings } = useApp();
  const [tab, setTab] = useState<'docs' | 'explorer' | 'data' | 'faults'>('docs');
  const [system, setSystem] = useState<SystemId>('crm');
  const snapshot = useMemo(() => systems.snapshot(), [systems, systemsVersion]);
  const doc = systemDocs.find((d) => d.id === system)!;

  return (
    <main className="page">
      <h1>Practice business systems</h1>
      <p className="muted">
        Four fictional systems run inside your browser (no server needed). They behave like real HTTP APIs: authentication, validation errors, empty
        results, protected resources, rate limits and injectable faults. The same code can be started as a real HTTP server with <code>npm run api</code>{' '}
        for curl or Postman.
      </p>
      <div className="callout sim">
        <div className="callout-title">This trainer's simulation</div>
        <p className="small">
          These APIs are invented for practice. They are not Parloa APIs and not any real CRM/OMS/carrier API. Their shapes are deliberately typical so
          that what you learn transfers.
        </p>
      </div>
      <div className="tabs">
        <button className={tab === 'docs' ? 'active' : ''} onClick={() => setTab('docs')}>
          API documentation
        </button>
        <button className={tab === 'explorer' ? 'active' : ''} onClick={() => setTab('explorer')}>
          API explorer
        </button>
        <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
          Fixture data
        </button>
        <button className={tab === 'faults' ? 'active' : ''} onClick={() => setTab('faults')}>
          Faults &amp; reset
        </button>
      </div>

      {tab === 'docs' ? (
        <div className="grid-2" style={{ gridTemplateColumns: '220px 1fr' }}>
          <div className="stack">
            {systemDocs.map((d) => (
              <button key={d.id} className={d.id === system ? 'primary' : ''} style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setSystem(d.id)}>
                {d.name}
              </button>
            ))}
          </div>
          <div>
            <div className="card">
              <h2>{doc.name}</h2>
              <p>{doc.purpose}</p>
              <table className="data">
                <tbody>
                  <tr>
                    <th>Base URL (in-browser)</th>
                    <td className="mono">
                      {virtualBaseUrls()[doc.baseUrlEnv]} → env <code>{doc.baseUrlEnv}</code>
                    </td>
                  </tr>
                  <tr>
                    <th>Authentication</th>
                    <td>
                      {doc.auth.scheme}: header <code>{doc.auth.header}</code> = <code>{doc.auth.value}</code> (env <code>{doc.auth.envVar}</code>)
                    </td>
                  </tr>
                  <tr>
                    <th>Typical latency</th>
                    <td>{doc.latencyMs} ms (simulated)</td>
                  </tr>
                </tbody>
              </table>
              <h4 style={{ marginTop: 12 }}>Behaviour notes</h4>
              <ul className="small">
                {doc.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
            {doc.endpoints.map((ep, i) => (
              <div key={i} className="card">
                <div className="sig">
                  <span className={`method ${ep.method}`}>{ep.method}</span>
                  {ep.path}
                </div>
                <p className="small" style={{ marginTop: 6 }}>
                  {ep.summary}
                </p>
                {ep.params?.length ? (
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>In</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ep.params.map((p) => (
                        <tr key={p.name}>
                          <td className="mono">
                            {p.name}
                            {p.required ? ' *' : ''}
                          </td>
                          <td>{p.where}</td>
                          <td>{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
                <div className="grid-2" style={{ marginTop: 10 }}>
                  <div>
                    <div className="small muted">Sample request</div>
                    <JsonView value={{ method: ep.method, url: ep.sampleRequest.url, headers: ep.sampleRequest.headers, ...(ep.sampleRequest.body !== undefined ? { body: ep.sampleRequest.body } : {}) }} maxHeight={260} />
                  </div>
                  <div>
                    <div className="small muted">Sample response ({ep.sampleResponse.status})</div>
                    <JsonView value={ep.sampleResponse.body} maxHeight={260} />
                  </div>
                </div>
                {ep.errors.length ? (
                  <table className="data" style={{ marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Error</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ep.errors.map((e, j) => (
                        <tr key={j}>
                          <td className="mono">{e.status}</td>
                          <td className="mono">{e.error}</td>
                          <td>{e.when}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'explorer' ? (
        <div className="card">
          <h2>API explorer</h2>
          <p className="small muted">
            Send requests to the in-browser systems exactly as your workflow would. Verify a customer here and reuse the token in an orders request to
            see the protection boundary for yourself. Fault injection settings apply.
          </p>
          <ApiExplorer />
        </div>
      ) : null}

      {tab === 'data' ? (
        <div className="stack">
          <div className="card">
            <h2>Customers</h2>
            <p className="small muted">Verification factors are not part of this view (or of any API response).</p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Id</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>City</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.customers.map((c) => (
                    <tr key={c.customerId}>
                      <td className="mono">{c.customerId}</td>
                      <td>
                        {c.firstName} {c.lastName}
                      </td>
                      <td className="mono">{c.phone}</td>
                      <td className="mono">{c.email}</td>
                      <td>{c.city}</td>
                      <td>
                        <span className={`badge ${c.status === 'ACTIVE' ? 'success' : 'warning'}`}>{c.status}</span>
                      </td>
                      <td>{c.accountType}</td>
                      <td className="small muted">{c.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Orders</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Placed</th>
                    <th>Items</th>
                    <th>Shipment</th>
                    <th>ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.orders.map((o) => (
                    <tr key={o.orderId}>
                      <td className="mono">{o.orderId}</td>
                      <td className="mono">{o.customerId}</td>
                      <td>
                        <span className="badge">{o.status}</span>
                      </td>
                      <td className="mono">{o.placedAt.slice(0, 10)}</td>
                      <td>{o.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</td>
                      <td className="mono">{o.shipment ? `${o.shipment.carrier} ${o.shipment.trackingNumber}` : '—'}</td>
                      <td className="mono">{o.estimatedDelivery ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Shipments</h2>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tracking</th>
                    <th>Carrier</th>
                    <th>Status</th>
                    <th>Last event</th>
                    <th>Exception</th>
                    <th>ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.shipments.map((s) => (
                    <tr key={s.trackingNumber}>
                      <td className="mono">{s.trackingNumber}</td>
                      <td>{s.carrier}</td>
                      <td>
                        <span className="badge">{s.status}</span>
                      </td>
                      <td>{s.events[s.events.length - 1]?.description}</td>
                      <td className="small">{s.exception?.description ?? '—'}</td>
                      <td className="mono">{s.estimatedDelivery ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Verification state</h2>
            <p className="small">
              Active tokens: {snapshot.activeTokens.length} · Locked customers: {snapshot.lockedCustomers.length ? snapshot.lockedCustomers.join(', ') : 'none'}
            </p>
          </div>
        </div>
      ) : null}

      {tab === 'faults' ? (
        <div className="grid-2">
          <div className="card">
            <h2>Fault injection (manual runs)</h2>
            <p className="small muted">
              Applies to the API explorer and the free simulator. Graded scenarios use their own fault settings so results stay comparable.
            </p>
            {ALL_SYSTEMS.map((id) => (
              <label key={id} className="field">
                <span>{SYSTEM_LABELS[id]}</span>
                <select
                  value={state.settings.faults[id] ?? 'none'}
                  onChange={(e) => {
                    const faults = { ...state.settings.faults };
                    if (e.target.value === 'none') delete faults[id];
                    else faults[id] = e.target.value as FaultMode;
                    updateSettings({ faults });
                  }}
                >
                  {FAULT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <table className="data">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Effect</th>
                </tr>
              </thead>
              <tbody>
                {faultDocs.map((f) => (
                  <tr key={f.mode}>
                    <td className="mono">{f.mode}</td>
                    <td>{f.effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Reset fixtures</h2>
            <p className="small">
              Restores all customers, orders and shipments, clears verification tokens, failed-attempt counters and locks, and empties the request log
              of the shared in-browser systems. Graded scenario runs always start from fresh fixtures automatically.
            </p>
            <button
              className="danger"
              onClick={() => {
                systems.reset();
                bumpSystems();
              }}
            >
              Reset all fixtures now
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
