import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m1: Module = {
  id: 'm1-architecture',
  order: 1,
  title: 'Architecture: how a conversational agent integrates',
  subtitle: 'Where integration logic lives, what one turn looks like, and the verified Parloa vocabulary for it.',
  estimatedMinutes: 35,
  objective: `Understand the shape of an agent-to-backend integration well enough to place each responsibility (lookup, verification, retrieval, clarification, error handling) in the right layer, and learn which Parloa concepts are documented for each — before touching any configuration.`,
  sections: [
    {
      heading: 'The agent is a new kind of API client',
      body: `
From an integration architect's point of view a conversational agent is just another consumer of your APIs — with four unusual properties:

- **It works with partial information.** A caller says "where is my order?" without an order number. The integration has to *discover* identifiers (phone, e-mail) and *ask* for what is missing.
- **It has a conversational latency budget.** Every backend call happens while a person waits on the line. A 30-second timeout that is fine for a batch job is a dropped call here.
- **It must not leak.** The caller has not proven who they are just because a record matched. Anything the agent *says* is disclosure.
- **It has to degrade gracefully.** A carrier API outage should not end the conversation; the agent still knows the order shipped.

> [!GENERAL] These properties are independent of the platform. They shape every later module: identifiers and clarification (2, 6), authentication (3), mapping (4), verification as an enforced boundary (5), and failure handling (7).

> [!MULE] In MuleSoft terms the agent platform plays the role of the *experience layer* and you still decide whether process/system-layer logic lives in the agent's tool configuration, in a Mule API the agent calls, or split between them. The trade-offs you already know (reuse, ownership, testability, latency) apply unchanged.
`,
    },
    {
      heading: 'Where the integration logic can live',
      body: `
There are three places to put the "find customer → verify → get orders → track" chain:

| Placement | Pros | Cons |
|---|---|---|
| Inside the agent platform (tool/skill configuration) | Fast to change by the conversation team; the agent sees each result and can react conversationally | Business logic spread across agents; limited transformation/testing tooling compared with an iPaaS |
| In middleware you own (Mule, an API gateway, a BFF) exposing one *conversation-friendly* API | Single, testable façade; hides four systems behind one call; enforces verification centrally | Another component to run; the agent loses fine-grained visibility unless the façade returns rich status codes |
| Hybrid: the agent calls a few coarse-grained APIs, each of which orchestrates the rest | Balances agility and control | Requires clear contracts for partial results and errors |

> [!PARLOA] Parloa positions its integration layer as configurable by business teams: its June 2026 update says "Parloa's MCP Skills replace brittle API integrations with a native tool layer that business teams configure directly - no code or middleware needed", and the Agent Skills post describes configuring "full integration chains directly in Parloa without code or middleware", each chain being "auditable, retryable, and owned entirely by a business team, not buried in model behavior." Parloa also lists REST APIs and CCaaS/CRM/ERP integrations (Salesforce, ServiceNow, SAP, Microsoft Dynamics, Genesys, Twilio and others) on its integrations page. Sources: [Product updates](https://www.parloa.com/product-updates/), [Agent Skills](https://www.parloa.com/blog/agent-skills-accelerate-compliant-agent-deployment/), [Integrations](https://www.parloa.com/platform/integrations/).

> [!GENERAL] "No middleware needed" is a statement about *possibility*, not a design rule. Decide per capability: identity verification is a good candidate for a centrally enforced service (module 5), while "read the latest tracking event" can sit close to the agent.
`,
    },
    {
      heading: 'Anatomy of one conversational turn',
      body: `
A turn starts with the customer's utterance and ends with the agent's reply. In between, the platform decides what to do — answer, look something up, or call a tool — possibly several times.

> [!PARLOA] The OpenAI customer story describes Parloa's runtime as prompting a model "with the agent configuration and conversation context to generate a response, retrieve information through RAG, or trigger tools", and using "structured API chains and event-based logic to ensure critical steps happen in the right order". Parloa's Subtask Agents post adds deterministic building blocks: *Activation Restrictions* ("boolean conditions over named variables" that "are code. They are not interpreted by a language model"), *Storage Variables* ("the conversation's state") and *Hooks* ("deterministic execution that happens outside the conversation turn loop"). Sources: [OpenAI — Parloa](https://openai.com/index/parloa/), [Parloa Labs — Subtask Agents](https://www.parloa.com/labs/insights/multi-agent-architecture-for-voice/).

The important architectural point: the *sequence* of backend calls and the *conditions* between them should be deterministic and inspectable, while the language model handles phrasing and understanding. Everything you will configure in this course is on the deterministic side.

> [!SIM] This trainer removes the language model entirely. The customer is a scripted persona, the agent is an ordered list of steps (\`http\`, \`set\`, \`branch\`, \`ask\`, \`say\`, \`end\`), conditions and mappings are JSONata expressions, and every run produces a full trace. That is a simplification of a real agent platform, chosen so that runs are repeatable and gradable. It is not Parloa's configuration format.
`,
    },
    {
      heading: 'The reference flow: "Where is my order?"',
      body: `
Four practice systems stand in for a typical enterprise landscape:

| System | Role | Auth | Protected? |
|---|---|---|---|
| Customer Master (CRM) | find the caller's record(s) | Bearer token | no (but masks contact details) |
| Identity Verification | check knowledge factors, issue a token | Bearer token | issues the protection |
| Order Management (OMS) | orders and shipment references | API key **and** verification token | **yes — 403 without a valid token for that customer** |
| Carrier Tracking | shipment events and ETA | API key | no, but slow and unreliable |

The happy path is: lookup → (clarify if several matches) → ask two factors → verify → get orders → (clarify if several) → track → explain. Six things can go differently, and the capstone grades all of them: several customer matches, failed verification, several orders, no customer, no orders, and a carrier outage.

> [!GENERAL] Notice that the verification boundary is a property of the *OMS*, not of the agent. If the agent forgets to verify, the OMS still refuses. Prompt instructions are a UX layer, not a security control — a principle Parloa itself states for guardrails ("Safety instructions baked into an agent prompt don't ensure security", [Product updates](https://www.parloa.com/product-updates/)).
`,
    },
  ],
  workedExample: {
    title: 'Run the complete flow and read its trace',
    body: `
Load the complete example into the lab workspace, select the scenario **One customer, verified, one order** and press *Run this scenario*. Then open the **Debug view** and find, in order:

1. The \`http_request\` to the CRM with the phone number as a query parameter and the bearer token header, and its 200 response with \`count: 1\`.
2. The \`mapping\` table showing \`matches\` and \`matchCount\` being set from \`response.body\`.
3. The \`branch\` evaluation: both conditions false, so the flow continues to \`pick-single\`.
4. Two \`ask\` events marked *sensitive · redacted* — the caller's date of birth and postal code never appear in the trace.
5. The \`verification\` event (**VERIFIED**) and the token being redacted to \`vt_[redacted]\` in the mapping.
6. The \`protected_data\` event (**DATA RELEASED**) on the orders call — the OMS accepted the token.
7. The carrier response and the final \`say\` that interpolates order id, item, status, last event and ETA.

Now run **Failed verification blocks protected data**: the verification event reads *NOT VERIFIED*, the branch takes \`otherwise → not-verified\`, the OMS is never called, and the conversation ends *blocked*.
`,
    workflowId: 'orientation',
    scenarioId: 'wismo-happy-path',
  },
  exercise: {
    title: 'Run and read',
    instructions: `
1. Open the lab workspace (the complete example is already loaded; use *Load workflow… → Starter* if you changed it).
2. Run **all** scenarios of this module and make sure both pass.
3. In the Debug view of the happy path, count the API calls and note the simulated time consumed. Then answer the check for understanding.
4. Optional: change the final \`say\` text so that it also mentions the carrier name, re-run, and confirm the scenario still passes. Anything you type there is what the customer hears.
`,
    starterWorkflowId: 'orientation',
    scenarioIds: ['wismo-happy-path', 'wismo-failed-verification'],
    completionCriteria: `Both scenarios pass (they are graded on observable behaviour: API calls made, verification result, data released, what the agent said, and the outcome), and the check for understanding is answered correctly.`,
    hints: [
      'The scenarios are listed on the right of the lab workspace. *Run all & grade* runs them instantly; *Run this scenario* plays one back with pauses so you can watch the transcript build up.',
      'In the Debug view every event is collapsible. Errors and HTTP failures open automatically; expand `http_response` events to see headers and bodies.',
      'The "Requests as seen by the practice systems" table at the bottom of the trace is the systems\' own log — that is what the grader trusts, not what the workflow claims.',
    ],
  },
  quiz: [
    {
      id: 'm1q1',
      question: 'The agent found exactly one CRM record for the caller\'s phone number. What does that establish?',
      choices: ['That the caller is that customer', 'Only that a record matches an identifier the caller stated; identity is still unproven', 'That the OMS will now return the orders', 'That the phone number is the customer\'s primary contact'],
      answer: 1,
      explanation: 'A match on a stated identifier is not verification. The OMS in this course refuses order data until the verification service has issued a token for that customer — and that is the right design whether or not the agent "remembers" to verify.',
    },
    {
      id: 'm1q2',
      question: 'Which of these is documented by Parloa (with a linked source) rather than a general claim or this trainer\'s simulation?',
      choices: ['Workflows are ordered lists of http/set/branch/ask/say/end steps', 'Activation Restrictions are "boolean conditions over named variables" that are code, not interpreted by a language model', 'Every Parloa tool call uses JSONata for response mapping', 'Parloa requires middleware for all CRM integrations'],
      answer: 1,
      explanation: 'The Subtask Agents post on Parloa Labs documents Activation Restrictions in those words. The step list and JSONata are this trainer\'s simulation; and Parloa\'s public material says the opposite of "requires middleware".',
    },
    {
      id: 'm1q3',
      question: 'The carrier API is down but the OMS answered. What should a well-designed agent do?',
      choices: ['End the conversation with an error', 'Retry the carrier indefinitely until it answers', 'Tell the caller what the OMS knows (shipped, ETA) and that live tracking is temporarily unavailable', 'Skip the order status entirely and hand over'],
      answer: 2,
      explanation: 'Graceful degradation: use the data you have, be honest about what you do not have, keep retries bounded. Module 7 builds exactly this.',
    },
  ],
  references: [R.platform, R.integrations, R.subtaskAgents, R.agentSkills, R.productUpdates, R.openai, R.ampDocs],
};
