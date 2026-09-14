import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m4: Module = {
  id: 'm4-mapping',
  order: 4,
  title: 'Data mapping across customer, order and shipment systems',
  subtitle: 'JSONata for DataWeave people: shape three payloads into one order view the agent can talk about.',
  estimatedMinutes: 45,
  objective: `Write JSONata mappings that extract, filter, join and humanize data from the CRM, OMS and carrier responses into a single canonical "order view", and use it in templated replies without leaking internal codes.`,
  sections: [
    {
      heading: 'Mapping is a contract, not plumbing',
      body: `
Three systems describe the same order in three vocabularies: the OMS says \`IN_TRANSIT\` with a \`shipment.trackingNumber\`, the carrier says \`status\`, \`events[]\` and \`estimatedDelivery\`, the CRM knows the customer's name. The agent should speak from **one canonical view**:

\`\`\`json
{ "customerName": "Priya Raman", "orderId": "ORD-10021", "itemSummary": "Adjustable Laptop Stand ×1",
  "status": "IN_TRANSIT", "carrier": "SwiftParcel", "trackingNumber": "SP-7781-2201",
  "lastEvent": "Arrived at regional hub", "estimatedDelivery": "2026-09-16" }
\`\`\`

Building this view in one place means every \`say\` template reads from the same fields, tests can assert on it, and swapping a carrier changes one mapping instead of every sentence.

> [!MULE] This is the canonical data model idea from API-led design, applied inside one conversation. The view is your process-layer payload; the \`say\` templates are the experience layer.

> [!PARLOA] Public Parloa material does not describe a mapping language for tool responses; the Subtask Agents post describes *Storage Variables* as "the conversation's state" that deterministic conditions read. How response fields get into such variables in AMP is documented in the [AMP docs](https://docs.amp.parloa.com/), which this trainer could not read — treat the mapping mechanics here as this trainer's own.
`,
    },
    {
      heading: 'JSONata for DataWeave users',
      body: `
JSONata is an open expression language over JSON with a DataWeave-like feel: path navigation, predicates, functions, object construction. The cheat sheet:

| Intent | DataWeave | JSONata |
|---|---|---|
| Navigate | \`payload.body.customers\` | \`response.body.customers\` |
| Filter | \`customers filter ($.status == "ACTIVE")\` | \`customers[status = "ACTIVE"]\` |
| Map | \`items map ($.name ++ " ×" ++ $.quantity)\` | \`items.(name & " ×" & $string(quantity))\` |
| Count | \`sizeOf(items)\` | \`$count(items)\` |
| Join | \`joinBy(list, ", ")\` | \`$join(list, ", ")\` |
| Concatenate | \`a ++ " " ++ b\` | \`a & " " & b\` |
| Default | \`x default "n/a"\` | \`x ? x : "n/a"\` |
| Lookup table | \`{ "A": "x" }[code]\` | \`$lookup({ "A": "x" }, code)\` |
| Object | \`{ id: x.id }\` | \`{ "id": x.id }\` |
| Sort | \`orderBy(list, $.placedAt)\` | \`list^(placedAt)\` (descending: \`^(>placedAt)\`) |
| First element | \`list[0]\` | \`list[0]\` |
| Substring | \`s[0 to 9]\` | \`$substring(s, 0, 10)\` |
| Case | \`upper(s)\` | \`$uppercase(s)\` |
| Root inside a predicate | \`vars.x\` | \`$$.vars.x\` (\`$\` is the current item) |

Two differences that bite:

- **Singleton flattening.** \`orders.orderId\` is a string for one order and an array for several. Use \`[]\` to force arrays, \`$count()\` to count.
- **Missing paths are \`undefined\`, not errors.** \`vars.customer.firstName\` on a missing customer renders as empty text in a template. Comparisons with \`undefined\` are false, so \`vars.matchCount = 0\` is false when \`matchCount\` was never mapped — map explicit counts.

> [!TIP] [try.jsonata.org](https://try.jsonata.org) lets you paste a response body from the Debug view and experiment with expressions before putting them in a mapping.
`,
    },
    {
      heading: 'Where expressions run in this trainer',
      body: `
| Place | Context available | Typical use |
|---|---|---|
| \`http.mapping\` (variable → expression) | \`response\` (\`status\`, \`headers\`, \`body\`), \`vars\`, \`env\`, \`input\`, \`steps\` | extract fields into \`vars\` right after a call |
| \`set.assign\` | \`vars\`, \`env\`, \`input\`, \`steps\` | derive, join, humanize |
| \`branch.cases[].when\` | same as set | routing conditions |
| \`{{ … }}\` in URLs, headers, query, body, prompts, say text | same; plus \`item\` inside option labels | interpolation |
| \`onError.setVars\` | plus \`error.code\`, \`error.message\`, \`error.status\` | record failure details |

\`steps.<id>\` holds each executed http step's \`status\`, \`headers\`, \`body\` and \`attempts\`, so a later step can still read an earlier response (\`steps.lookup.body.count\`).

> [!SIM] Templates stringify values: strings as-is, numbers and booleans as text, arrays joined with ", ", objects as JSON. If you see \`{"orderId":…}\` in a reply, you interpolated an object instead of a field.

Humanizing codes belongs in the mapping, not in the sentence. A lookup table keeps it testable:

\`\`\`text
statusText: $lookup({ "IN_TRANSIT": "in transit", "OUT_FOR_DELIVERY": "out for delivery today",
                      "DELIVERED": "delivered", "EXCEPTION": "held up by a delivery exception" }, vars.tracking.status)
\`\`\`
`,
    },
  ],
  workedExample: {
    title: 'Assembling the order view from three responses',
    body: `
After \`lookup\` (→ \`vars.customer\`), \`get-orders\` (→ \`vars.selectedOrder\`) and \`track\` (→ \`vars.tracking\`), one \`set\` step builds the view:

\`\`\`text
orderView: {
  "customerName": vars.customer.firstName & " " & vars.customer.lastName,
  "orderId": vars.selectedOrder.orderId,
  "itemSummary": $join(vars.selectedOrder.items.(name & " ×" & $string(quantity)), ", "),
  "status": vars.tracking.status,
  "carrier": vars.tracking.carrier,
  "trackingNumber": vars.tracking.trackingNumber,
  "lastEvent": vars.tracking.lastEvent.description,
  "estimatedDelivery": vars.tracking.estimatedDelivery
}
\`\`\`

and the reply reads only from it:

\`\`\`text
Your order {{vars.orderView.orderId}} ({{vars.orderView.itemSummary}}) is {{vars.statusText}}.
Latest update from {{vars.orderView.carrier}}: {{vars.orderView.lastEvent}}. Estimated delivery: {{vars.orderView.estimatedDelivery}}.
\`\`\`

Check the \`set\` event in the Debug view: the mapping table shows the expression next to the value it produced, so a wrong path shows up as \`undefined\` immediately.
`,
    workflowId: 'mapping',
    scenarioId: 'mapping-order-view',
  },
  exercise: {
    title: 'Build vars.orderView',
    instructions: `
The starter is the complete flow, except that the \`humanize\` step only translates the carrier status and the final \`say\` already reads from \`vars.orderView\` — which does not exist yet.

1. In the \`humanize\` step, add an assignment \`orderView\` that builds the object shown in the worked example from \`vars.customer\`, \`vars.selectedOrder\` and \`vars.tracking\`.
2. Run **Mapping: build a unified order view**. The grader checks the fields of \`vars.orderView\` after the run and what the agent said.
3. Optional: add \`eventCount: $count(vars.tracking.events)\` and mention it in the reply.
`,
    starterWorkflowId: 'mapping',
    scenarioIds: ['mapping-order-view'],
    completionCriteria: `The mapping scenario passes: \`vars.orderView\` carries orderId, customerName, carrier, trackingNumber, itemSummary, estimatedDelivery and lastEvent with the expected values, and the agent's reply uses the view.`,
    hints: [
      'Assignments in a `set` step are evaluated in order, so `orderView` can be added after `statusText` in the same step. Each assignment is one JSONata expression — an object constructor `{ "key": expr, … }` is a single expression.',
      'String concatenation is `&`, not `+`. Numbers need `$string()` before concatenation: `name & " ×" & $string(quantity)`.',
      'The carrier response body was mapped whole into `vars.tracking` by the `track` step, so `vars.tracking.lastEvent.description` and `vars.tracking.estimatedDelivery` are available. Expand the `track` step\'s `http_response` in the Debug view to see the exact field names.',
      'If the check says a field is wrong, open the `set` event: the table shows the value each assignment produced. `undefined` usually means a typo in a path.',
    ],
    solutionWorkflowId: 'mapping-solution',
  },
  quiz: [
    {
      id: 'm4q1',
      question: 'What does `vars.orders.orderId` evaluate to in JSONata when the customer has exactly one order?',
      choices: ['An array with one string', 'A single string', 'null', 'An error'],
      answer: 1,
      explanation: 'JSONata flattens singleton results. Use `vars.orders.orderId[]` or `$count(vars.orders)` when you need array semantics regardless of size.',
    },
    {
      id: 'm4q2',
      question: 'Why translate `IN_TRANSIT` to "in transit" in a `set` step rather than typing the phrase into the `say` text?',
      choices: ['Templates cannot contain spaces', 'So the translation is data-driven, reusable in every reply and visible in the trace', 'Because `say` steps cannot read `vars`', 'It makes the API call faster'],
      answer: 1,
      explanation: 'A lookup table in the mapping layer keeps replies consistent, testable and free of raw codes; the grader flags raw enums like IN_TRANSIT in customer-facing text.',
    },
    {
      id: 'm4q3',
      question: 'Inside a predicate such as `vars.matches[accountType = …]`, how do you reference a workflow variable?',
      choices: ['`vars.accountType`', '`$$.vars.accountType`', '`$.vars.accountType`', '`this.vars.accountType`'],
      answer: 1,
      explanation: 'Inside a predicate `$` is the current item; `$$` is the root of the evaluation context.',
    },
  ],
  references: [R.jsonata, R.dataweave, R.subtaskAgents, R.ampDocs],
};
