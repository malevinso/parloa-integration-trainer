# Parloa Integration Trainer

A hands-on course, in a single web app, for learning how conversational AI agents (Parloa-style) integrate with business systems. It is written for an experienced integration architect (MuleSoft / DataWeave / Java background) and needs **no account, no API key and no server**: the practice business systems, the workflow engine, the conversation simulator and the grader all run inside the browser.

The running example is *"Where is my order?"*: find the caller in a customer master, verify their identity, retrieve their orders, clarify which order they mean, fetch carrier tracking, and explain the status — including duplicate accounts, failed verification, several orders, no customer, no orders, and a carrier outage.

## Quick start

Requirements: **Node.js 20 or newer** (22 recommended) and npm. Check with `node --version`.

```bash
git clone <your-repository-url> parloa-integration-trainer
cd parloa-integration-trainer
npm install
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173). Progress and workflow drafts are saved in the browser (localStorage) and can be exported/imported as JSON under *Settings & backup*.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run preview` | Serve the built site locally (http://localhost:4173) |
| `npm test` | Run the automated test suite (Vitest) |
| `npm run typecheck` | TypeScript check only |
| `npm run api` | Optional: start the practice systems as a real HTTP server on http://localhost:8787 for curl/Postman |

The built `dist/` folder is plain static files (relative asset paths) and can be hosted anywhere — GitHub Pages, a shared folder, `npx serve dist`.

## What the app contains

- **Course dashboard** — learning path of 9 modules, completion status, saved progress, a *Continue learning* action.
- **Lessons** — each module has an objective, an explanation with labelled callouts, a worked example, an executable exercise with a starter workflow, progressive hints, completion criteria, a check for understanding, and linked sources.
- **Practice business systems** — four mock APIs with fictional data: Customer Master (bearer auth), Identity Verification (issues customer-bound tokens), Order Management (API key **and** verification token — enforced with 403), Carrier Tracking (API key; slow and fault-prone). API documentation with sample payloads, an API explorer, resettable fixtures and fault injection are on the *Practice systems* page.
- **Integration configuration workspace** — structured forms and an editable JSON view for requests, headers, query parameters, bodies, timeouts, retry policies, response mappings, variables, branch conditions, clarification questions and error routes.
- **Workflow execution** — the learner's configuration really runs against the practice APIs; every change affects behaviour.
- **Conversation simulator** — deterministic scripted callers per scenario, or play the customer yourself.
- **Debug view** — the full execution trace: requests, responses, mapped values, branch evaluations, verification and protected-data events, readable error explanations, final variables, and the systems' own request log.
- **Assessment** — scenario tests graded on observable behaviour with check-by-check feedback, hints and retry.
- **Persistence** — progress and drafts survive reloads; export/import as JSON.

## Curriculum

| # | Module | Exercise |
|---|---|---|
| 1 | Architecture: how a conversational agent integrates (+ verified Parloa concepts) | Run the complete flow and read its trace |
| 2 | Customer-master lookup: identifiers, duplicates, ambiguity | Complete the lookup flow (0 / 1 / many matches) |
| 3 | API authentication, request construction, response inspection | Fix three credential defects |
| 4 | Data mapping across customer, order and shipment systems (JSONata ≈ DataWeave) | Build `vars.orderView` |
| 5 | Identity verification and authorization | Add the verification gate |
| 6 | Workflow state, branching, clarification, tool execution | Handle several matches and several orders |
| 7 | Failure handling: empty results, malformed responses, timeouts, rate limits, retries | Survive four kinds of trouble |
| 8 | Testing, debugging, preventing disclosure before verification | Find and fix three planted defects |
| 9 | Capstone: the complete "Where is my order?" workflow | Pass all seven lab scenarios |

## Accuracy about Parloa

Everything the app says about Parloa is limited to Parloa's public material and is labelled in the lessons as one of three kinds:

- **Documented Parloa behaviour** — backed by a linked Parloa source (parloa.com platform/labs/blog pages, docs.parloa.com hub, and the OpenAI customer story). Quotations are verbatim.
- **General integration concept** — true regardless of platform.
- **This trainer's simulation** — the workflow format (`http` / `set` / `branch` / `ask` / `say` / `end` steps), JSONata mappings, the practice APIs, personas and scenarios. **None of this is Parloa's configuration format.**

**Known gap:** the detailed AMP documentation at docs.amp.parloa.com could not be read from the environment in which this trainer was built (its robots rules block automated readers), and the RBA documentation and Parloa Academy require a login. The app therefore does not describe Parloa screens, field names, configuration file formats, endpoint URLs or the exact shape of an MCP Skill / tool definition. The *Parloa concepts & sources* page lists every source with the date it was checked (14 September 2026). When something in Parloa changes, the release notes linked there are the place to look.

## Architecture

```
src/
  core/                       framework-agnostic; fully unit-tested
    systems/                  the four practice systems (one router, two transports)
      fixtures.ts             synthetic customers, identities (secrets), orders, shipments
      practiceSystems.ts      routing, auth, validation, verification tokens, 403 enforcement, faults, request log
      apiDocs.ts              documentation rendered on the Practice systems page
      types.ts                request/response shapes, hosts, base paths
    engine/                   the workflow engine
      types.ts                WorkflowConfig / Step / TraceEvent / RunResult
      executor.ts             runs steps, retries, error routes, redaction, trace
      expressions.ts          JSONata evaluation + {{ }} templating
      transport.ts            VirtualTransport (in-browser) and HttpTransport (fetch)
      validate.ts             structural validation with readable messages
    simulator/                scripted customers
      customer.ts             ScriptedCustomer (deterministic) and InteractiveCustomer (human)
      personas.ts             the callers
      scenarios.ts            scenario definitions with graded checks
    assessment/               grader (check evaluation, feedback text)
    workflows/                env defaults, reference solution, module starters
  curriculum/                 lesson content (one file per module) + Parloa sources/concept map
  state/                      localStorage persistence, export/import, React context
  ui/                         pages and components (hash router, no UI framework)
server/index.ts               optional Node HTTP server exposing the same practice systems
tests/                        Vitest suites
```

Execution model: a workflow is an ordered list of steps. `http` steps render templates, send the request through a transport, retry per policy, map the response into `vars`, and take `onError` on failure. `branch` evaluates JSONata conditions. `ask` puts a question to the customer (scripted persona or human) and stores the answer. `say` renders a reply. `end` sets the outcome. The engine records every event in a trace and redacts sensitive values (verification factors and tokens) before anything is shown.

The verification boundary is enforced by the practice Order Management System: it refuses order data unless the request carries a verification token that exists, has not expired and was issued for the same customer. The grader additionally checks that nothing protected was spoken before verification succeeded.

## The practice systems over real HTTP

`npm run api` starts the same systems on http://localhost:8787 (set `PORT` to change; see `.env.example`). Routes are prefixed by system:

```bash
curl "http://localhost:8787/crm/api/v1/customers?phone=602-555-0101" -H "Authorization: Bearer crm-sandbox-token-7f3a"
curl -X POST http://localhost:8787/verification/api/v1/verify \
  -H "Authorization: Bearer verify-sandbox-token-91c2" -H "Content-Type: application/json" \
  -d '{"customerId":"CUST-1001","factors":{"dateOfBirth":"1988-03-14","postalCode":"85004"}}'
curl "http://localhost:8787/orders/api/v2/orders?customerId=CUST-1001" -H "X-Api-Key: oms-sandbox-key-4d8e" -H "X-Verification-Token: vt_..."
curl "http://localhost:8787/carrier/track/v1/shipments/SP-7781-2201" -H "X-Api-Key: carrier-sandbox-key-2b61"
```

Admin endpoints: `POST /__admin/reset`, `GET /__admin/log`, `GET|PUT /__admin/faults` (e.g. `{"carrier":"timeout"}`). Send an `X-Run-Id` header to group requests into a "run" for the flaky / rate-limit faults. Latency is real on the server (a timeout fault holds the connection for ~30 s; cap with `MAX_LATENCY_MS`).

To point a workflow at the server: *Settings → transport: Local HTTP server*, then in the lab *Environment → Use local HTTP server*. Graded scenario runs always use the in-browser systems so results stay deterministic.

The sandbox credentials above are published practice values, not secrets. The verification factors in the example (`1988-03-14`, `85004`) belong to a fictional person.

## Simulator limitations

- The customer is scripted, not a language model. Personas answer by the *kind* of question asked (the `slot` of an `ask` step) and choose options by matching label text. The agent's replies are templates, not generated language. This is deliberate: runs are repeatable, so the grader is meaningful.
- Wording checks look for any of several phrasings; a correct behaviour with unusual wording can still fail a check — the feedback lists the phrases it looked for.
- Verification factors are date of birth and postal code; there are no one-time codes, biometrics or authenticated app sessions.
- Timeouts, latency and backoff are simulated in the browser (recorded as "ms simulated") so experiments are instant; only the optional HTTP server waits for real.
- In the browser build the fixtures (including verification factors) are part of the JavaScript bundle. They are never returned by the APIs, never shown in the UI and redacted from traces, but a determined learner can read the source. The HTTP server keeps them server-side.
- No circuit breaker, bulkhead, OAuth flows, pagination or webhooks are simulated.
- The workflow format is this trainer's own and is not importable into Parloa.

## Adding lessons and scenarios

**A new scenario** (graded conversation):

1. Add a persona in `src/core/simulator/personas.ts` (opening line, volunteered slots, scripted answers per slot, option choices).
2. Add a scenario in `src/core/simulator/scenarios.ts`: persona, optional `faults`, and `checks`. Check types are in `src/core/assessment/types.ts` (`api_called`, `api_not_called`, `no_status`, `verification`, `protected_data_released`, `no_disclosure_before_verification`, `agent_said`, `agent_not_said`, `asked_slot`, `outcome`, `no_fatal_error`, `variables_satisfy`, `max_steps`). Give every check a `title` and, for likely failures, a `hint`.
3. Reference the scenario id from a module's `exercise.scenarioIds`.
4. Run `npm test` — `tests/curriculum.test.ts` validates the wiring, and `tests/lab.test.ts` runs the reference solution against every scenario.

**A new module:**

1. Copy `src/curriculum/modules/m2-lookup.ts` to a new file; give it a unique `id` and `order`, and write `objective`, `sections`, `workedExample`, `exercise`, `quiz`, `references`. Lesson text is Markdown; callouts are blockquotes starting with `[!PARLOA]`, `[!GENERAL]`, `[!SIM]`, `[!MULE]`, `[!TIP]` or `[!WARNING]` (see `src/ui/Markdown.tsx`). Every `[!PARLOA]` callout must contain a link to a Parloa source — a test enforces it.
2. Add a starter workflow to `src/core/workflows/starters.ts` (a factory returning a `WorkflowConfig`) and reference it as `exercise.starterWorkflowId`.
3. Import the module in `src/curriculum/modules/index.ts`.

**New practice data or endpoints:** edit `src/core/systems/fixtures.ts` and `practiceSystems.ts`, document them in `apiDocs.ts`, and extend `tests/systems.test.ts`. Keep verification factors out of every response.

## Tests

`npm test` runs 66 tests:

- `tests/systems.test.ts` — routing, auth, duplicates, verification lockout and expiry, the OMS token boundary, carrier, fault injection, secrets never returned.
- `tests/engine.test.ts` — templating, validation, retries and Retry-After, timeouts, malformed bodies, mapping errors, expected statuses, options/no-match, sensitive-answer masking and disclosure guard, step limit.
- `tests/lab.test.ts` — the reference solution passes all seven lab scenarios and the module scenarios; no secret or token leaks into learner-visible output.
- `tests/assessment.test.ts` — grading catches a skipped verification, early disclosure and unbounded retries with specific feedback; starters fail the exercises they are meant to teach.
- `tests/server.test.ts` — the HTTP server: auth, boundary, admin endpoints, and the reference workflow over real HTTP.
- `tests/curriculum.test.ts` — modules, scenarios, starters and sources are consistent.
- `tests/persistence.test.ts` — localStorage round trip, export/import validation, corrupt storage.

## Sharing the repository and running it on another machine

1. Create an empty repository on GitHub (private is fine), then in this folder:
   ```bash
   git remote add origin git@github.com:<you>/parloa-integration-trainer.git
   git push -u origin main
   ```
   The repository already contains an initial commit, a `.gitignore` (no `node_modules`, `dist` or `.env`) and the `package-lock.json`; there are no secrets to remove.
2. Invite your colleague as a collaborator (or make the repo public), and send :
   ```bash
   git clone <repository-url>
   cd parloa-integration-trainer
   npm install
   npm run dev
   ```
   Node.js 20+ is the only prerequisite (https://nodejs.org). On Windows, run the commands in PowerShell or the Node.js command prompt.
3. To share without git, zip the folder (without `node_modules` and `dist`) or use a built `dist/` folder with any static file server (`npx serve dist`).
4. Progress lives in the browser. To move it between machines, use *Settings & backup → Download backup JSON* and import it on the other side.

## Optional AI tutor

Not included on purpose: the core experience must run without model API keys. A tutor could be added as a separate page that sends the current trace and failing checks to a model; the trace and check feedback are already structured JSON (`RunResult`, `ScenarioResult`).

## License

MIT — see `LICENSE`.
