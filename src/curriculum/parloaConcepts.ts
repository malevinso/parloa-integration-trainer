import type { Reference } from './types';

/**
 * Everything this trainer says about Parloa is grounded in the sources below.
 * Keep quotes verbatim; keep paraphrases attributed; keep the gap statement honest.
 */

export const parloaReferences: Record<string, Reference> = {
  docsHub: {
    title: 'Parloa documentation hub (docs.parloa.com)',
    url: 'https://docs.parloa.com/',
    kind: 'parloa-docs',
    note: 'Links to the AMP documentation (public), the RBA and RTT documentation (login required) and the Parloa Academy (partners/customers).',
  },
  ampDocs: {
    title: 'Parloa AMP documentation (docs.amp.parloa.com)',
    url: 'https://docs.amp.parloa.com/',
    kind: 'parloa-docs',
    note: 'Official step-by-step guides to build and manage agents. Could not be read automatically while building this trainer — open it for screen-level detail.',
  },
  releaseNotes: {
    title: 'Parloa AMP release notes',
    url: 'https://docs.amp.parloa.com/getting-started/release-notes',
    kind: 'parloa-docs',
    note: 'Check here for changes since this trainer was written (September 2026).',
  },
  platform: {
    title: 'Parloa Platform overview',
    url: 'https://www.parloa.com/platform/',
    kind: 'parloa-site',
    note: 'Names the lifecycle phases and features: Parloa Studio, Pre-built/Custom Skills, Integrations, Subtask Agents, MCP Skills, Simulations, Evaluations, Versioning, Agent Composition, Parloa Lens.',
  },
  integrations: {
    title: 'Parloa Platform — Integrations',
    url: 'https://www.parloa.com/platform/integrations/',
    kind: 'parloa-site',
    note: 'CCaaS/CPaaS and enterprise system integrations, REST APIs, MCP, SIP.',
  },
  test: {
    title: 'Parloa Platform — Test',
    url: 'https://www.parloa.com/platform/test/',
    kind: 'parloa-site',
    note: 'Simulations and evaluations, including rule-based criteria and API/tool-calling behaviour.',
  },
  subtaskAgents: {
    title: 'Parloa Labs — A look inside Parloa’s Subtask Agents (21 May 2026)',
    url: 'https://www.parloa.com/labs/insights/multi-agent-architecture-for-voice/',
    kind: 'parloa-site',
    note: 'Activation Restrictions, Activation Instructions, Storage Variables and Hooks.',
  },
  agentSkills: {
    title: 'Parloa blog — How Agent Skills accelerate compliant agent deployment (8 June 2026)',
    url: 'https://www.parloa.com/blog/agent-skills-accelerate-compliant-agent-deployment/',
    kind: 'parloa-site',
    note: 'Agent Skills built on the Model Context Protocol; auditable, retryable execution chains.',
  },
  productUpdates: {
    title: 'Parloa product updates',
    url: 'https://www.parloa.com/product-updates/',
    kind: 'parloa-site',
    note: 'MCP Skills, Subtask Agents, Parloa Lens, Parloa Navigator, LLM Guardrails (2026).',
  },
  release2026: {
    title: 'Parloa blog — Global AI agent management & compliance updates (20 Feb 2026)',
    url: 'https://www.parloa.com/blog/parloa_product_release_2026/',
    kind: 'parloa-site',
    note: 'Agent Composition with environment variables, Transcripts API, audit logs.',
  },
  openai: {
    title: 'OpenAI customer story — Parloa builds service agents customers want to talk to (7 May 2026)',
    url: 'https://openai.com/index/parloa/',
    kind: 'external',
    note: 'Describes how Parloa’s orchestration prompts a model with the agent configuration, retrieves information and triggers tools; simulation and evaluation approach.',
  },
  jsonata: {
    title: 'JSONata — JSON query and transformation language',
    url: 'https://jsonata.org/',
    kind: 'external',
    note: 'The expression language used by this trainer for mappings and conditions (try.jsonata.org has a live playground).',
  },
  mcp: {
    title: 'Model Context Protocol — specification',
    url: 'https://modelcontextprotocol.io/',
    kind: 'external',
    note: 'The open protocol Parloa’s MCP Skills build on.',
  },
  muleHttp: {
    title: 'MuleSoft docs — HTTP Connector',
    url: 'https://docs.mulesoft.com/http-connector/latest/',
    kind: 'external',
    note: 'For the MuleSoft parallels drawn in the lessons.',
  },
  dataweave: {
    title: 'MuleSoft docs — DataWeave language',
    url: 'https://docs.mulesoft.com/dataweave/latest/',
    kind: 'external',
    note: 'For the DataWeave ↔ JSONata comparisons.',
  },
  retryPatterns: {
    title: 'Microsoft Azure Architecture Center — Retry pattern',
    url: 'https://learn.microsoft.com/en-us/azure/architecture/patterns/retry',
    kind: 'external',
    note: 'Vendor-neutral guidance on bounded retries and backoff.',
  },
};

export const verifiedParloaMarkdown = `
## What Parloa publishes about integrations, tools and testing

Every statement below links to a Parloa source. Quotations are verbatim; everything else is a paraphrase of the linked page.

> [!PARLOA] **Where the official documentation lives.** Parloa's documentation hub links to the *AMP documentation* ("step-by-step guides to build and manage agents in Parloa"), and notes that the RBA (rule-based automation) and RTT documentation spaces require a separate login, and that the Parloa Academy is available to partners and customers. Source: [docs.parloa.com](https://docs.parloa.com/), [docs.amp.parloa.com](https://docs.amp.parloa.com/).

> [!PARLOA] **The platform lifecycle.** Parloa describes four phases: *Design and Integrate* in Parloa Studio with "Pre-built Skills, Custom Skills, Integrations, Subtask Agents, MCP Skills"; *Test and Iterate* with "Simulations, Evaluations, Versioning"; *Deploy and Scale* with "Agent Composition, Chat, Messaging, Voice, Languages and Voices, Model Orchestration"; and *Monitor and Improve* with "Parloa Lens, Data Hub and Sharing, Conversation Store". Source: [Parloa Platform](https://www.parloa.com/platform/).

> [!PARLOA] **How agents reach business systems.** Parloa's integrations page lists CCaaS/CPaaS platforms (Avaya, Five9, Genesys, Nice, Salesforce, ServiceNow, Twilio, Verint, Zendesk), enterprise systems such as Microsoft Dynamics and SAP, REST APIs, and the ability to "Plug into any system with MCP". Source: [Integrations](https://www.parloa.com/platform/integrations/). Parloa's June 2026 product update says "Parloa's MCP Skills replace brittle API integrations with a native tool layer that business teams configure directly - no code or middleware needed." Source: [Product updates](https://www.parloa.com/product-updates/). The Agent Skills post describes them as built on the Model Context Protocol, letting "business teams to configure full integration chains directly in Parloa without code or middleware", and states that "Every execution chain is auditable, retryable, and owned entirely by a business team, not buried in model behavior." Source: [Agent Skills](https://www.parloa.com/blog/agent-skills-accelerate-compliant-agent-deployment/).

> [!PARLOA] **Tool calling at runtime.** According to the OpenAI customer story, Parloa's orchestration layer "prompts an OpenAI model with the agent configuration and conversation context to generate a response, retrieve information through RAG, or trigger tools", and uses "structured API chains and event-based logic to ensure critical steps happen in the right order". Source: [OpenAI — Parloa](https://openai.com/index/parloa/).

> [!PARLOA] **Subtask Agents and deterministic state.** In Parloa's own words, "a Subtask Agent owns one user goal: authentication, order status, cancellation, FAQ, escalation to a human, etc." Eligibility is gated by *Activation Restrictions*, "boolean conditions over named variables" that "are code. They are not interpreted by a language model." Selection among eligible agents uses *Activation Instructions*, "a short natural-language description of when that agent should run." *Storage Variables* hold "the conversation's state", and *Hooks* provide "deterministic execution that happens outside the conversation turn loop." Source: [Parloa Labs — Subtask Agents](https://www.parloa.com/labs/insights/multi-agent-architecture-for-voice/). The OpenAI story similarly notes that "Tasks like authentication, booking changes, or account updates can be separated into distinct sub-agents".

> [!PARLOA] **Environments and composition.** Parloa's February 2026 release describes Agent Composition: "Define your agent's core logic once, then customize greetings, compliance notices, or regional nuances through environment variables", plus a Transcripts API and centralized audit logs. Source: [Release notes blog](https://www.parloa.com/blog/parloa_product_release_2026/).

> [!PARLOA] **Testing and evaluation.** Parloa's Test page: "Simulate real-life conversations, automate evaluation, and fix issues before they reach customers." and "Score agents using both LLM-based evaluations and rule-based criteria. Measure task success, tone, accuracy, and API behavior." It lists testing for "ambiguity, integrations, and tool calling, fallback behavior, and brand consistency" and switching "between staging and production". Source: [Test](https://www.parloa.com/platform/test/). The OpenAI story adds that Parloa "simulates customer conversations … with one model acting as the caller and another running the configured agent" and evaluates "using a mix of deterministic checks and LLM-as-a-judge scoring". Source: [OpenAI — Parloa](https://openai.com/index/parloa/).

> [!PARLOA] **Guardrails are not prompts.** Parloa's July 2026 LLM Guardrails update states: "Safety instructions baked into an agent prompt don't ensure security - a determined caller can easily manipulate them in a few messages." Source: [Product updates](https://www.parloa.com/product-updates/). This trainer applies the same principle to verification: enforce it in the system, not in instructions.

## What this trainer deliberately does not claim

> [!WARNING] The detailed AMP documentation at docs.amp.parloa.com could not be read from the environment in which this trainer was built (its robots rules block automated readers), and the RBA documentation and Academy require a login. This trainer therefore does **not** describe Parloa screens, field names, configuration file formats, endpoint URLs, or the exact shape of an MCP Skill or tool definition in Parloa. Where the lessons need that level of detail they use this trainer's own simulated workflow format and label it as such. Use the linked AMP documentation for the real configuration steps, and the release notes for anything that changed after September 2026.
`;

export const conceptMapMarkdown = `
## Concept map: Parloa ↔ general integration ↔ MuleSoft ↔ this trainer

| Concept | In Parloa (documented) | General term | MuleSoft parallel | In this trainer |
|---|---|---|---|---|
| Unit of conversational work | Subtask Agent owning "one user goal: authentication, order status, …" | Task / intent handler | A flow per business operation | One workflow (the whole WISMO flow), or one branch of it |
| Reaching a backend | MCP Skills / Agent Skills, Integrations, REST APIs | Tool / API call | HTTP Request operation in a connector | \`http\` step with method, URL, headers, query, body, timeout |
| Deterministic gating | Activation Restrictions: "boolean conditions over named variables" that "are code" | Guard condition | Choice router \`when\` expression | \`branch\` step with JSONata conditions |
| Conversation state | Storage Variables: "the conversation's state" | Session / context variables | Flow variables (\`vars.\`) | \`vars.*\` set by mappings, \`set\` steps and \`ask\` answers |
| Logic outside the LLM turn loop | Hooks: "deterministic execution that happens outside the conversation turn loop" | Orchestration / middleware | Mule flow invoked by the agent | The engine executing steps between customer turns |
| Per-environment values | Agent Composition "environment variables" | Configuration properties | Property placeholders \`\${...}\` | \`env.*\` (base URLs, sandbox credentials) |
| Data shaping | Not detailed in public material | Transformation / mapping | DataWeave | JSONata expressions in \`mapping\`, \`set\`, templates |
| Asking the customer | Handled by the agent's conversation model (not detailed publicly) | Slot filling / clarification | n/a | \`ask\` step with slot, options, sensitive flag |
| Testing | Simulations; Evaluations with "rule-based criteria" and "API behavior" | Scenario / regression tests | MUnit | Scripted personas + scenario checks over the trace |
| Observability | Parloa Lens, Conversation Store, audit logs | Tracing / logging | Runtime Manager logs, tracing | Debug view: trace, mapped values, verification events, system log |

> [!SIM] The right-hand column is this trainer's own model. It exists so that you can practise the *integration* reasoning (identifiers, auth, mapping, gating, failure handling, testing) with a runnable, gradable format. When you configure the real thing, transfer the reasoning, not the JSON.
`;
