import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m9: Module = {
  id: 'm9-capstone',
  order: 9,
  title: 'Capstone: the complete "Where is my order?" workflow',
  subtitle: 'Seven scenarios, one workflow. Then: how the same design transfers to Parloa.',
  estimatedMinutes: 90,
  objective: `Build, from a minimal skeleton, a workflow that passes all seven lab scenarios — single match, duplicate accounts, failed verification, multiple orders, no customer, no orders, carrier outage — and map the finished design onto the documented Parloa building blocks.`,
  sections: [
    {
      heading: 'Acceptance scenarios',
      body: `
| # | Scenario | Caller | Must do | Must not do |
|---|---|---|---|---|
| 1 | One customer, verified, one order | Priya | verify both factors, track, state status + ETA | disclose before verification |
| 2 | Duplicate accounts | Maria | ask a clarifying question, narrow to CUST-1002, report the delivered kettle | release data for CUST-1003 |
| 3 | Failed verification | Tom | explain that identity could not be verified; end blocked/handover | mention any order; call the OMS; exceed 3 attempts |
| 4 | Multiple orders | Wei | ask which order (options), report the headphones | pick silently |
| 5 | No customer | unknown | say no account was found; end cleanly | call the OMS |
| 6 | No orders | Aisha | say there are no orders | call the carrier; treat as error |
| 7 | Carrier outage | Lucas | bounded retries, then status + ETA from the OMS and "tracking unavailable" | speak raw errors; retry unbounded |

All seven run with fresh fixtures each time. The grader reports per-check feedback; iterate one scenario at a time.
`,
    },
    {
      heading: 'A suggested design',
      body: `
\`\`\`text
lookup (CRM, phone/email, status=ACTIVE, retry 2, onError→handover)
route-matches: 0 → no-customer | >1 → ask-email → lookup-by-email → route-narrowed | else pick-single
ask-dob (sensitive) → ask-postal (sensitive) → verify (POST, onError→handover)
route-verified: verified → get-orders | else not-verified → end blocked
get-orders (token header, onError→handover)
route-orders: 0 → no-orders | >1 → ask-order (options) | else pick-order
route-shipment: tracking number? → track | else status-no-shipment
track (timeout 3000, retry 2 exp, onError: degraded say → end resolved)
humanize (lookup table) → status-tracked → end resolved
\`\`\`

You may reuse your drafts from earlier modules (*Load workflow… → My draft from module …*). The reference solution is available under *Load workflow…* as a last resort — try the scenarios first; the feedback is designed to get you there.
`,
    },
    {
      heading: 'Transferring the design to Parloa',
      body: `
Once the workflow passes, the design decisions are what you carry over. Using only Parloa's documented vocabulary:

- **Split by user goal.** Parloa describes Subtask Agents as owning "one user goal: authentication, order status, cancellation, FAQ, escalation to a human, etc." — so "verify the caller" and "explain the order" are natural candidates for separate subtask agents, with the verification result held in **Storage Variables** ("the conversation's state") and the order-status agent gated by an **Activation Restriction** ("boolean conditions over named variables") such as *verified = true*. Source: [Parloa Labs](https://www.parloa.com/labs/insights/multi-agent-architecture-for-voice/).
- **Connect the systems as Skills.** Parloa's MCP Skills / Agent Skills are its documented way for business teams to "configure full integration chains directly in Parloa"; each chain is described as "auditable, retryable". Where an existing REST API or a CCaaS/CRM integration is the better fit, Parloa lists those too. Sources: [Agent Skills](https://www.parloa.com/blog/agent-skills-accelerate-compliant-agent-deployment/), [Integrations](https://www.parloa.com/platform/integrations/).
- **Keep per-environment values out of the logic.** Parloa's Agent Composition uses environment variables for deployment-specific values. Source: [Release blog](https://www.parloa.com/blog/parloa_product_release_2026/).
- **Test the same seven scenarios.** Parloa's platform offers Simulations and Evaluations with "rule-based criteria" that measure "API behavior"; the scenario table above is a ready-made evaluation plan. Source: [Test](https://www.parloa.com/platform/test/).
- **Enforce the boundary in the system.** Keep the OMS (or a façade) demanding proof of verification; Parloa's own guardrails update warns that prompt instructions "don't ensure security". Source: [Product updates](https://www.parloa.com/product-updates/).

> [!WARNING] What the transfer does *not* include: the exact screens, field names, tool-definition formats or endpoints in Parloa AMP. Those are in the [AMP documentation](https://docs.amp.parloa.com/), which this trainer could not read while it was built; check the [release notes](https://docs.amp.parloa.com/getting-started/release-notes) for changes after September 2026.
`,
    },
  ],
  workedExample: {
    title: 'How the reference solution is organised',
    body: `
The reference solution (available under *Load workflow…*) uses 27 steps in the order of the suggested design. Its distinguishing choices:

- **Every \`http\` step has an \`onError\`**, but only the CRM, OMS and carrier steps have retry policies; the verify step deliberately has none.
- **Two lookups instead of a local filter** for the duplicate case, because search results mask e-mails.
- **One convergence variable per level** (\`customer\`, \`selectedOrder\`) so that the later steps do not care which branch produced it.
- **A lookup table** turns carrier codes into phrases before the final \`say\`.
- **Degradation lives in the carrier step's \`onError.say\`**, which reads the OMS data already in \`vars.selectedOrder\`.

Read it after your own attempt: the comparison is where the learning is.
`,
  },
  exercise: {
    title: 'Pass all seven scenarios',
    instructions: `
Start from the skeleton (or load a draft from an earlier module) and build the full flow. Run *all & grade* often; open the Debug view for the first failing check each time.

Checklist:

1. Lookup with both identifiers, active accounts only, mapped counts.
2. Zero / one / many routing with a safe clarification question.
3. Two sensitive questions, one verification call, a hard gate.
4. Orders with the token; zero / one / many routing with options.
5. Tracking only when a tracking number exists; bounded retries; degraded reply.
6. Human phrasing (lookup table), no raw codes, explicit end outcomes.
`,
    starterWorkflowId: 'capstone',
    scenarioIds: ['wismo-happy-path', 'wismo-duplicate-customers', 'wismo-failed-verification', 'wismo-multiple-orders', 'wismo-no-customer', 'wismo-no-orders', 'wismo-carrier-timeout'],
    completionCriteria: `All seven lab scenarios pass in the same workflow, and the check for understanding is answered. Loading the reference solution also passes — but the goal is your own version.`,
    hints: [
      'Build in the order of the suggested design and run the happy path after each stage; it is the scenario that exercises the most steps.',
      'Failed verification, no customer and no orders are mostly about *routing*: make sure each branch case leads to a say step and an explicit end, never to a step that assumes data exists.',
      'For the outage scenario, the carrier step needs three things: timeoutMs ≈ 3000, retry with maxAttempts 2–3, and an onError.say that uses vars.selectedOrder (status, carrier, estimatedDelivery) followed by goto an end step.',
      'If several scenarios fail with the same first failing check, fix that one and re-run all — one cause usually explains many symptoms.',
    ],
    solutionWorkflowId: 'reference',
  },
  quiz: [
    {
      id: 'm9q1',
      question: 'Which pair of Parloa concepts (as documented) most directly corresponds to "gate the order-status logic on a verified flag held in conversation state"?',
      choices: ['Parloa Lens and Conversation Store', 'Activation Restrictions over Storage Variables', 'Model Orchestration and Languages', 'Transcripts API and audit logs'],
      answer: 1,
      explanation: 'Parloa Labs describes Storage Variables as the conversation state and Activation Restrictions as boolean conditions over named variables that gate subtask agents deterministically.',
    },
    {
      id: 'm9q2',
      question: 'The duplicate-accounts scenario passes only if data is released for CUST-1002 and not for CUST-1003. Which design property guarantees it?',
      choices: ['Asking the customer politely', 'Verifying and querying the same narrowed customer id, with the OMS binding tokens to that id', 'Querying both and filtering afterwards', 'Sorting matches by creation date'],
      answer: 1,
      explanation: 'The token is bound to one customer; querying another id yields 403. The flow must converge on a single customer before verification.',
    },
    {
      id: 'm9q3',
      question: 'Which of these is safe to claim about Parloa on the basis of this course?',
      choices: ['Parloa tool definitions use this trainer\'s JSON step format', 'Parloa documents Subtask Agents, Storage Variables, Activation Restrictions, MCP Skills, Simulations and Evaluations, with links provided', 'Parloa requires JSONata for mappings', 'Parloa verification always uses date of birth and postal code'],
      answer: 1,
      explanation: 'Only the documented vocabulary (with sources) is claimed; the step format, JSONata and the verification factors are this trainer\'s simulation.',
    },
  ],
  references: [R.subtaskAgents, R.agentSkills, R.integrations, R.release2026, R.test, R.productUpdates, R.ampDocs, R.releaseNotes],
};
