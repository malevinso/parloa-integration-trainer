import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m6: Module = {
  id: 'm6-branching',
  order: 6,
  title: 'Workflow state, branching, clarification and tool execution',
  subtitle: 'Deterministic state and conditions around the calls; clarification questions built from data.',
  estimatedMinutes: 45,
  objective: `Model conversation state as named variables, route deterministically on it, ask clarification questions whose options come from API data, and sequence tool calls so that each one has the inputs it needs — for duplicate customers, several orders, and orders that have not shipped.`,
  sections: [
    {
      heading: 'State is a small set of named variables',
      body: `
Everything the flow knows is in variables: \`matches\`, \`customer\`, \`verified\`, \`verificationToken\`, \`orders\`, \`selectedOrder\`, \`tracking\`. Good state design is boring on purpose:

- **One variable per decision.** A branch reads \`vars.matchCount\`, not a re-computation over raw responses.
- **Explicit counts and flags** (\`matchCount\`, \`orderCount\`, \`verified\`) rather than "is the array non-empty?" hidden in conditions.
- **Set the selection once** (\`selectedOrder\`), then have every later step read it, so "which order?" is answered in exactly one place.

> [!PARLOA] Parloa's Subtask Agents post calls this *Storage Variables* — "the conversation's state" — and routes between agents with *Activation Restrictions*, "boolean conditions over named variables" that "are code. They are not interpreted by a language model." The natural-language part (*Activation Instructions*) only chooses among already-eligible agents. Source: [Parloa Labs](https://www.parloa.com/labs/insights/multi-agent-architecture-for-voice/).

> [!MULE] Flow variables plus a choice router. The difference: a conversation can *ask* for missing state, so a branch may lead to a question rather than to an error.
`,
    },
    {
      heading: 'Clarification questions from data',
      body: `
A clarification question is a tool call in reverse: the agent needs a value it cannot derive, so it asks. Three kinds appear in the lab:

| Situation | Ask for | Options? |
|---|---|---|
| Several customer records | e-mail / account type, or a choice among safe labels | optional |
| Several orders | which order | yes — item name and date are what customers remember |
| Order has not shipped | nothing — say so | — |

Rules for options built from data:

- **Labels must be things the caller can recognise** (\`Wireless Headphones, ordered 2026-09-09\`), not internal ids only.
- **Labels must be safe to say** at that point of the conversation. Order options are spoken only *after* verification; customer-record options must not expose contact details.
- **Handle "none of those"** with an \`onNoMatch\` route: re-ask, offer help, or hand over.

> [!SIM] An \`ask\` with \`options\` evaluates \`items\` (JSONata → array), renders \`label\` per item (\`item\` in scope), and stores \`value\` (default: the item itself) into \`saveAs\`. The scripted caller picks the first label containing what they remember ("headphones"); a human in the simulator clicks a button or types text, which is matched against labels. No match → \`onNoMatch\`.
`,
    },
    {
      heading: 'Sequencing tool calls',
      body: `
Each call needs inputs produced by earlier steps: lookup needs an identifier; verification needs a customer id; orders need the token *and* the same customer id; tracking needs a tracking number that exists only once the order shipped. A chain therefore has *preconditions*, and a branch guards each one:

\`\`\`text
lookup → [count=0 → no-customer | count>1 → clarify → narrow] → verify → [verified? no → blocked]
       → orders → [count=0 → no-orders | count>1 → ask which] → [has tracking? no → status without tracking]
       → track → explain
\`\`\`

> [!PARLOA] Parloa describes this kind of ordering as "structured API chains and event-based logic to ensure critical steps happen in the right order" ([OpenAI — Parloa](https://openai.com/index/parloa/)) and, for Agent Skills, as execution chains that are "auditable, retryable" ([Agent Skills](https://www.parloa.com/blog/agent-skills-accelerate-compliant-agent-deployment/)).

> [!GENERAL] Design each branch to fail *closed*: if a precondition is missing (no tracking number), do not call the tool with an empty parameter — say what you know instead. The practice carrier answers 400 to an empty tracking number, and 404 to a wrong one; neither is what the caller should hear.
`,
    },
  ],
  workedExample: {
    title: 'Selecting among several orders',
    body: `
\`\`\`json
{ "id": "route-orders", "type": "branch",
  "cases": [ { "when": "vars.orderCount = 0", "goto": "no-orders" },
             { "when": "vars.orderCount > 1", "goto": "ask-order" } ],
  "otherwise": "pick-order" }
{ "id": "pick-order", "type": "set", "assign": { "selectedOrder": "vars.orders[0]" }, "next": "route-shipment" }
{ "id": "ask-order", "type": "ask",
  "prompt": "I can see {{vars.orderCount}} orders on your account. Which one are you asking about?",
  "slot": "orderChoice", "saveAs": "selectedOrder",
  "options": { "items": "vars.orders",
               "label": "{{item.items[0].name}} (order {{item.orderId}}, placed {{$substring(item.placedAt, 0, 10)}})",
               "value": "item" },
  "onNoMatch": { "say": "I couldn't match that to one of your orders. Let me connect you with a colleague.", "end": "handover" },
  "next": "route-shipment" }
{ "id": "route-shipment", "type": "branch",
  "cases": [ { "when": "$exists(vars.selectedOrder.shipment.trackingNumber)", "goto": "track" } ],
  "otherwise": "status-no-shipment" }
\`\`\`

Both paths converge on \`vars.selectedOrder\`; \`route-shipment\` guards the carrier call. For duplicate customers the same shape applies one level earlier: branch on \`matchCount\`, ask, narrow, converge on \`vars.customer\`.
`,
    workflowId: 'branching',
    scenarioId: 'wismo-multiple-orders',
  },
  exercise: {
    title: 'Handle several matches and several orders',
    instructions: `
The starter always takes the first customer and the first order.

1. In \`route-matches\`, add a case for more than one match that goes to a clarification question (ask for the e-mail, or offer the accounts as options with safe labels), then narrow to one record and continue to verification.
2. In \`route-orders\`, add a case for more than one order that goes to an \`ask\` step offering the orders as options (item name and date), saving the chosen order into \`selectedOrder\`, then continue to \`route-shipment\`.
3. Make sure the "no orders" path still works.

Run the three scenarios: duplicate customers, multiple orders, no orders.
`,
    starterWorkflowId: 'branching',
    scenarioIds: ['wismo-duplicate-customers', 'wismo-multiple-orders', 'wismo-no-orders'],
    completionCriteria: `All three scenarios pass: Maria's personal account (CUST-1002) is verified and only its orders are released; Wei is asked which order and hears about the headphones; Aisha is told there are no orders — with no unhandled errors.`,
    hints: [
      'Order of operations for the duplicate case: ask → narrow → verify. The verification step must run for the narrowed customer id, and the OMS call must use the same id; the grader checks that no orders were released for the business account.',
      'To narrow by e-mail you must re-query the CRM with `phone` and `email` (search results mask e-mails). To narrow by account type you can filter locally: `vars.matches[accountType = $uppercase($$.vars.accountType)][0]`.',
      'For the order question use `slot: orderChoice`, `saveAs: selectedOrder`, options `items: vars.orders`, `label: {{item.items[0].name}} (order {{item.orderId}})`, `value: item`. Set `next` to `route-shipment` so the chosen order flows into the tracking guard.',
      'If the multiple-orders scenario says the agent never asked, check the branch: `vars.orderCount > 1` must appear *before* the otherwise route, and `orderCount` must be mapped from `response.body.count` in the orders step.',
    ],
  },
  quiz: [
    {
      id: 'm6q1',
      question: 'Which option labels are appropriate when asking an UNVERIFIED caller to choose between two matching accounts?',
      choices: ['Full e-mail addresses and phone numbers', 'Account type and masked e-mail (e.g. "personal account, m***a@example.com")', 'Recent order items on each account', 'Customer ids only, read digit by digit'],
      answer: 1,
      explanation: 'Before verification the labels must not disclose contact details or order data. Account type and already-masked e-mail are recognisable and safe.',
    },
    {
      id: 'm6q2',
      question: 'The chosen order has `shipment: null`. What should the flow do?',
      choices: ['Call the carrier with an empty tracking number and handle the 400', 'Guard the carrier call with a branch and explain the order status from the OMS', 'Ask the caller for the tracking number', 'End the conversation'],
      answer: 1,
      explanation: 'Fail closed: a missing precondition means "do not call", not "call and see". The OMS status and ETA are enough to answer.',
    },
    {
      id: 'm6q3',
      question: 'In Parloa\'s published Subtask Agents design, what decides whether a subtask agent is eligible to run?',
      choices: ['The language model, freely', 'Activation Restrictions — boolean conditions over named variables, evaluated as code', 'The order in which agents were created', 'A human supervisor'],
      answer: 1,
      explanation: 'Per Parloa Labs: eligibility is deterministic (Activation Restrictions); the model only chooses among eligible agents using Activation Instructions.',
    },
  ],
  references: [R.subtaskAgents, R.openai, R.agentSkills, R.jsonata],
};
