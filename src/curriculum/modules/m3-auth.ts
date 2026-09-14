import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m3: Module = {
  id: 'm3-auth',
  order: 3,
  title: 'API authentication, request construction, response inspection',
  subtitle: 'Four systems, four credential conventions — and how to read what comes back.',
  estimatedMinutes: 35,
  objective: `Configure requests correctly for each practice system (scheme, header, environment variable), build URLs, query strings, headers and JSON bodies from templates, and read status codes, headers and bodies the way the engine and the grader do.`,
  sections: [
    {
      heading: 'Two kinds of credentials, two kinds of failure',
      body: `
Every call in this course carries an *application credential* — it identifies the calling system (the agent platform or your middleware) to the API. Two conventions cover most enterprise APIs:

| Convention | Header | Practice systems |
|---|---|---|
| Bearer token (OAuth-style or static) | \`Authorization: Bearer <token>\` | Customer Master, Verification Service |
| API key | \`X-Api-Key: <key>\` (name varies by vendor) | Order Management, Carrier |

A **401 Unauthorized** means the *application* credential was missing or wrong (the practice systems also send \`WWW-Authenticate\` for bearer schemes). A **403 Forbidden** means the credential was fine but *this request* is not allowed — in this course, because the *caller* has not been verified (module 5). Keep the two apart when you debug: 401 → fix the header; 403 → fix the flow.

> [!GENERAL] Application credentials never belong in prompts, in conversation variables, or in step definitions copied around by hand. Reference them from environment configuration so that staging and production differ only by configuration.

> [!PARLOA] Parloa's February 2026 release describes Agent Composition with environment variables used to "customize greetings, compliance notices, or regional nuances" per deployment, and the platform page lists "Versioning" and switching "between staging and production" as part of testing. Whether and how backend credentials are stored for MCP/Agent Skills is not described in the public material this trainer could read — consult the [AMP documentation](https://docs.amp.parloa.com/) for that. Sources: [Release blog](https://www.parloa.com/blog/parloa_product_release_2026/), [Test](https://www.parloa.com/platform/test/).

> [!SIM] Here, credentials live in the workflow's \`env\` block and are referenced as \`{{env.CRM_TOKEN}}\`. The sandbox values are public (see Practice systems), so putting them in an exported JSON is harmless — but the habit is what matters.
`,
    },
    {
      heading: 'Building the request',
      body: `
An \`http\` step renders four things from templates before sending:

- **URL** — \`{{env.ORDERS_BASE_URL}}/orders\` or a path parameter \`{{env.CARRIER_BASE_URL}}/shipments/{{vars.selectedOrder.shipment.trackingNumber}}\`. The engine URL-encodes query parameters for you but *not* path segments, so keep path values simple.
- **Query** — a map of templates; empty values are dropped, which lets you offer several optional identifiers.
- **Headers** — templates too. Header names are case-insensitive on the wire; the practice systems accept any casing.
- **Body** — JSON. Every string leaf is a template; a string beginning with \`=\` is evaluated as JSONata so that you can send numbers, booleans or whole objects (\`"factors": "=vars.factors"\`). Send \`Content-Type: application/json\` with a JSON body.

Timeouts are part of the request: \`timeoutMs\` defaults to 5000 here. Module 7 shows why the carrier step wants something shorter.

> [!MULE] This is the HTTP Request operation with its URI parameters, query parameters, headers and body, plus the response validator: the \`expectStatus\` list plays the role of "success status code validator" (default 200–299).
`,
    },
    {
      heading: 'Reading the response',
      body: `
Three things to inspect, in this order:

1. **Status class.** 2xx success; 4xx *your* request is wrong or not allowed (do not retry blindly); 5xx *their* problem (retry with limits); no response at all is a timeout or network error (module 7).
2. **Headers.** \`Retry-After\` on 429/503, \`WWW-Authenticate\` on 401, \`Content-Type\` before you trust the body.
3. **Body.** Only then map fields. Beware "200 but false": the verification service answers 200 with \`verified: false\` — a successful *call* with a negative *business* result. The mapping and the branch must look at the body, not just the status.

> [!SIM] The engine treats any status outside \`expectStatus\` (default 2xx), any timeout, any unparsable body and any failed mapping as an *error* and takes the step's \`onError\` route. The Debug view shows \`http_response\` events with an *unexpected status* or *malformed body* badge, followed by an \`error\` event with the code (\`HTTP_401\`, \`HTTP_403\`, \`TIMEOUT\`, \`MALFORMED_RESPONSE\`, \`MAPPING_ERROR\`) and an explanation.
`,
    },
  ],
  workedExample: {
    title: 'Diagnosing a 401 from the trace',
    body: `
Suppose the carrier step is configured with \`"X-Api-Key": "{{env.CARRIER_KEY}}"\` but the env block defines \`CARRIER_API_KEY\`. The trace shows:

\`\`\`text
http_request   GET https://carrier.practice.local/track/v1/shipments/SP-7781-2201
               headers: { "X-Api-Key": "" }          ← template rendered to empty; header dropped
http_response  401  { "error": "UNAUTHORIZED", "message": "Missing or invalid X-Api-Key header for the carrier API." }
error          HTTP_401 — carrier rejected the credentials. Check the X-Api-Key header on step "track" and the env variable it references.
\`\`\`

Reading it top-down: the rendered header value is empty, so the template referenced a variable that does not exist. Fix the reference (\`{{env.CARRIER_API_KEY}}\`), not the env.

Two more patterns you will meet in the exercise: a **missing** \`Authorization\` header on the CRM (401 with \`WWW-Authenticate: Bearer\`), and the **wrong scheme** on the OMS (\`Authorization: Bearer <api key>\` instead of \`X-Api-Key\`, also 401 — the OMS does not read Authorization at all).
`,
    workflowId: 'auth',
    scenarioId: 'auth-crm-and-oms',
  },
  exercise: {
    title: 'Fix three credential defects',
    instructions: `
The starter is the complete flow with three deliberate defects. Run the scenario **Authentication: every system accepts the credentials** and use the Debug view to find each 401:

1. One step sends no credential at all.
2. One step uses the wrong scheme for its system.
3. One step references an environment variable that does not exist.

Fix them in the step forms (Request → Headers) without changing the env block. Re-run until no system answers 401 and verification succeeds.
`,
    starterWorkflowId: 'auth',
    scenarioIds: ['auth-crm-and-oms'],
    completionCriteria: `The scenario passes: no 401 from any system, all four systems were called, and the caller was verified. The env block is unchanged.`,
    hints: [
      'Open the Debug view and expand each `http_request`: the rendered headers show exactly what was sent. An empty header value means the template referenced a missing variable.',
      'The Practice systems page lists the credential header for each system: CRM and verification use `Authorization: Bearer …`, OMS and carrier use `X-Api-Key`.',
      'Environment variables available by default: CRM_BASE_URL, VERIFY_BASE_URL, ORDERS_BASE_URL, CARRIER_BASE_URL, CRM_TOKEN, VERIFY_TOKEN, OMS_API_KEY, CARRIER_API_KEY (see the Environment tab).',
    ],
  },
  quiz: [
    {
      id: 'm3q1',
      question: 'The OMS answers 403 VERIFICATION_REQUIRED although X-Api-Key is correct. What is wrong?',
      choices: ['The API key has expired', 'The request lacks a valid verification token for this customer — a flow problem, not a credential problem', 'The bearer token is missing', 'The customerId query parameter is malformed'],
      answer: 1,
      explanation: '401 is about the application credential; 403 here is the verification boundary. Fix the sequence: verify first, then send the token in X-Verification-Token.',
    },
    {
      id: 'm3q2',
      question: 'Which response should NOT be retried automatically?',
      choices: ['503 with Retry-After', '401 Unauthorized', 'A timeout on an idempotent GET', '429 Too Many Requests'],
      answer: 1,
      explanation: 'A 401 will not fix itself — the credential is wrong or missing. Retrying wastes the caller\'s time; route to a handover or fix the configuration.',
    },
    {
      id: 'm3q3',
      question: 'The verification service returns HTTP 200 with `verified: false`. In this trainer, which of these is true?',
      choices: ['The step takes its onError route because verification failed', 'The step succeeds; your branch must inspect vars mapped from the body', 'The engine automatically ends the conversation as blocked', 'The token in the body is still usable'],
      answer: 1,
      explanation: '200 is an expected status, so mapping runs and the flow continues. Deciding what a negative business result means is your branch\'s job.',
    },
  ],
  references: [R.release2026, R.test, R.muleHttp, R.ampDocs],
};
