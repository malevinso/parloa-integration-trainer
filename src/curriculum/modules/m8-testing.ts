import type { Module } from '../types';
import { parloaReferences as R } from '../parloaConcepts';

export const m8: Module = {
  id: 'm8-testing',
  order: 8,
  title: 'Testing, debugging, and preventing disclosure before verification',
  subtitle: 'Scenario tests as a regression suite, reading traces methodically, and negative tests for what must never happen.',
  estimatedMinutes: 45,
  objective: `Use scenario tests and the execution trace to locate defects quickly, write down what a correct agent must and must not do as checks on observable behaviour, and make "no disclosure before verification" a test rather than a hope.`,
  sections: [
    {
      heading: 'Test observable behaviour, not intentions',
      body: `
A scenario test pairs a scripted caller with checks on what actually happened:

- which systems were called, how often, and with what result — as recorded by the systems, not by the flow;
- whether verification succeeded, and for whom;
- whether protected data was released, and for whom;
- what the agent said, and *when* (before or after verification);
- how the conversation ended.

> [!PARLOA] This mirrors what Parloa describes for its own testing: "Simulate real-life conversations, automate evaluation, and fix issues before they reach customers" and "Score agents using both LLM-based evaluations and rule-based criteria. Measure task success, tone, accuracy, and API behavior", including tests for "integrations, and tool calling, fallback behavior" ([Test](https://www.parloa.com/platform/test/)); the OpenAI story adds evaluation "using a mix of deterministic checks and LLM-as-a-judge scoring" ([OpenAI — Parloa](https://openai.com/index/parloa/)).

> [!SIM] This trainer implements only the deterministic half: scripted personas and rule-based checks. Wording checks look for any of several phrasings, so the tests grade *behaviour*, not sentences — but if a check fails on wording, its detail lists what it looked for.

> [!MULE] Think MUnit with mocked connectors: fixtures are reset per scenario, faults are injected per scenario, and assertions run against the recorded calls.
`,
    },
    {
      heading: 'Negative tests: what must never happen',
      body: `
The most valuable checks are the ones for absence:

- No order data spoken before the verification service confirmed the caller.
- No OMS data released for a customer other than the verified one.
- No raw codes, template placeholders, \`undefined\` or exception text in customer-facing lines.
- No more than *n* attempts against a system in an outage.

> [!SIM] The grader's *no disclosure before verification* check scans every \`say\` and \`ask\` event that precedes the first successful \`verification\` event for a list of protected terms (order ids, tracking numbers, item names, dates) and names the offending step. A separate check asserts that the OMS never released data for the wrong customer — which the OMS itself enforces with 403, so this is a belt-and-braces test.

> [!GENERAL] Write negative tests for every security boundary you rely on. If the boundary is enforced by the system (as it should be), the test also documents that the flow *honours* it — no 403s in the happy path.
`,
    },
    {
      heading: 'A debugging method for traces',
      body: `
When a scenario fails, read the trace top-down and stop at the first thing that is not what you expected:

1. **The request.** Expand \`http_request\`: is the URL right? Are headers rendered (empty value = missing variable)? Is the body shaped as the API documents?
2. **The response.** Status, then headers, then body. Compare field names with the API documentation, not with memory.
3. **The mapping table.** Each expression next to its value. \`undefined\` = wrong path or singleton flattening; an error = syntax or a function that does not exist.
4. **The branch table.** Each condition next to its result. A condition that is \`false\` when you expected \`true\` usually points at a variable that was never set — go back to step 3.
5. **Ask/say events.** Was the prompt rendered correctly? Did the caller's answer match an option?
6. **The end.** Which outcome, and via which route? An *abandoned* outcome with an error event means a missing \`onError\`.

Then change one thing and re-run one scenario. The "Requests as seen by the practice systems" table at the bottom is the ground truth if you doubt the flow's own view.
`,
    },
  ],
  workedExample: {
    title: 'Diagnosing a silent mapping defect',
    body: `
Symptom: the happy path ends with "Thanks , for security…" — an empty first name — and later fails verification with a 400.

Trace: \`lookup\` responded 200 with \`count: 1\`; the mapping table shows \`matches\` → \`undefined\`. The expression was \`response.body.customer[]\` (singular) while the API returns \`customers\`. Everything downstream (\`vars.customer\`, the verify body's \`customerId\`) was empty, and the verification service correctly rejected a request without a customer id.

Fix the path, re-run: the mapping table now shows the array, the prompt renders the name, verification returns a token. One typo, three symptoms — the mapping table pointed at the cause in one look.
`,
    workflowId: 'debugging',
    scenarioId: 'wismo-happy-path',
  },
  exercise: {
    title: 'Find and fix three planted defects',
    instructions: `
The starter looks complete but fails several scenarios. Do not rewrite it — debug it:

1. Run all three scenarios and open the first failing one in the Debug view.
2. Follow the method above to locate each defect (there are three: one in a mapping, one in a branch condition, one in a request header).
3. Fix them one at a time, re-running after each fix.

Keep a note of which trace event revealed each defect — that is the skill being trained.
`,
    starterWorkflowId: 'debugging',
    scenarioIds: ['wismo-happy-path', 'wismo-failed-verification', 'wismo-multiple-orders'],
    completionCriteria: `All three scenarios pass after fixing the three defects: the mapping path, the verification branch condition, and the carrier header name.`,
    hints: [
      'Defect 1 shows up first: in the `lookup` mapping table, `matches` is `undefined`. Compare the expression with the response body field names.',
      'Defect 2: after a successful verification the branch still goes to `not-verified`. Look at the branch table — the condition references a variable name that the verify step never set.',
      'Defect 3: the carrier answers 401. Expand the `http_request`: which header name did you send, and which does the carrier documentation expect?',
    ],
  },
  quiz: [
    {
      id: 'm8q1',
      question: 'Which source of truth does the grader use to decide whether the OMS released data?',
      choices: ['The workflow\'s variables', 'The agent\'s final sentence', 'The practice systems\' own request log', 'The number of steps executed'],
      answer: 2,
      explanation: 'The systems record every request with its status and whether protected data was released; the workflow\'s own view can be wrong, the systems\' cannot.',
    },
    {
      id: 'm8q2',
      question: 'A branch condition `vars.isVerified = true` evaluates to false although the verification event says VERIFIED. Most likely cause?',
      choices: ['The verification service lied', 'The mapping stored the result under a different variable name (e.g. `verified`)', 'JSONata does not support booleans', 'The branch ran before the http step'],
      answer: 1,
      explanation: 'Comparisons with an unset variable are false. The mapping table shows which names were actually set.',
    },
    {
      id: 'm8q3',
      question: 'Why does a good test suite include a scenario where verification FAILS?',
      choices: ['To check that the agent retries verification', 'To prove that the protected path is not taken and nothing is disclosed — a negative test of the boundary', 'To make the suite longer', 'To test the carrier API'],
      answer: 1,
      explanation: 'Positive tests show the feature works; negative tests show the boundary holds. Both are needed for a security-relevant flow.',
    },
  ],
  references: [R.test, R.openai, R.ampDocs],
};
