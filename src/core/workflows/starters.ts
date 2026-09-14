import type { HttpStep, Step, WorkflowConfig } from '../engine/types';
import { defaultEnv } from './env';
import { referenceWismoWorkflow } from './referenceSolution';

/**
 * Starter workflows for each module. Most are derived from the reference
 * solution by removing or breaking the parts the learner has to build, so the
 * surrounding steps stay consistent with what the lessons show.
 */

function clone(): WorkflowConfig {
  return referenceWismoWorkflow();
}

function step<T extends Step['type']>(wf: WorkflowConfig, id: string, type: T): Extract<Step, { type: T }> {
  const s = wf.steps.find((x) => x.id === id);
  if (!s || s.type !== type) throw new Error(`starter: step ${id} of type ${type} not found`);
  return s as Extract<Step, { type: T }>;
}

function remove(wf: WorkflowConfig, ...ids: string[]) {
  wf.steps = wf.steps.filter((s) => !ids.includes(s.id));
}

export function starterOrientation(): WorkflowConfig {
  const wf = clone();
  wf.id = 'orientation';
  wf.name = 'Orientation — complete example to run and read';
  return wf;
}

export function starterLookup(): WorkflowConfig {
  return {
    id: 'lookup',
    name: 'Customer lookup',
    description: 'Find the caller in the customer master and handle 0, 1 or many matches.',
    env: defaultEnv(),
    variables: {},
    steps: [
      {
        id: 'lookup',
        type: 'http',
        name: 'Look up the customer',
        description: 'TODO: send the phone number (or e-mail) the caller gave as query parameters, and map the result into vars.matches / vars.matchCount.',
        request: {
          method: 'GET',
          url: '{{env.CRM_BASE_URL}}/customers',
          query: {},
          headers: { Authorization: 'Bearer {{env.CRM_TOKEN}}' },
          timeoutMs: 5000,
        },
        mapping: {},
        onError: { say: "I'm having trouble reaching our customer system right now. Let me connect you with a colleague.", end: 'handover' },
      },
      {
        id: 'route-matches',
        type: 'branch',
        name: 'How many matches?',
        description: 'TODO: route 0 matches to no-customer and more than one match to ask-clarify.',
        cases: [{ label: 'placeholder', when: 'false', goto: 'no-customer' }],
        otherwise: 'pick-single',
      },
      { id: 'pick-single', type: 'set', name: 'Select the single match', assign: { customer: 'vars.matches[0]' }, next: 'confirm' },
      {
        id: 'ask-clarify',
        type: 'ask',
        name: 'Clarify which account',
        prompt: 'I found more than one account with that phone number. Which e-mail address is on the account you are asking about?',
        slot: 'email',
        saveAs: 'email',
      },
      {
        id: 'narrow',
        type: 'set',
        name: 'Narrow the matches',
        description: 'TODO: keep only the match whose e-mail was given (re-query the CRM with phone + email, or filter vars.matches).',
        assign: { customer: 'vars.matches[0]' },
      },
      { id: 'confirm', type: 'say', text: 'Thanks {{vars.customer.firstName}}, I have found your account.', next: 'end-resolved' },
      { id: 'end-resolved', type: 'end', outcome: 'resolved' },
      { id: 'no-customer', type: 'say', text: "I'm sorry, I couldn't find an account with those details. Let me connect you with a colleague who can look into it further.", next: 'end-handover' },
      { id: 'end-handover', type: 'end', outcome: 'handover' },
    ],
  };
}

export function starterAuth(): WorkflowConfig {
  const wf = clone();
  wf.id = 'auth';
  wf.name = 'Authentication — fix the credentials';
  wf.description = 'Four systems, four credential conventions. Three of the requests below are wrong.';
  // Bug 1: no Authorization header on the CRM lookup.
  const lookup = step(wf, 'lookup', 'http');
  lookup.request.headers = {};
  // Bug 2: the OMS gets a bearer token instead of X-Api-Key (verification token is still sent).
  const orders = step(wf, 'get-orders', 'http');
  orders.request.headers = { Authorization: 'Bearer {{env.OMS_API_KEY}}', 'X-Verification-Token': '{{vars.verificationToken}}' };
  // Bug 3: the carrier step references an env variable that does not exist.
  const track = step(wf, 'track', 'http');
  track.request.headers = { 'X-Api-Key': '{{env.CARRIER_KEY}}' };
  return wf;
}

export function starterMapping(): WorkflowConfig {
  const wf = clone();
  wf.id = 'mapping';
  wf.name = 'Data mapping — build the unified order view';
  wf.description = 'The flow works end to end; add a set step that assembles vars.orderView from three systems.';
  const humanize = step(wf, 'humanize', 'set');
  humanize.description = 'TODO: add orderView: { customerName, orderId, itemSummary, status, carrier, trackingNumber, lastEvent, estimatedDelivery } built with JSONata from vars.customer, vars.selectedOrder and vars.tracking.';
  const say = step(wf, 'status-tracked', 'say');
  say.text = 'Your order {{vars.orderView.orderId}} ({{vars.orderView.itemSummary}}) is {{vars.statusText}}. Latest update from {{vars.orderView.carrier}}: {{vars.orderView.lastEvent}}. Estimated delivery: {{vars.orderView.estimatedDelivery}}.';
  return wf;
}

export function starterVerification(): WorkflowConfig {
  const wf = clone();
  wf.id = 'verification';
  wf.name = 'Verification gate — prove the caller is the customer';
  wf.description = 'The lookup works and the orders call exists, but nothing verifies the caller and the OMS will answer 403.';
  remove(wf, 'ask-dob', 'ask-postal', 'verify', 'route-verified', 'not-verified', 'end-blocked');
  const pick = step(wf, 'pick-single', 'set');
  pick.next = 'get-orders';
  const orders = step(wf, 'get-orders', 'http');
  orders.request.headers = { 'X-Api-Key': '{{env.OMS_API_KEY}}' };
  orders.description = 'TODO: this call needs the X-Verification-Token header. Before it: ask for date of birth and postal code (sensitive), POST them to the verification service, and branch on the result.';
  return wf;
}

export function starterBranching(): WorkflowConfig {
  const wf = clone();
  wf.id = 'branching';
  wf.name = 'State, branching and clarification';
  wf.description = 'Lookup and verification are done. Handle several matches, several orders, and orders that have not shipped.';
  // No duplicate handling: everything goes to pick-single.
  const routeMatches = step(wf, 'route-matches', 'branch');
  routeMatches.cases = [{ label: 'no match', when: 'vars.matchCount = 0', goto: 'no-customer' }];
  routeMatches.description = 'TODO: add a case for more than one match that asks a clarifying question.';
  remove(wf, 'ask-email', 'lookup-by-email', 'route-narrowed');
  // No order selection: always the first order.
  const routeOrders = step(wf, 'route-orders', 'branch');
  routeOrders.cases = [{ label: 'none', when: 'vars.orderCount = 0', goto: 'no-orders' }];
  routeOrders.description = 'TODO: add a case for more than one order that offers the orders as options.';
  remove(wf, 'ask-order');
  return wf;
}

export function starterResilience(): WorkflowConfig {
  const wf = clone();
  wf.id = 'resilience';
  wf.name = 'Failure handling — timeouts, outages, bad payloads';
  wf.description = 'The happy path works. Nothing is prepared for a slow or broken downstream system.';
  for (const id of ['lookup', 'lookup-by-email', 'verify', 'get-orders', 'track']) {
    const s = step(wf, id, 'http');
    delete s.retry;
    delete s.onError;
    delete s.request.timeoutMs;
  }
  const track = step(wf, 'track', 'http');
  track.description = 'TODO: add timeoutMs, a bounded retry policy and an onError route that still tells the caller what the OMS knows.';
  const orders = step(wf, 'get-orders', 'http');
  orders.description = 'TODO: add an onError route: a malformed or unavailable OMS should lead to an apology and a handover, never to a crash.';
  return wf;
}

export function starterDebugging(): WorkflowConfig {
  const wf = clone();
  wf.id = 'debugging';
  wf.name = 'Debugging — three planted defects';
  wf.description = 'This workflow looks complete but fails several scenarios. Use the Debug view to find and fix the defects.';
  // Defect 1: wrong mapping path (customers vs customer) → matches undefined → matchCount fine, but customer undefined.
  const lookup = step(wf, 'lookup', 'http');
  lookup.mapping = { matches: 'response.body.customer[]', matchCount: 'response.body.count' };
  // Defect 2: verification branch checks the wrong variable name.
  const routeVerified = step(wf, 'route-verified', 'branch');
  routeVerified.cases = [{ label: 'verified', when: 'vars.isVerified = true', goto: 'get-orders' }];
  // Defect 3: carrier header name typo.
  const track = step(wf, 'track', 'http');
  track.request.headers = { 'X-Api-Token': '{{env.CARRIER_API_KEY}}' };
  return wf;
}

export function starterCapstone(): WorkflowConfig {
  return {
    id: 'capstone',
    name: 'Capstone — Where is my order?',
    description: 'Build the complete flow: lookup, clarification, two-factor verification, orders, order selection, tracking, graceful degradation.',
    env: defaultEnv(),
    variables: {},
    steps: [
      {
        id: 'lookup',
        type: 'http',
        name: 'Look up the customer',
        request: { method: 'GET', url: '{{env.CRM_BASE_URL}}/customers', query: { phone: '{{input.slots.phone}}', email: '{{input.slots.email}}' }, headers: { Authorization: 'Bearer {{env.CRM_TOKEN}}' }, timeoutMs: 5000 },
        mapping: { matches: 'response.body.customers[]', matchCount: 'response.body.count' },
        onError: { say: "I'm having trouble reaching our customer system right now. Let me connect you with a colleague.", end: 'handover' },
      },
      { id: 'todo', type: 'say', text: 'TODO: replace this step with the rest of the flow.' },
      { id: 'end-resolved', type: 'end', outcome: 'resolved' },
    ],
  };
}

export const starters: Record<string, () => WorkflowConfig> = {
  orientation: starterOrientation,
  lookup: starterLookup,
  auth: starterAuth,
  mapping: starterMapping,
  'mapping-solution': () => solutionMapping(),
  verification: starterVerification,
  branching: starterBranching,
  resilience: starterResilience,
  debugging: starterDebugging,
  capstone: starterCapstone,
  reference: referenceWismoWorkflow,
};

export function getStarter(id: string): WorkflowConfig {
  const factory = starters[id];
  if (!factory) throw new Error(`Unknown starter workflow ${id}`);
  return factory();
}

/** Solution for the mapping module (adds the orderView assignment). */
export function solutionMapping(): WorkflowConfig {
  const wf = starterMapping();
  wf.id = 'mapping-solution';
  const humanize = step(wf, 'humanize', 'set');
  humanize.assign = {
    ...humanize.assign,
    orderView:
      '{ "customerName": vars.customer.firstName & " " & vars.customer.lastName, "orderId": vars.selectedOrder.orderId, "itemSummary": $join(vars.selectedOrder.items.(name & " ×" & $string(quantity)), ", "), "status": vars.tracking.status, "carrier": vars.tracking.carrier, "trackingNumber": vars.tracking.trackingNumber, "lastEvent": vars.tracking.lastEvent.description, "estimatedDelivery": vars.tracking.estimatedDelivery }',
  };
  return wf;
}

export type { HttpStep };
