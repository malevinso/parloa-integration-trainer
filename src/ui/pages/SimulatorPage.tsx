import { useRef, useState } from 'react';
import { runWorkflow, type AskQuestion } from '../../core/engine/executor';
import { HttpTransport, VirtualTransport, type Transport } from '../../core/engine/transport';
import type { RunResult, TranscriptLine } from '../../core/engine/types';
import { InteractiveCustomer, ScriptedCustomer } from '../../core/simulator/customer';
import { personaList } from '../../core/simulator/personas';
import { PracticeSystems } from '../../core/systems/practiceSystems';
import { referenceWismoWorkflow } from '../../core/workflows/referenceSolution';
import { modules } from '../../curriculum/modules';
import { useApp } from '../../state/AppContext';
import { TraceView } from '../components/TraceView';
import { Transcript } from '../components/Transcript';

export function SimulatorPage() {
  const app = useApp();
  const sources = [
    ...modules.filter((m) => app.state.workflows[m.id]).map((m) => ({ id: m.id, label: `Module ${m.order}: ${m.title} (my draft)` })),
    { id: '__reference', label: 'Reference solution (complete "Where is my order?" flow)' },
  ];
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '__reference');
  const [mode, setMode] = useState<'persona' | 'manual'>('persona');
  const [personaId, setPersonaId] = useState(personaList[0].id);
  const [opening, setOpening] = useState("Hi, where is my order? My phone number is 602-555-0101.");
  const [phone, setPhone] = useState('602-555-0101');
  const [email, setEmail] = useState('');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [question, setQuestion] = useState<AskQuestion | null>(null);
  const [reply, setReply] = useState('');
  const [run, setRun] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const customerRef = useRef<InteractiveCustomer | null>(null);

  const getWorkflow = () => (sourceId === '__reference' ? referenceWismoWorkflow() : app.getWorkflow(sourceId));

  const start = async () => {
    const workflow = getWorkflow();
    const systems = new PracticeSystems();
    const transport: Transport =
      app.state.settings.transport === 'http' ? new HttpTransport() : new VirtualTransport(systems, { faults: app.state.settings.faults, speed: app.state.settings.speed });
    let customer;
    if (mode === 'persona') {
      customer = new ScriptedCustomer(personaList.find((p) => p.id === personaId)!);
    } else {
      const slots: Record<string, string> = {};
      if (phone.trim()) slots.phone = phone.trim();
      if (email.trim()) slots.email = email.trim();
      const interactive = new InteractiveCustomer(opening, slots);
      interactive.onQuestion = (q) => setQuestion(q);
      customerRef.current = interactive;
      customer = interactive;
    }
    setRun(null);
    setTranscript([]);
    setQuestion(null);
    setRunning(true);
    try {
      const result = await runWorkflow(workflow, {
        transport,
        customer,
        secretValues: systems.secretValues(),
        onEvent: (_e, t) => setTranscript([...t]),
        onTranscript: (t) => setTranscript([...t]),
      });
      setRun(result);
      setTranscript(result.transcript);
    } finally {
      setRunning(false);
      setQuestion(null);
      customerRef.current = null;
    }
  };

  const answer = (text: string, optionIndex: number | null = null) => {
    customerRef.current?.reply(text, optionIndex);
    setQuestion(null);
    setReply('');
  };

  return (
    <main className="page">
      <h1>Conversation simulator</h1>
      <p className="muted">
        Run any workflow against a scripted caller, or play the customer yourself. The simulator is deterministic: scripted callers answer by the kind of
        question asked (slot) and pick options by label. No language model is involved.
      </p>
      <div className="lab-grid">
        <div>
          <div className="card">
            <h3>Set-up</h3>
            <label className="field">
              <span>Workflow</span>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="row" style={{ marginBottom: 8 }}>
              <label className="checkbox">
                <input type="radio" checked={mode === 'persona'} onChange={() => setMode('persona')} /> scripted caller
              </label>
              <label className="checkbox">
                <input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} /> I play the customer
              </label>
            </div>
            {mode === 'persona' ? (
              <>
                <label className="field">
                  <span>Caller</span>
                  <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                    {personaList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="small muted">{personaList.find((p) => p.id === personaId)?.description}</p>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Opening message</span>
                  <textarea value={opening} onChange={(e) => setOpening(e.target.value)} rows={2} />
                </label>
                <div className="inline-fields">
                  <label className="field">
                    <span>Phone slot (input.slots.phone)</span>
                    <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Email slot (input.slots.email)</span>
                    <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                </div>
                <p className="small muted">
                  Try a known caller (see Practice systems → Fixture data) and answer the verification questions as they would — or answer wrongly to see the
                  boundary hold.
                </p>
              </>
            )}
            <div className="row">
              <button className="primary" disabled={running} onClick={start}>
                {running ? 'Running…' : 'Start conversation'}
              </button>
              <span className="small muted">
                transport: {app.state.settings.transport}
                {Object.keys(app.state.settings.faults).length ? ` · faults: ${JSON.stringify(app.state.settings.faults)}` : ''}
              </span>
            </div>
          </div>
          <div className="card">
            <h3>Conversation</h3>
            <Transcript lines={transcript} emptyText="Start a conversation to see it here." />
            {question ? (
              <div className="card flat" style={{ marginTop: 10 }}>
                <div className="small muted">
                  The agent asked for <strong>{question.slot}</strong>
                  {question.sensitive ? ' (sensitive — your answer will be masked)' : ''}: <em>"{question.prompt}"</em>
                </div>
                {question.options?.length ? (
                  <div className="row" style={{ marginTop: 6 }}>
                    {question.options.map((o, i) => (
                      <button key={i} className="small" onClick={() => answer(o.label, i)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="row" style={{ marginTop: 6 }}>
                  <input
                    type="text"
                    value={reply}
                    placeholder="Type the customer's reply"
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && reply.trim()) answer(reply.trim());
                    }}
                    style={{ flex: 1 }}
                  />
                  <button className="primary small" disabled={!reply.trim()} onClick={() => answer(reply.trim())}>
                    Reply
                  </button>
                </div>
              </div>
            ) : null}
            {run ? (
              <div className="row" style={{ marginTop: 10 }}>
                <span className="badge primary">outcome: {run.outcome}</span>
                <span className={`badge ${run.verification.verified ? 'success' : 'warning'}`}>{run.verification.verified ? 'verified' : 'not verified'}</span>
                {run.fatalError ? <span className="badge danger">{run.fatalError.code}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="card">
          <h3>Execution trace</h3>
          <TraceView run={run} />
        </div>
      </div>
    </main>
  );
}
