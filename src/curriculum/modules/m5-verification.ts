import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m5: Module = {
  id: 'm5-verification',
  order: 5,
  title: 'Identity verification and authorization',
  subtitle: 'Locating a record is not proving identity. Make the boundary a property of the system, not of the prompt.',
  estimatedMinutes: 45,
  objective: `Implement knowledge-factor verification as a distinct step that yields a token, gate every protected call on that token, handle failure and lockout without disclosure, and keep the factors out of traces and replies.`,
  sections: [
    {
      heading: 'Three different questions',
      body: `
| Question | Answered by | Artifact |
|---|---|---|
| *Which* customer is the caller talking about? | Lookup (module 2) | a customer id — an unverified claim |
| *Is* the caller that customer? | Verification | a token bound to that customer id, with a short lifetime |
| *May* this application read those orders for that customer? | Authorization at the OMS | 200 with data, or 403 |

Conflating the first two is the classic customer-service data leak: "I found you, here are your orders." The fix is structural: protected APIs demand proof of verification, and the agent obtains that proof by asking the caller for something only the customer should know (or by other factors — SMS one-time codes, authenticated app sessions, voice biometrics — which this trainer does not simulate).

> [!PARLOA] Parloa lists authentication as a typical goal for a Subtask Agent ("authentication, order status, cancellation, FAQ, escalation to a human"), and the OpenAI story notes that "Tasks like authentication … can be separated into distinct sub-agents". Parloa's LLM Guardrails update makes the general point that "Safety instructions baked into an agent prompt don't ensure security". How verification is configured in AMP is not in the public material this trainer could read. Sources: [Parloa Labs](https://www.parloa.com/labs/insights/multi-agent-architecture-for-voice/), [OpenAI — Parloa](https://openai.com/index/parloa/), [Product updates](https://www.parloa.com/product-updates/).

> [!GENERAL] Whatever the platform: put the enforcement where the data is. If the agent, a bug, or a prompt-injected caller skips the step, the OMS still says 403.
`,
    },
    {
      heading: 'The verification protocol in this course',
      body: `
> [!SIM] The practice Verification Service holds the factors privately (date of birth and postal code) and never returns them. \`POST /verify\` with \`{ customerId, factors: { dateOfBirth, postalCode } }\` answers:
>
> - \`200 { verified: true, token: "vt_…", expiresAt }\` — a token bound to that \`customerId\`, valid 15 minutes;
> - \`200 { verified: false, reason: "FACTOR_MISMATCH", attemptsRemaining }\` — a *business* outcome, still HTTP 200;
> - \`423 { verified: false, reason: "LOCKED", lockedUntil }\` — after three failures;
> - \`400\`/\`404\` — malformed request or unknown customer.
>
> The OMS requires \`X-Verification-Token\`. A missing token → 403 \`VERIFICATION_REQUIRED\`; expired or unknown → 403 \`VERIFICATION_TOKEN_INVALID\`; a token for another customer → 403 \`VERIFICATION_TOKEN_MISMATCH\`.

Design consequences:

1. **Ask before you call.** Collect both factors with \`ask\` steps marked \`sensitive: true\`, then make *one* verification call with both.
2. **Branch on the body.** \`vars.verified = true\` routes to the protected calls; anything else routes to a blocked/handover path *before* any \`say\` that mentions orders.
3. **Carry the token with the customer id.** After a duplicate-record clarification, verify and query the *same* id — the mismatch error exists precisely to catch this.
4. **Do not retry a failed verification automatically.** Each attempt counts towards the lock; a retry policy on the verify step would burn the caller's attempts. Retry only transport failures.
5. **Tokens expire.** Long conversations may need re-verification; the 403 \`VERIFICATION_TOKEN_INVALID\` is the signal.
`,
    },
    {
      heading: 'Sensitive data: collect, use, never echo',
      body: `
The factors are secrets *for the purpose of this conversation*. Three rules:

- **Never echo them.** No "so your date of birth is …" confirmations, no factor values in error messages.
- **Never log them.** Traces and transcripts must show that a factor was provided, not what it was.
- **Never let them leak into unrelated variables or prompts.** Keep them in dedicated variables used only by the verification request.

> [!SIM] Marking an \`ask\` step \`sensitive: true\` makes the engine (a) show the customer's answer as "•••• (date of birth provided)" in the transcript, (b) redact the value everywhere in the trace including request bodies, and (c) refuse to speak it: a \`say\` template that interpolates a sensitive variable is rendered with \`[redacted]\` and a \`SENSITIVE_DISCLOSURE\` error is recorded. The issued token is redacted too (\`vt_[redacted]\`), like any credential in a good log.

> [!GENERAL] Equivalent controls in production: PII masking in transcripts and logs, secret-typed variables, and a review rule that customer-facing text never references authentication inputs.
`,
    },
  ],
  workedExample: {
    title: 'The verification gate',
    body: `
Two sensitive questions, one call, one branch:

\`\`\`json
{ "id": "ask-dob", "type": "ask", "prompt": "For security, could you confirm your date of birth?", "slot": "dateOfBirth", "saveAs": "dob", "sensitive": true }
{ "id": "ask-postal", "type": "ask", "prompt": "And the postal code on the account?", "slot": "postalCode", "saveAs": "postalCode", "sensitive": true }
{ "id": "verify", "type": "http",
  "request": { "method": "POST", "url": "{{env.VERIFY_BASE_URL}}/verify",
    "headers": { "Authorization": "Bearer {{env.VERIFY_TOKEN}}", "Content-Type": "application/json" },
    "body": { "customerId": "{{vars.customer.customerId}}", "factors": { "dateOfBirth": "{{vars.dob}}", "postalCode": "{{vars.postalCode}}" } } },
  "mapping": { "verified": "response.body.verified", "verificationToken": "response.body.token" },
  "onError": { "say": "I'm sorry, I'm not able to verify your identity right now. I'll connect you with a colleague.", "end": "handover" } }
{ "id": "route-verified", "type": "branch", "cases": [ { "when": "vars.verified = true", "goto": "get-orders" } ], "otherwise": "not-verified" }
{ "id": "not-verified", "type": "say", "text": "I'm sorry, I wasn't able to verify your identity with those details, so I can't share any order information.", "next": "end-blocked" }
{ "id": "end-blocked", "type": "end", "outcome": "blocked" }
\`\`\`

and the protected call carries the token:

\`\`\`json
"headers": { "X-Api-Key": "{{env.OMS_API_KEY}}", "X-Verification-Token": "{{vars.verificationToken}}" }
\`\`\`

In the Debug view the sequence reads: two \`ask\` events (redacted) → \`http_request\` to /verify with a redacted body → \`verification\` event → \`branch\` → \`protected_data\` (**DATA RELEASED**). In the failed scenario the same trace shows **NOT VERIFIED**, the *otherwise* route, and no OMS request at all.
`,
    workflowId: 'verification',
    scenarioId: 'verify-then-orders',
  },
  exercise: {
    title: 'Add the verification gate',
    instructions: `
The starter finds the customer and immediately calls the OMS — which answers 403 because there is no token.

1. Before \`get-orders\`, add two \`ask\` steps for the date of birth and the postal code (slots \`dateOfBirth\` and \`postalCode\`, both \`sensitive\`).
2. Add an \`http\` step that POSTs both factors to \`{{env.VERIFY_BASE_URL}}/verify\` for \`vars.customer.customerId\` and maps \`verified\` and \`verificationToken\`.
3. Add a \`branch\` that continues to \`get-orders\` only when \`vars.verified = true\`, otherwise says that identity could not be verified and ends as *blocked*.
4. Send \`X-Verification-Token: {{vars.verificationToken}}\` on the OMS request.

Run both scenarios: the happy path must release data; the failed verification must not.
`,
    starterWorkflowId: 'verification',
    scenarioIds: ['verify-then-orders', 'wismo-failed-verification'],
    completionCriteria: `Both scenarios pass: on the happy path the OMS accepts the token and never answers 403; on the failed verification the agent explains it cannot verify, never mentions any order, and ends blocked or handed over — with at most three verification attempts.`,
    hints: [
      'Add steps with the "+ Add step after selected" control; new steps are inserted after the selected one. The `pick-single` step currently jumps straight to `get-orders` (`next`); point it at your first `ask` step instead, or clear its `next` so the flow continues in order.',
      'The body is JSON; string values are templates: `{ "customerId": "{{vars.customer.customerId}}", "factors": { "dateOfBirth": "{{vars.dob}}", "postalCode": "{{vars.postalCode}}" } }`. Send `Content-Type: application/json`.',
      'Verification failure is HTTP 200 with `verified: false`, so it does not take the onError route: your branch has to check `vars.verified = true` and route everything else away from the orders step *before* any order-related say step.',
      'Do not put a retry policy on the verify step (each attempt counts towards a lock). Do give it an onError route for 5xx/timeouts.',
    ],
  },
  quiz: [
    {
      id: 'm5q1',
      question: 'Where should the rule "no order data without verification" be enforced?',
      choices: ['In the agent prompt', 'In the workflow branch only', 'In the protected system (or a façade in front of it), with the workflow honouring it', 'In the conversation transcript review'],
      answer: 2,
      explanation: 'Prompts and flows can be skipped or manipulated; the data owner must refuse. The flow still needs the gate so the caller gets a coherent conversation.',
    },
    {
      id: 'm5q2',
      question: 'After clarifying a duplicate, the agent verified CUST-1002 but queried orders for CUST-1003. What happens with the practice OMS?',
      choices: ['200 — the token proves the caller is a customer', '403 VERIFICATION_TOKEN_MISMATCH — the token is bound to one customer id', '401 — the API key is now invalid', '404 — the customer has no orders'],
      answer: 1,
      explanation: 'Tokens are bound to the verified customer. Keeping the id and the token together through the flow is part of the design.',
    },
    {
      id: 'm5q3',
      question: 'Why must the verify step NOT have a retry policy that retries on a `verified: false` outcome?',
      choices: ['Because retries are slow', 'Because each attempt counts towards a lockout and the answer will not change without new input from the caller', 'Because the token would expire', 'Because the service forbids POST retries'],
      answer: 1,
      explanation: 'Only transport failures deserve retries. A negative business outcome needs a different conversation step (re-ask, or handover), not a repeat of the same call.',
    },
  ],
  references: [R.subtaskAgents, R.openai, R.productUpdates, R.ampDocs],
};
