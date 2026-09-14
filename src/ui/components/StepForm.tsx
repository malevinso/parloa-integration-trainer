import type { AskStep, BranchStep, EndOutcome, EndStep, HttpStep, SayStep, SetStep, SlotName, Step } from '../../core/engine/types';
import type { HttpMethod } from '../../core/systems/types';
import { ErrorRouteEditor, JsonTextEditor, KeyValueEditor, RetryEditor, StepSelect } from './editors';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SLOTS: SlotName[] = ['phone', 'email', 'lastName', 'customerId', 'orderId', 'dateOfBirth', 'postalCode', 'accountType', 'orderChoice', 'customerChoice', 'confirmation', 'freeText'];
const OUTCOMES: EndOutcome[] = ['resolved', 'handover', 'blocked', 'abandoned'];

export interface StepFormProps {
  step: Step;
  steps: Step[];
  onChange: (step: Step) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}

export function StepForm({ step, steps, onChange, onDelete, onMove }: StepFormProps) {
  const others = steps.filter((s) => s.id !== step.id);
  const update = (patch: Partial<Step>) => onChange({ ...step, ...patch } as Step);
  const idx = steps.findIndex((s) => s.id === step.id);
  return (
    <div className="step-form">
      <div className="row between">
        <h3>
          <span className={`step-type ${step.type}`}>{step.type}</span>
          <span className="mono">{step.id}</span>
        </h3>
        <div className="row">
          <button className="small" disabled={idx === 0} onClick={() => onMove(-1)} title="Move up">
            ↑
          </button>
          <button className="small" disabled={idx === steps.length - 1} onClick={() => onMove(1)} title="Move down">
            ↓
          </button>
          <button className="small danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      <div className="inline-fields">
        <label className="field">
          <span>Step id</span>
          <input type="text" className="code" value={step.id} onChange={(e) => update({ id: e.target.value.replace(/\s+/g, '-') })} />
        </label>
        <label className="field">
          <span>Name</span>
          <input type="text" value={step.name ?? ''} onChange={(e) => update({ name: e.target.value || undefined })} />
        </label>
      </div>
      {step.description ? <div className="notice info small">{step.description}</div> : null}
      {step.type === 'http' ? <HttpForm step={step} steps={others} onChange={onChange} /> : null}
      {step.type === 'set' ? <SetForm step={step} steps={others} onChange={onChange} /> : null}
      {step.type === 'branch' ? <BranchForm step={step} steps={others} onChange={onChange} /> : null}
      {step.type === 'ask' ? <AskForm step={step} steps={others} onChange={onChange} /> : null}
      {step.type === 'say' ? <SayForm step={step} steps={others} onChange={onChange} /> : null}
      {step.type === 'end' ? <EndForm step={step} onChange={onChange} /> : null}
    </div>
  );
}

function NextField({ value, steps, onChange }: { value: string | undefined; steps: Step[]; onChange: (v: string | undefined) => void }) {
  return (
    <label className="field">
      <span>Next step</span>
      <StepSelect value={value} onChange={onChange} steps={steps} />
    </label>
  );
}

function HttpForm({ step, steps, onChange }: { step: HttpStep; steps: Step[]; onChange: (s: Step) => void }) {
  const req = step.request;
  const updateReq = (patch: Partial<HttpStep['request']>) => onChange({ ...step, request: { ...req, ...patch } });
  const expect = (step.expectStatus ?? []).join(', ');
  return (
    <div>
      <fieldset>
        <legend>Request</legend>
        <div className="inline-fields" style={{ gridTemplateColumns: '120px 1fr' }}>
          <label className="field">
            <span>Method</span>
            <select value={req.method} onChange={(e) => updateReq({ method: e.target.value as HttpMethod })}>
              {METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>URL (template)</span>
            <input type="text" className="code" value={req.url} onChange={(e) => updateReq({ url: e.target.value })} placeholder="{{env.CRM_BASE_URL}}/customers" />
          </label>
        </div>
        <div className="field-label">Query parameters (templates; empty values are omitted)</div>
        <KeyValueEditor value={req.query ?? {}} onChange={(query) => updateReq({ query })} keyPlaceholder="phone" valuePlaceholder="{{input.slots.phone}}" addLabel="query parameter" />
        <div className="field-label" style={{ marginTop: 8 }}>
          Headers (templates)
        </div>
        <KeyValueEditor value={req.headers ?? {}} onChange={(headers) => updateReq({ headers })} keyPlaceholder="Authorization" valuePlaceholder="Bearer {{env.CRM_TOKEN}}" addLabel="header" />
        <div className="field-label" style={{ marginTop: 8 }}>
          Body (JSON; string values are templates; a string starting with = is a JSONata expression)
        </div>
        <JsonTextEditor value={req.body} onChange={(body) => updateReq({ body })} placeholder='{ "customerId": "{{vars.customer.customerId}}" }' />
        <div className="inline-fields" style={{ marginTop: 8 }}>
          <label className="field">
            <span>Timeout (ms)</span>
            <input type="number" min={100} value={req.timeoutMs ?? ''} placeholder="5000" onChange={(e) => updateReq({ timeoutMs: e.target.value ? Number(e.target.value) : undefined })} />
          </label>
          <label className="field">
            <span>Expected statuses (comma separated; default 2xx)</span>
            <input
              type="text"
              className="code"
              value={expect}
              placeholder="200"
              onChange={(e) => {
                const list = e.target.value
                  .split(',')
                  .map((x) => Number(x.trim()))
                  .filter((n) => Number.isFinite(n) && n > 0);
                onChange({ ...step, expectStatus: list.length ? list : undefined });
              }}
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Response mapping (variable → JSONata over `response.status`, `response.headers`, `response.body`)</legend>
        <KeyValueEditor value={step.mapping ?? {}} onChange={(mapping) => onChange({ ...step, mapping })} keyPlaceholder="matches" valuePlaceholder="response.body.customers[]" addLabel="mapping" />
      </fieldset>
      <RetryEditor value={step.retry} onChange={(retry) => onChange({ ...step, retry })} />
      <ErrorRouteEditor
        title="On error"
        description="Taken when the status is unexpected, the body is malformed, the call times out after all retries, or a mapping fails."
        value={step.onError}
        onChange={(onError) => onChange({ ...step, onError })}
        steps={steps}
      />
      <NextField value={step.next} steps={steps} onChange={(next) => onChange({ ...step, next })} />
    </div>
  );
}

function SetForm({ step, steps, onChange }: { step: SetStep; steps: Step[]; onChange: (s: Step) => void }) {
  return (
    <div>
      <fieldset>
        <legend>Assignments (variable → JSONata; evaluated in order)</legend>
        <KeyValueEditor value={step.assign} onChange={(assign) => onChange({ ...step, assign })} keyPlaceholder="customer" valuePlaceholder="vars.matches[0]" addLabel="assignment" />
      </fieldset>
      <NextField value={step.next} steps={steps} onChange={(next) => onChange({ ...step, next })} />
    </div>
  );
}

function BranchForm({ step, steps, onChange }: { step: BranchStep; steps: Step[]; onChange: (s: Step) => void }) {
  const cases = step.cases;
  const setCases = (next: BranchStep['cases']) => onChange({ ...step, cases: next });
  return (
    <div>
      <fieldset>
        <legend>Cases (first truthy condition wins)</legend>
        <table className="kv-table">
          <thead>
            <tr>
              <th className="small muted" style={{ textAlign: 'left' }}>
                Label
              </th>
              <th className="small muted" style={{ textAlign: 'left' }}>
                When (JSONata)
              </th>
              <th className="small muted" style={{ textAlign: 'left' }}>
                Go to
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cases.map((c, i) => (
              <tr key={i}>
                <td style={{ width: '20%' }}>
                  <input type="text" value={c.label ?? ''} onChange={(e) => setCases(cases.map((x, j) => (j === i ? { ...x, label: e.target.value || undefined } : x)))} />
                </td>
                <td>
                  <input type="text" className="code" value={c.when} onChange={(e) => setCases(cases.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))} placeholder="vars.matchCount > 1" />
                </td>
                <td style={{ width: '28%' }}>
                  <StepSelect value={c.goto} onChange={(v) => setCases(cases.map((x, j) => (j === i ? { ...x, goto: v ?? '' } : x)))} steps={steps} allowNone={false} />
                </td>
                <td className="actions">
                  <button className="small" onClick={() => setCases(cases.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={4}>
                <button className="small" onClick={() => setCases([...cases, { when: 'true', goto: steps[0]?.id ?? '' }])}>
                  + case
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </fieldset>
      <label className="field">
        <span>Otherwise go to</span>
        <StepSelect value={step.otherwise} onChange={(otherwise) => onChange({ ...step, otherwise })} steps={steps} />
      </label>
    </div>
  );
}

function AskForm({ step, steps, onChange }: { step: AskStep; steps: Step[]; onChange: (s: Step) => void }) {
  const hasOptions = step.options !== undefined;
  return (
    <div>
      <label className="field">
        <span>Prompt (template)</span>
        <textarea value={step.prompt} onChange={(e) => onChange({ ...step, prompt: e.target.value })} />
      </label>
      <div className="inline-fields">
        <label className="field">
          <span>Slot (what you are asking for)</span>
          <select value={step.slot} onChange={(e) => onChange({ ...step, slot: e.target.value as SlotName })}>
            {SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Save answer as variable</span>
          <input type="text" className="code" value={step.saveAs} onChange={(e) => onChange({ ...step, saveAs: e.target.value })} />
        </label>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={Boolean(step.sensitive)} onChange={(e) => onChange({ ...step, sensitive: e.target.checked || undefined })} /> sensitive (redacted in traces, cannot be spoken back)
      </label>
      <fieldset>
        <legend>Options (offer choices built from a list)</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={hasOptions}
            onChange={(e) => onChange({ ...step, options: e.target.checked ? { items: 'vars.orders', label: '{{item.items[0].name}} (order {{item.orderId}})', value: 'item' } : undefined })}
          />{' '}
          offer options
        </label>
        {hasOptions ? (
          <div className="stack" style={{ marginTop: 8 }}>
            <label className="field">
              <span>Items (JSONata → array)</span>
              <input type="text" className="code" value={step.options!.items} onChange={(e) => onChange({ ...step, options: { ...step.options!, items: e.target.value } })} />
            </label>
            <label className="field">
              <span>Label per item (template; the item is `item`)</span>
              <input type="text" className="code" value={step.options!.label} onChange={(e) => onChange({ ...step, options: { ...step.options!, label: e.target.value } })} />
            </label>
            <label className="field">
              <span>Value per item (JSONata; default: the item itself)</span>
              <input type="text" className="code" value={step.options!.value ?? ''} onChange={(e) => onChange({ ...step, options: { ...step.options!, value: e.target.value || undefined } })} />
            </label>
          </div>
        ) : null}
      </fieldset>
      <ErrorRouteEditor title="On no match" description="Taken when the customer's answer matches none of the offered options." value={step.onNoMatch} onChange={(onNoMatch) => onChange({ ...step, onNoMatch })} steps={steps} />
      <NextField value={step.next} steps={steps} onChange={(next) => onChange({ ...step, next })} />
    </div>
  );
}

function SayForm({ step, steps, onChange }: { step: SayStep; steps: Step[]; onChange: (s: Step) => void }) {
  return (
    <div>
      <label className="field">
        <span>Text (template)</span>
        <textarea value={step.text} onChange={(e) => onChange({ ...step, text: e.target.value })} rows={4} />
      </label>
      <NextField value={step.next} steps={steps} onChange={(next) => onChange({ ...step, next })} />
    </div>
  );
}

function EndForm({ step, onChange }: { step: EndStep; onChange: (s: Step) => void }) {
  return (
    <div className="inline-fields">
      <label className="field">
        <span>Outcome</span>
        <select value={step.outcome} onChange={(e) => onChange({ ...step, outcome: e.target.value as EndOutcome })}>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Reason (optional)</span>
        <input type="text" value={step.reason ?? ''} onChange={(e) => onChange({ ...step, reason: e.target.value || undefined })} />
      </label>
    </div>
  );
}
