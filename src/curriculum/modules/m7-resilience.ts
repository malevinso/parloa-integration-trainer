import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m7: Module = {
  id: 'm7-resilience',
  order: 7,
  title: 'Failure handling: empty results, bad payloads, timeouts, rate limits, retries',
  subtitle: 'A taxonomy of what goes wrong, bounded retries, and graceful degradation the caller can live with.',
  estimatedMinutes: 50,
  objective: `Classify failures correctly (business outcome vs protocol error vs transport failure), configure timeouts and bounded retry policies with backoff that honour Retry-After, route every failure to an explicit onError path, and degrade gracefully so the conversation still ends well.`,
  sections: [
    {
      heading: 'A taxonomy, because the responses are not alike',
      body: `
| What happened | Looks like | Is it an error? | Retry? | The caller should hear |
|---|---|---|---|---|
| No customer / no orders | 200, \`count: 0\` | **No** — business outcome | no | the fact, politely |
| Verification mismatch | 200, \`verified: false\` | **No** — business outcome | no (counts towards lockout) | that identity could not be verified |
| Bad request | 400 | yes — *your* bug | no | nothing technical; handover |
| Wrong credentials | 401 | yes — configuration | no | nothing technical; handover |
| Not verified / wrong customer | 403 | yes — flow bug | no | nothing technical |
| Not found | 404 | depends — often a wrong id | no | "I can't find that" |
| Locked | 423 | business outcome | no | that too many attempts were made |
| Rate limited | 429 + \`Retry-After\` | yes — transient | **bounded**, after the header's delay | nothing, unless it persists |
| Unavailable | 503 + \`Retry-After\` | yes — transient | bounded | nothing, unless it persists |
| Malformed body | 200 with unparsable JSON, or HTML | yes — treat like 5xx | bounded, if idempotent | nothing |
| Timeout / no response | nothing within \`timeoutMs\` | yes — transient or overloaded | bounded, if idempotent | nothing, unless it persists |

> [!GENERAL] The first two rows are the ones teams get wrong most often: an empty result is not a failure and must not take the error path, and a negative verification is not a transport problem and must not be retried.
`,
    },
    {
      heading: 'Retry policy: bounded, backed-off, idempotent',
      body: `
A retry policy has four parts, and each has a wrong default:

1. **What to retry on.** Transient signals only: 503, 429, timeouts, network errors, malformed bodies. Never 4xx (except 429) — the request will not get better.
2. **How many times.** Two to four attempts total. Every attempt is time the caller waits; \`maxAttempts: 8\` on a 5-second timeout is a 40-second silence.
3. **How long to wait.** Backoff (fixed or exponential) and, when present, the server's \`Retry-After\` — the server knows better than your default.
4. **Whether it is safe.** GETs are idempotent; POST /verify is not harmless (attempts are counted); a POST that creates a ticket may duplicate. Retry only what is safe, or use idempotency keys.

The timeout is the other half: a call must give up well within the conversational budget. Round trip budgets of 2–5 seconds per call are typical for voice; the practice carrier normally answers in ~0.4 s, so 3000 ms is generous and still fails fast when it hangs.

> [!MULE] The Until-Successful scope and the HTTP requester's response timeout play these roles; the difference is that the "caller" here is a person listening to silence.

> [!SIM] \`retry: { maxAttempts, backoffMs, backoff: "fixed" | "exponential", retryOn: [503, 429, "timeout", "network", "malformed"], respectRetryAfter: true }\`. The engine records a \`retry\` event with the wait it applied — the larger of your backoff and \`Retry-After\`. Waits are simulated (the run reports "ms simulated"), so experiments are cheap.

> [!PARLOA] Parloa says of Agent Skills that "Every execution chain is auditable, retryable" ([Agent Skills](https://www.parloa.com/blog/agent-skills-accelerate-compliant-agent-deployment/)). The public material does not specify retry parameters; check the [AMP docs](https://docs.amp.parloa.com/) for what is configurable.
`,
    },
    {
      heading: 'Error routes and graceful degradation',
      body: `
An \`onError\` route turns a failure into a *conversation decision*:

- \`say\` — what the caller hears; never the raw error.
- \`setVars\` — record \`error.code\` for later steps or analytics.
- \`goto\` — continue somewhere useful (e.g. skip tracking, still explain the order).
- \`end\` — handover or blocked when nothing useful remains.

Degradation is a design choice per step. Lookup failing → nothing to work with → handover. OMS failing → no order data → apologise and hand over. Carrier failing → *the OMS already told you the status and ETA* → say that, note that live tracking is unavailable, end resolved. The last one is the difference between a good and a mediocre agent, and it costs one \`onError\` block.

> [!WARNING] Without an \`onError\` route, a failure aborts the run: the engine records the error with an explanation and the conversation ends *abandoned*. The validator warns about every \`http\` step that lacks one.

> [!GENERAL] Two related patterns worth knowing: a *circuit breaker* (stop calling a system that keeps failing, for a while) and a *bulkhead* (a slow carrier must not consume the capacity you need for verification). Both belong in middleware rather than per conversation; the trainer does not simulate them.
`,
    },
  ],
  workedExample: {
    title: 'A carrier step that survives an outage',
    body: `
\`\`\`json
{ "id": "track", "type": "http",
  "request": { "method": "GET", "url": "{{env.CARRIER_BASE_URL}}/shipments/{{vars.selectedOrder.shipment.trackingNumber}}",
               "headers": { "X-Api-Key": "{{env.CARRIER_API_KEY}}" }, "timeoutMs": 3000 },
  "retry": { "maxAttempts": 2, "backoffMs": 500, "backoff": "exponential", "retryOn": [503, 429, "timeout"] },
  "mapping": { "tracking": "response.body", "lastEvent": "response.body.lastEvent.description", "eta": "response.body.estimatedDelivery" },
  "onError": {
    "say": "Your order {{vars.selectedOrder.orderId}} ({{vars.selectedOrder.items[0].name}}) has shipped with {{vars.selectedOrder.shipment.carrier}} and is estimated to arrive on {{vars.selectedOrder.estimatedDelivery}}. Live tracking is temporarily unavailable, so I can't see the latest scan right now.",
    "goto": "end-resolved" } }
\`\`\`

Against the *timeout* fault the trace shows: request → \`http_error timeout\` (3000 ms) → \`retry\` (wait 500 ms) → request → \`http_error timeout\` → \`error TIMEOUT\` routed to the onError → the degraded \`say\` → end resolved. Total simulated wait: 6.5 s, and the caller still got an answer.

Against the *flaky* fault (first call 503 with \`Retry-After: 2\`): request → 503 → \`retry\` waits 2000 ms (Retry-After outranks the 500 ms backoff) → 200 → normal reply.
`,
    workflowId: 'resilience',
    scenarioId: 'wismo-carrier-timeout',
  },
  exercise: {
    title: 'Make the flow survive four kinds of trouble',
    instructions: `
The starter is the complete happy-path flow with every timeout, retry policy and onError route removed.

1. Give the carrier step a short timeout, a bounded retry policy, and an onError route that still tells the caller the status and ETA known from the OMS.
2. Give the OMS step an onError route that apologises and hands over (a malformed body must not crash the run).
3. Give the CRM lookup a bounded retry and an onError route. Keep CRM calls to a minimum — the rate-limit scenario allows one per run.
4. Give the verify step an onError route for transport failures — but no retry on a negative result.

Run all four scenarios.
`,
    starterWorkflowId: 'resilience',
    scenarioIds: ['wismo-carrier-timeout', 'resilience-flaky-carrier', 'resilience-oms-malformed', 'resilience-crm-rate-limit'],
    completionCriteria: `All four scenarios pass: the carrier outage is retried at most a few times and degraded gracefully; the flaky carrier is recovered by retrying; the malformed OMS body leads to an apology and a clean end; the rate-limited CRM does not derail the conversation — with no raw errors spoken and no unhandled errors.`,
    hints: [
      'Open the carrier step → Retry policy: 2–3 attempts, exponential backoff, retry on 503/429/timeout. Set Timeout (ms) to about 3000. The grader allows at most 4 carrier attempts in the outage scenario.',
      'The onError "say" text is a template: you can use `vars.selectedOrder.status`, `.estimatedDelivery` and `.shipment.carrier` because the OMS step already ran. Then `goto` an end step with outcome resolved.',
      'A malformed body is reported as MALFORMED_RESPONSE and takes the onError route of the OMS step — add one with a say + end: handover. Do not put "malformed" in retryOn for this exercise unless you also cap attempts (the fault is permanent for the run).',
      'The rate-limit scenario permits exactly one CRM request per run: if your flow re-queries the CRM (e.g. a detail lookup), the second call gets 429. Either avoid the extra call or handle 429 with a bounded retry and a graceful onError.',
    ],
  },
  quiz: [
    {
      id: 'm7q1',
      question: 'A 503 arrives with `Retry-After: 2` and your policy says backoffMs 500. How long should the wait before the next attempt be?',
      choices: ['500 ms', '2000 ms — the server\'s hint outranks the default', '2500 ms', 'No wait; retry immediately'],
      answer: 1,
      explanation: 'When present, Retry-After expresses what the server can handle; honouring it is both polite and effective. The engine applies the larger of the two.',
    },
    {
      id: 'm7q2',
      question: 'Which of these should take a step\'s onError route?',
      choices: ['OMS answers 200 with an empty orders list', 'Verification answers 200 with verified: false', 'OMS answers 200 with a truncated JSON body', 'Carrier answers 200 with status DELIVERED'],
      answer: 2,
      explanation: 'A body that cannot be parsed is a protocol failure (MALFORMED_RESPONSE). Empty results and negative business outcomes are successful responses to be handled by branches.',
    },
    {
      id: 'm7q3',
      question: 'Why is `maxAttempts: 8` with a 5-second timeout a bad idea for a voice agent?',
      choices: ['The practice systems forbid it', 'It can leave the caller in up to ~40 seconds of silence before any response', 'Exponential backoff overflows', 'Because 8 is not a power of two'],
      answer: 1,
      explanation: 'Every attempt is time the caller waits. Bound attempts, keep timeouts short, and degrade gracefully instead.',
    },
  ],
  references: [R.retryPatterns, R.agentSkills, R.muleHttp, R.ampDocs],
};
