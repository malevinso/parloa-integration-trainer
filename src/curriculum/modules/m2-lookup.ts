import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m2: Module = {
  id: 'm2-lookup',
  order: 2,
  title: 'Customer-master lookup: identifiers, duplicates, ambiguity',
  subtitle: 'Turn what a caller says into a query, and treat 0, 1 and many matches as three different business outcomes.',
  estimatedMinutes: 40,
  objective: `Build a lookup step that queries the customer master with the identifiers the caller volunteered, maps the result into workflow variables, and routes explicitly on the number of matches — including a clarification question when the identifier is ambiguous.`,
  sections: [
    {
      heading: 'Identifiers are claims, and they are messy',
      body: `
A caller volunteers *identifiers*: a phone number, an e-mail address, a name, sometimes a customer or order number. Each has a normalization problem and a uniqueness problem.

| Identifier | Normalization | Uniqueness |
|---|---|---|
| Phone | spoken/typed formats; E.164 (\`+16025550101\`) is the canonical form | shared by households and by duplicate records |
| E-mail | case, whitespace | usually unique per account, but people have several accounts |
| Last name | case, diacritics, spelling over the phone | very ambiguous on its own |
| Customer / order number | check digits, prefixes (\`CUST-\`, \`ORD-\`) | unique, but callers rarely have them to hand |

> [!SIM] The practice CRM normalizes phone numbers server-side (any common format → E.164) and matches e-mail case-insensitively. Real systems are often stricter; when they are, normalize in the mapping layer (JSONata: \`$replace(input.slots.phone, /[^0-9]/, "")\`).

> [!MULE] This is the same input hygiene you would put in a DataWeave transform before an HTTP Request — except that here the input arrives one utterance at a time, so the flow may have to *ask* for a missing identifier instead of failing validation.
`,
    },
    {
      heading: 'Zero, one, many: three outcomes, not one',
      body: `
A search returns a *list*. Designing for "the customer" hides two of the three cases:

- **0 matches** — not an error. The caller may be new, may have used a different identifier, or may not be a customer. Say so, optionally ask for another identifier, and never call downstream systems with an empty customer id.
- **1 match** — proceed, but remember it is still an unverified match (module 5).
- **>1 matches** — *ambiguous*. Ask a clarifying question or narrow with a second identifier. Never pick the first one; never query orders for all of them.

> [!GENERAL] Encode this as an explicit branch on the count, not as implicit behaviour of "take element 0". A condition such as \`vars.matchCount > 1\` is a deterministic guard — the same idea Parloa documents as Activation Restrictions being "boolean conditions over named variables" ([Parloa Labs](https://www.parloa.com/labs/insights/multi-agent-architecture-for-voice/)).

> [!WARNING] JSONata gotcha: a path expression that yields a single item is *not* an array. \`response.body.customers.customerId\` returns the string \`"CUST-1001"\` when there is one customer and an array when there are several. Append \`[]\` to keep an array (\`response.body.customers[]\`), and count with \`$count(...)\`, which handles both. The practice CRM also returns \`count\` explicitly — prefer explicit counts from the API when they exist.
`,
    },
    {
      heading: 'Why duplicates exist, and three ways to resolve them',
      body: `
Duplicates are normal: CRM migrations leave inactive legacy records, business and personal accounts share a phone, family members share a landline, and web sign-ups create second accounts. The practice data has all of these on purpose:

- \`+1 602 555 0102\` → two **ACTIVE** accounts (Maria Garcia: PERSONAL and BUSINESS).
- \`+1 602 555 0109\` → Daniel Kim's ACTIVE account **and** an INACTIVE record merged in a migration.
- \`lastName=Garcia\` → three people.

Resolution strategies, cheapest first:

1. **Filter what you can decide yourself.** Inactive records should never win: add \`status=ACTIVE\` to the query, or filter in JSONata: \`vars.matches[status = "ACTIVE"]\`.
2. **Narrow with a second identifier.** Re-query with \`phone\` **and** \`email\` (parameters combine with AND), or filter the list you already have.
3. **Ask the customer to choose** among *safe-to-show* labels (account type, masked e-mail). Never read full contact details of every candidate back to an unverified caller — that is disclosure.

> [!SIM] The \`ask\` step models a clarification question. Its \`slot\` says what you are asking for (\`email\`, \`accountType\`, \`customerChoice\`…); the scripted caller answers by slot. With \`options\`, the caller picks by label — labels are templates rendered per item (\`{{item.accountType}} account, {{item.emailMasked}}\`).
`,
    },
  ],
  workedExample: {
    title: 'Lookup with explicit routing on the match count',
    body: `
The lookup step sends whichever identifiers the caller gave (empty query values are omitted by the engine), restricts to active accounts and maps the result:

\`\`\`json
{
  "id": "lookup", "type": "http",
  "request": {
    "method": "GET", "url": "{{env.CRM_BASE_URL}}/customers",
    "query": { "phone": "{{input.slots.phone}}", "email": "{{input.slots.email}}", "status": "ACTIVE" },
    "headers": { "Authorization": "Bearer {{env.CRM_TOKEN}}" }, "timeoutMs": 5000
  },
  "mapping": { "matches": "response.body.customers[]", "matchCount": "response.body.count" },
  "onError": { "say": "I'm having trouble reaching our customer system right now. Let me connect you with a colleague.", "end": "handover" }
}
\`\`\`

Then a branch routes on the count, and a \`set\` step selects the single match:

\`\`\`json
{ "id": "route-matches", "type": "branch",
  "cases": [ { "when": "vars.matchCount = 0", "goto": "no-customer" },
             { "when": "vars.matchCount > 1", "goto": "ask-clarify" } ],
  "otherwise": "pick-single" }
{ "id": "pick-single", "type": "set", "assign": { "customer": "vars.matches[0]" }, "next": "confirm" }
\`\`\`

For the ambiguous case, ask for the e-mail and narrow. Two equivalent options — re-query the CRM with both identifiers, or filter locally:

\`\`\`text
re-query:  query: { "phone": "{{input.slots.phone}}", "email": "{{vars.email}}" }  →  mapping matches/matchCount again
filter:    assign: { "customer": "vars.matches[$lowercase(emailMasked) = $lowercase($$.vars.email)]" }   ← does NOT work: emails are masked
filter:    assign: { "customer": "vars.matches[accountType = $uppercase($$.vars.accountType)][0]" }        ← works if you asked for the account type
\`\`\`

Note \`$$\` — inside a JSONata predicate, \`$\` is the item being filtered, so the root context is reached with \`$$\`. Because search results mask e-mail addresses, matching on e-mail requires a re-query; matching on account type works locally.
`,
    workflowId: 'lookup',
    scenarioId: 'lookup-duplicates',
  },
  exercise: {
    title: 'Complete the lookup flow',
    instructions: `
The starter has the skeleton: an \`http\` lookup with no query parameters and no mapping, a branch with a placeholder case, a clarification \`ask\`, and the \`say\`/\`end\` steps.

1. Send the caller's phone number (and e-mail, if given) as query parameters. Restrict to \`status=ACTIVE\`.
2. Map \`matches\` (an array) and \`matchCount\` from the response.
3. Make the branch route 0 matches to \`no-customer\` and more than one match to \`ask-clarify\`.
4. After the clarification, narrow to a single record in the \`narrow\` step (or replace it with a second \`http\` step that re-queries with phone + e-mail) so that \`vars.customer\` is the personal account.
5. Confirm the account by first name.

Run the three scenarios: single match, ambiguous phone, no match.
`,
    starterWorkflowId: 'lookup',
    scenarioIds: ['lookup-single-match', 'lookup-duplicates', 'lookup-none'],
    completionCriteria: `All three lookup scenarios pass: \`vars.customer\` is CUST-1001 for Priya and CUST-1002 for Maria after a clarification question, and the unknown caller hears that no account was found — with no unhandled errors in any run.`,
    hints: [
      'Query values are templates. `{{input.slots.phone}}` renders to an empty string when the caller gave no phone, and empty query values are dropped from the URL — so you can list both `phone` and `email` safely.',
      'Mapping expressions run with `response` in scope: `response.body.customers[]` and `response.body.count`. Check the mapping table in the Debug view to see what each expression produced.',
      'The `narrow` step is a `set` step. Since search results mask e-mails you cannot filter on the e-mail locally; either ask for the account type instead (`slot: accountType`, then `vars.matches[accountType = $uppercase($$.vars.accountType)][0]`) or add an `http` step that re-queries with `phone` and `email` and maps `matches`/`matchCount` again, followed by `customer: vars.matches[0]`.',
      'If the ambiguous scenario reports "vars.customer is the personal account" as failed, open the Debug view: is `vars.customer` still the first of two matches? Then your narrowing step never ran or the branch skipped it — check `goto` targets and `next`.',
    ],
  },
  quiz: [
    {
      id: 'm2q1',
      question: 'A search by phone number returns two ACTIVE records. What is the right next step?',
      choices: ['Use the most recently created record', 'Query orders for both and merge the lists', 'Ask a clarifying question or narrow with a second identifier, without reading full contact details back', 'Treat it as "no customer found"'],
      answer: 2,
      explanation: 'Ambiguity is resolved by narrowing or asking. Picking one is guessing, querying both discloses, and "not found" is simply false.',
    },
    {
      id: 'm2q2',
      question: 'In JSONata, why write `response.body.customers[]` rather than `response.body.customers` in a mapping?',
      choices: ['It is faster', 'The `[]` suffix keeps the result an array even when there is exactly one customer', 'It sorts the customers', 'It removes null entries'],
      answer: 1,
      explanation: 'JSONata flattens singleton sequences. `[]` forces array semantics so later expressions such as `vars.matches[0]` and `$count(vars.matches)` behave the same for one or many matches.',
    },
    {
      id: 'm2q3',
      question: 'The CRM answers HTTP 200 with `count: 0`. Which statement is true?',
      choices: ['The request failed and should be retried', 'It is a valid business outcome that needs its own branch', 'The onError route should handle it', 'The caller must be verified before this can be interpreted'],
      answer: 1,
      explanation: 'Empty results are successful responses. Route on the count; reserve onError for transport and protocol failures.',
    },
  ],
  references: [R.subtaskAgents, R.jsonata, R.dataweave, R.ampDocs],
};
