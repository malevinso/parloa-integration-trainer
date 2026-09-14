/**
 * Scenario definitions: a scripted customer, optional fault injection, and the
 * checks that grade the agent's observable behaviour.
 */
import type { Check, Scenario } from '../assessment/types';
import { personas } from './personas';

const STATUS_WORDS = {
  inTransit: ['in transit', 'in_transit', 'on its way', 'on the way', 'en route', 'shipped', 'arrived at', 'regional hub'],
  delivered: ['delivered'],
  shipped: ['shipped', 'on its way', 'on the way', 'in transit', 'picked up'],
  processing: ['processing', 'being prepared', 'preparing', 'not shipped yet', "hasn't shipped"],
};

const ETA = {
  priya: ['2026-09-16', 'september 16', 'sep 16', '16 september', '9/16', 'sept 16', '16/09'],
  wei: ['2026-09-17', 'september 17', 'sep 17', '17 september', '9/17', 'sept 17', '17/09'],
  lucas: ['2026-09-18', 'september 18', 'sep 18', '18 september', '9/18', 'sept 18', '18/09'],
};

const noFatal: Check = {
  type: 'no_fatal_error',
  title: 'The conversation finished without an unhandled error',
  hint: 'Look at the Debug view: the last error event explains what failed and which onError route was missing.',
};

const noRawErrors: Check = {
  type: 'agent_not_said',
  anyOf: ['undefined', 'null', '[object object]', 'is exception', 'stack', 'jsonata', 'http_', 'timeout', 'econnrefused', '{{', 'in_transit', 'out_for_delivery', 'label_created'],
  title: 'The agent never spoke raw technical errors or unrendered templates',
  hint: 'Check say/onError texts for {{ }} typos and for variables that are empty in this branch.',
};

const verificationAsked: Check = {
  type: 'asked_slot',
  slots: ['dateOfBirth', 'postalCode'],
  min: 2,
  title: 'The agent asked for both verification factors before calling the verification service',
  hint: 'Use two ask steps (slots dateOfBirth and postalCode, sensitive: true) and send both factors in one POST /verify body.',
};

function disclosure(terms: string[]): Check {
  return {
    type: 'no_disclosure_before_verification',
    protectedTerms: terms,
    title: 'No order details were disclosed before verification succeeded',
    hint: 'Only speak order data after the verification response has verified = true. Route verified = false to a blocked/handover branch.',
  };
}

export const scenarios: Record<string, Scenario> = {
  // ---------------------------------------------------------------------------
  // Required "Where is my order?" lab
  // ---------------------------------------------------------------------------
  'wismo-happy-path': {
    id: 'wismo-happy-path',
    title: 'One customer, verified, one order',
    summary: 'Priya calls, volunteers her phone number and answers both verification questions correctly. She has exactly one order (ORD-10021), which is in transit.',
    expectedBehaviour: 'Look up the customer, verify both factors, retrieve the single order, fetch carrier tracking and tell her the status and the estimated delivery date.',
    persona: personas.priya,
    tags: ['lab', 'capstone'],
    checks: [
      { type: 'api_called', system: 'crm', pathPattern: '^/customers', min: 1, title: 'The customer master was queried', hint: 'Add an http step GET {{env.CRM_BASE_URL}}/customers?phone={{input.slots.phone}}.' },
      verificationAsked,
      { type: 'verification', expected: true, customerId: 'CUST-1001', title: 'The verification service confirmed the caller (CUST-1001)', hint: 'POST {{env.VERIFY_BASE_URL}}/verify with { customerId, factors: { dateOfBirth, postalCode } }.' },
      { type: 'protected_data_released', expected: true, customerId: 'CUST-1001', title: 'The OMS released the order data (token accepted)', hint: 'Send the token from the verification response in the X-Verification-Token header.' },
      { type: 'api_called', system: 'carrier', pathPattern: '^/shipments', min: 1, title: 'Carrier tracking was retrieved', hint: 'GET {{env.CARRIER_BASE_URL}}/shipments/{{vars.selectedOrder.shipment.trackingNumber}} with the X-Api-Key header.' },
      disclosure(['ORD-10021', 'SP-7781-2201', 'laptop stand', '2026-09-16']),
      { type: 'agent_said', anyOf: ['ORD-10021', 'laptop stand'], title: 'The agent identified the order (number or item)', hint: 'Interpolate {{vars.selectedOrder.orderId}} or the item name into the final message.' },
      { type: 'agent_said', anyOf: STATUS_WORDS.inTransit, title: 'The agent explained the current status', hint: 'Speak a human status, e.g. from the carrier lastEvent.description, or the order status.' },
      { type: 'agent_said', anyOf: ETA.priya, title: 'The agent gave the estimated delivery date (2026-09-16)', hint: 'Use the carrier estimatedDelivery field (or the order estimatedDelivery).' },
      { type: 'outcome', anyOf: ['resolved'], title: 'The conversation ended as resolved', hint: 'Finish with an end step whose outcome is resolved.' },
      noRawErrors,
      noFatal,
    ],
  },
  'wismo-duplicate-customers': {
    id: 'wismo-duplicate-customers',
    title: 'Multiple customer matches need clarification',
    summary: 'Maria calls with a phone number that matches two ACTIVE accounts (a personal and a business account). She means the personal one, whose order was delivered.',
    expectedBehaviour: 'Detect count > 1, ask a clarifying question (email, account type, or offer the matches as options), narrow to CUST-1002, verify that customer, and report ORD-10030 as delivered.',
    persona: personas.maria,
    tags: ['lab', 'capstone'],
    checks: [
      { type: 'api_called', system: 'crm', pathPattern: '^/customers', min: 1, title: 'The customer master was queried' },
      {
        type: 'asked_slot',
        slots: ['email', 'accountType', 'customerChoice', 'customerId'],
        min: 1,
        title: 'The agent asked a clarifying question to disambiguate the accounts',
        hint: 'Branch on $count(vars.matches) > 1 and ask for the e-mail address (slot email) or offer the matches as options (slot customerChoice).',
      },
      { type: 'verification', expected: true, customerId: 'CUST-1002', title: 'The correct account (CUST-1002) was verified', hint: 'After narrowing, verify the SAME customerId you will use for the orders call.' },
      { type: 'protected_data_released', expected: true, customerId: 'CUST-1002', title: 'Orders were retrieved for CUST-1002 only' },
      { type: 'protected_data_released', expected: false, customerId: 'CUST-1003', title: 'No order data was released for the business account (CUST-1003)', hint: 'Never query orders for every match — only for the account the caller confirmed and verified.' },
      disclosure(['ORD-10030', 'ORD-10031', 'kettle', 'office paper', 'SP-7781-1830']),
      { type: 'agent_said', anyOf: ['ORD-10030', 'kettle'], title: 'The agent identified the order' },
      { type: 'agent_said', anyOf: STATUS_WORDS.delivered, title: 'The agent reported that the order was delivered' },
      { type: 'outcome', anyOf: ['resolved'], title: 'The conversation ended as resolved' },
      noRawErrors,
      noFatal,
    ],
  },
  'wismo-failed-verification': {
    id: 'wismo-failed-verification',
    title: 'Failed verification blocks protected data',
    summary: 'Tom is found in the customer master but gives a date of birth that does not match. He must not receive any order information.',
    expectedBehaviour: 'Call the verification service, detect verified = false, tell the caller you cannot share order details, and end as blocked or hand over. Never call the OMS without a token; never speak order data.',
    persona: personas.tom,
    tags: ['lab', 'capstone', 'security'],
    checks: [
      { type: 'api_called', system: 'verification', pathPattern: '^/verify', min: 1, max: 3, title: 'Verification was attempted (at most 3 times)', hint: 'The service locks the customer after 3 failed attempts; do not loop.' },
      { type: 'verification', expected: false, title: 'Verification did not succeed', hint: 'This scenario is supposed to fail verification; if it passed, you may be reading the wrong factor or skipping the check.' },
      { type: 'protected_data_released', expected: false, title: 'The OMS did not release any order data', hint: 'The OMS enforces this with a 403, but your workflow should not even attempt the call without a token.' },
      { type: 'agent_not_said', anyOf: ['ORD-10040', 'ORD-10041', 'tent', 'sleeping bag', 'RR-55010', '2026-09-15', '2026-09-19', 'delayed'], title: 'No order information was spoken', hint: 'Route verified = false away from the order branch before any say step that mentions orders.' },
      { type: 'agent_said', anyOf: ["couldn't verify", 'could not verify', 'unable to verify', 'not able to verify', "can't verify", 'cannot verify', "wasn't able to verify", 'did not match', "didn't match", 'unable to confirm', "couldn't confirm", 'could not confirm', 'not able to confirm'], title: 'The agent explained that identity could not be verified', hint: 'Say something like "I wasn\'t able to verify your identity, so I can\'t share order details."' },
      { type: 'outcome', anyOf: ['blocked', 'handover'], title: 'The conversation ended as blocked or handed over', hint: 'Use an end step with outcome blocked (or handover to a human agent).' },
      noRawErrors,
      noFatal,
    ],
  },
  'wismo-multiple-orders': {
    id: 'wismo-multiple-orders',
    title: 'Multiple orders need selection',
    summary: 'Wei identifies himself by e-mail, verifies correctly, and has three orders. He wants the wireless headphones (ORD-10051), which are in transit.',
    expectedBehaviour: 'Retrieve all orders, notice count > 1, offer them as options (item name and date work well), select the chosen order and report its status and estimated delivery.',
    persona: personas.wei,
    tags: ['lab', 'capstone'],
    checks: [
      { type: 'api_called', system: 'crm', pathPattern: '^/customers', min: 1, title: 'The customer master was queried (by e-mail this time)', hint: 'The caller gave an e-mail, not a phone number. Build the query from whichever identifier is present, e.g. query: { phone: "{{input.slots.phone}}", email: "{{input.slots.email}}" } (empty values are omitted).' },
      { type: 'verification', expected: true, customerId: 'CUST-1005', title: 'The caller was verified' },
      { type: 'protected_data_released', expected: true, customerId: 'CUST-1005', title: 'Orders were retrieved' },
      { type: 'asked_slot', slots: ['orderChoice', 'orderId'], min: 1, title: 'The agent asked which order the caller meant', hint: 'Use an ask step with slot orderChoice and options { items: "vars.orders", label: "{{item.items[0].name}} ordered {{$substring(item.placedAt, 0, 10)}}", value: "item" }.' },
      disclosure(['ORD-10050', 'ORD-10051', 'ORD-10052', 'SP-7781-2310', 'headphones', 'yoga mat', 'running shoes']),
      { type: 'agent_said', anyOf: ['ORD-10051', 'headphones'], title: 'The agent reported on the headphones order' },
      { type: 'agent_said', anyOf: STATUS_WORDS.inTransit, title: 'The agent explained the current status' },
      { type: 'agent_said', anyOf: ETA.wei, title: 'The agent gave the estimated delivery date (2026-09-17)' },
      { type: 'outcome', anyOf: ['resolved'], title: 'The conversation ended as resolved' },
      noRawErrors,
      noFatal,
    ],
  },
  'wismo-no-customer': {
    id: 'wismo-no-customer',
    title: 'No matching customer',
    summary: 'The caller gives a phone number that is not in the customer master.',
    expectedBehaviour: 'Handle count = 0 explicitly: say that no account was found, optionally ask for another identifier, and hand over or end politely. Do not call verification or orders for a customer that does not exist.',
    persona: personas.unknown,
    tags: ['lab', 'capstone'],
    checks: [
      { type: 'api_called', system: 'crm', pathPattern: '^/customers', min: 1, max: 3, title: 'The customer master was queried (at most 3 lookups)' },
      { type: 'api_not_called', system: 'orders', title: 'The OMS was not called', hint: 'There is no customerId to query; branch on $count(vars.matches) = 0 before the verification/orders steps.' },
      { type: 'agent_said', anyOf: ["couldn't find", 'could not find', 'unable to find', 'not able to find', "can't find", 'cannot find', 'no account', "don't have an account", 'not find', 'no customer', "wasn't able to find", 'no record', "don't see an account"], title: 'The agent explained that no account was found' },
      { type: 'outcome', anyOf: ['handover', 'blocked', 'resolved'], title: 'The conversation ended cleanly (handover, blocked or resolved)' },
      noRawErrors,
      noFatal,
    ],
  },
  'wismo-no-orders': {
    id: 'wismo-no-orders',
    title: 'Verified customer with no orders',
    summary: 'Aisha is a new customer. She verifies correctly but has no orders at all: the OMS answers 200 with an empty list.',
    expectedBehaviour: 'Treat an empty result as a valid business outcome (not an error): tell her there are no orders on the account and end politely.',
    persona: personas.aisha,
    tags: ['lab', 'capstone'],
    checks: [
      { type: 'verification', expected: true, customerId: 'CUST-1006', title: 'The caller was verified' },
      { type: 'api_called', system: 'orders', pathPattern: '^/orders', min: 1, title: 'The OMS was queried' },
      { type: 'api_not_called', system: 'carrier', title: 'The carrier API was not called (there is nothing to track)', hint: 'Branch on $count(vars.orders) = 0 before any tracking step.' },
      { type: 'agent_said', anyOf: ['no orders', "don't see any orders", "couldn't find any orders", 'no recent orders', "haven't placed", 'not placed any', 'no order on', "don't have any orders", 'no orders on', 'without any orders', 'any orders', 'no open orders'], title: 'The agent explained that there are no orders on the account' },
      { type: 'outcome', anyOf: ['resolved', 'handover'], title: 'The conversation ended as resolved or handed over' },
      noRawErrors,
      noFatal,
    ],
  },
  'wismo-carrier-timeout': {
    id: 'wismo-carrier-timeout',
    title: 'Carrier tracking times out',
    summary: 'Lucas verifies correctly and has one shipped order, but the carrier tracking API never answers within the timeout.',
    expectedBehaviour: 'Retry the carrier call a bounded number of times, then degrade gracefully: tell him the order status from the OMS (shipped, estimated 2026-09-18) and that live tracking is temporarily unavailable. Never expose the raw error.',
    persona: personas.lucas,
    faults: { carrier: 'timeout' },
    tags: ['lab', 'capstone', 'resilience'],
    checks: [
      { type: 'verification', expected: true, customerId: 'CUST-1007', title: 'The caller was verified' },
      { type: 'protected_data_released', expected: true, customerId: 'CUST-1007', title: 'Orders were retrieved from the OMS' },
      { type: 'api_called', system: 'carrier', pathPattern: '^/shipments', min: 1, max: 4, title: 'Carrier tracking was attempted with bounded retries (1–4 attempts)', hint: 'Set retry.maxAttempts to 2–3 with a short timeoutMs (e.g. 3000) and backoff; unbounded retries make the caller wait forever.' },
      { type: 'agent_said', anyOf: ['ORD-10070', 'chair'], title: 'The agent still identified the order' },
      { type: 'agent_said', anyOf: STATUS_WORDS.shipped, title: 'The agent gave the status known from the OMS (shipped)' },
      { type: 'agent_said', anyOf: ['unavailable', 'temporarily', 'not available', 'at the moment', 'right now', 'try again', 'later', "can't reach", 'cannot reach', 'unable to reach', 'not responding', "couldn't get", 'could not get', 'unable to get', "isn't responding", 'currently'], title: 'The agent explained that live tracking is temporarily unavailable', hint: 'Use onError.say on the carrier step, e.g. "Live tracking is temporarily unavailable, but your order shipped and is estimated for …".' },
      { type: 'outcome', anyOf: ['resolved', 'handover'], title: 'The conversation still ended cleanly' },
      noRawErrors,
      noFatal,
    ],
  },

  // ---------------------------------------------------------------------------
  // Module-specific scenarios
  // ---------------------------------------------------------------------------
  'lookup-single-match': {
    id: 'lookup-single-match',
    title: 'Lookup: exactly one match',
    summary: 'Priya gives her phone number; exactly one customer record matches.',
    expectedBehaviour: 'Query the customer master by phone, map the match into vars.customer, and confirm the account by first name.',
    persona: personas.priya,
    tags: ['module-lookup'],
    checks: [
      { type: 'api_called', system: 'crm', pathPattern: '^/customers\\?', min: 1, title: 'The customer master search endpoint was called' },
      { type: 'no_status', status: 401, system: 'crm', title: 'The CRM accepted the credentials', hint: 'Send Authorization: Bearer {{env.CRM_TOKEN}}.' },
      { type: 'variables_satisfy', expression: 'vars.customer.customerId = "CUST-1001"', title: 'vars.customer holds the matching record (CUST-1001)', hint: 'Map customer: "response.body.customers[0]" (and matches: "response.body.customers[]").' },
      { type: 'agent_said', anyOf: ['priya'], title: 'The agent confirmed the account using the first name' },
      noRawErrors,
      noFatal,
    ],
  },
  'lookup-duplicates': {
    id: 'lookup-duplicates',
    title: 'Lookup: ambiguous phone number',
    summary: "Maria's phone number matches two active accounts.",
    expectedBehaviour: 'Detect count > 1, ask a clarifying question, and narrow to the personal account (CUST-1002).',
    persona: personas.maria,
    tags: ['module-lookup'],
    checks: [
      { type: 'api_called', system: 'crm', pathPattern: '^/customers', min: 1, title: 'The customer master was queried' },
      { type: 'asked_slot', slots: ['email', 'accountType', 'customerChoice', 'customerId'], min: 1, title: 'The agent asked a clarifying question', hint: 'Branch on $count(vars.matches) > 1.' },
      { type: 'variables_satisfy', expression: 'vars.customer.customerId = "CUST-1002"', title: 'vars.customer is the personal account (CUST-1002)', hint: 'Re-query with phone AND email, or filter vars.matches with a JSONata predicate such as vars.matches[accountType = $uppercase(vars.accountType)].' },
      noRawErrors,
      noFatal,
    ],
  },
  'lookup-none': {
    id: 'lookup-none',
    title: 'Lookup: no match',
    summary: 'The caller gives a phone number that is not in the customer master.',
    expectedBehaviour: 'Handle count = 0 without an error and explain it to the caller.',
    persona: personas.unknown,
    tags: ['module-lookup'],
    checks: [
      { type: 'api_called', system: 'crm', pathPattern: '^/customers', min: 1, max: 3, title: 'The customer master was queried' },
      { type: 'agent_said', anyOf: ["couldn't find", 'could not find', 'unable to find', 'not able to find', "can't find", 'cannot find', 'no account', 'not find', 'no customer', 'no record', "don't see an account"], title: 'The agent explained that no account was found' },
      noRawErrors,
      noFatal,
    ],
  },
  'auth-crm-and-oms': {
    id: 'auth-crm-and-oms',
    title: 'Authentication: every system accepts the credentials',
    summary: 'Priya, happy path. This scenario fails if any system answers 401.',
    expectedBehaviour: 'Send the right credential header to each system, referenced from env variables.',
    persona: personas.priya,
    tags: ['module-auth'],
    checks: [
      { type: 'no_status', status: 401, title: 'No system answered 401 Unauthorized', hint: 'CRM and verification use Authorization: Bearer …; OMS and carrier use X-Api-Key.' },
      { type: 'api_called', system: 'crm', min: 1, title: 'The CRM was called' },
      { type: 'api_called', system: 'verification', min: 1, title: 'The verification service was called' },
      { type: 'api_called', system: 'orders', min: 1, title: 'The OMS was called' },
      { type: 'api_called', system: 'carrier', min: 1, title: 'The carrier API was called' },
      { type: 'verification', expected: true, title: 'Verification succeeded' },
      noFatal,
    ],
  },
  'mapping-order-view': {
    id: 'mapping-order-view',
    title: 'Mapping: build a unified order view',
    summary: 'Priya, happy path. The workflow must produce vars.orderView with fields from three systems.',
    expectedBehaviour: 'Map customer, order and shipment data into one object: { customerName, orderId, itemSummary, status, carrier, trackingNumber, lastEvent, estimatedDelivery }.',
    persona: personas.priya,
    tags: ['module-mapping'],
    checks: [
      { type: 'verification', expected: true, title: 'Verification succeeded' },
      {
        type: 'variables_satisfy',
        expression: 'vars.orderView.orderId = "ORD-10021" and vars.orderView.customerName = "Priya Raman" and vars.orderView.carrier = "SwiftParcel" and vars.orderView.trackingNumber = "SP-7781-2201"',
        title: 'orderView carries orderId, customerName, carrier and trackingNumber from the right systems',
        hint: 'customerName: vars.customer.firstName & " " & vars.customer.lastName; carrier and trackingNumber come from the order\'s shipment object.',
      },
      {
        type: 'variables_satisfy',
        expression: '$contains($lowercase(vars.orderView.itemSummary), "laptop stand") and vars.orderView.estimatedDelivery = "2026-09-16" and $contains($lowercase(vars.orderView.lastEvent), "regional hub")',
        title: 'orderView carries itemSummary, estimatedDelivery and the carrier\'s last event',
        hint: 'itemSummary: $join(vars.selectedOrder.items.(name & " ×" & $string(quantity)), ", "); lastEvent: response.body.lastEvent.description from the carrier response.',
      },
      { type: 'agent_said', anyOf: ['ORD-10021', 'laptop stand'], title: 'The agent used the view in its answer' },
      noRawErrors,
      noFatal,
    ],
  },
  'verify-then-orders': {
    id: 'verify-then-orders',
    title: 'Verification gate: happy path',
    summary: 'Priya calls with her phone number and answers both verification factors correctly.',
    expectedBehaviour: 'Verify with both factors, pass the token to the OMS and speak the status.',
    persona: personas.priya,
    tags: ['module-verification'],
    checks: [
      verificationAsked,
      { type: 'verification', expected: true, customerId: 'CUST-1001', title: 'Verification succeeded for CUST-1001' },
      { type: 'protected_data_released', expected: true, title: 'The OMS accepted the token and released the orders' },
      { type: 'no_status', status: 403, title: 'The OMS never answered 403', hint: 'A 403 means the token header was missing, expired or for another customer.' },
      disclosure(['ORD-10021', 'SP-7781-2201', 'laptop stand']),
      { type: 'agent_said', anyOf: ['ORD-10021', 'laptop stand'], title: 'The agent reported the order' },
      noFatal,
    ],
  },
  'resilience-flaky-carrier': {
    id: 'resilience-flaky-carrier',
    title: 'Resilience: flaky carrier (first call fails with 503)',
    summary: 'Lucas, happy path, but the carrier API fails the first call in every run with 503 and succeeds afterwards.',
    expectedBehaviour: 'A retry policy (maxAttempts ≥ 2, retryOn includes 503) recovers and the agent gives full tracking information.',
    persona: personas.lucas,
    faults: { carrier: 'flaky' },
    tags: ['module-resilience'],
    checks: [
      { type: 'verification', expected: true, title: 'Verification succeeded' },
      { type: 'api_called', system: 'carrier', pathPattern: '^/shipments', min: 2, max: 3, title: 'The carrier call was retried and succeeded (2–3 attempts)', hint: 'Add retry: { maxAttempts: 3, backoffMs: 500, backoff: "exponential", retryOn: [503, 429, "timeout"] } to the carrier step.' },
      { type: 'agent_said', anyOf: ETA.lucas, title: 'The agent gave the estimated delivery date from the carrier (2026-09-18)' },
      { type: 'agent_said', anyOf: ['picked up', 'mesa', 'in transit', 'on its way', 'shipped'], title: 'The agent used the recovered tracking information' },
      noRawErrors,
      noFatal,
    ],
  },
  'resilience-oms-malformed': {
    id: 'resilience-oms-malformed',
    title: 'Resilience: malformed OMS response',
    summary: 'Priya verifies correctly, but the OMS answers HTTP 200 with a truncated JSON body.',
    expectedBehaviour: 'Detect the malformed body via onError (MALFORMED_RESPONSE), do not map fields from it, apologise and hand over or ask to call back.',
    persona: personas.priya,
    faults: { orders: 'malformed' },
    tags: ['module-resilience'],
    checks: [
      { type: 'verification', expected: true, title: 'Verification succeeded' },
      { type: 'api_called', system: 'orders', min: 1, max: 3, title: 'The OMS was called (bounded attempts)' },
      { type: 'agent_said', anyOf: ['unavailable', 'temporarily', 'not available', 'problem', 'issue', 'try again', 'later', 'colleague', 'transfer', 'human', 'right now', 'at the moment', "can't access", 'cannot access', 'unable to access', 'unable to retrieve', "couldn't retrieve", 'could not retrieve', "can't retrieve"], title: 'The agent explained the problem in customer terms' },
      { type: 'outcome', anyOf: ['handover', 'resolved', 'blocked'], title: 'The conversation ended cleanly' },
      noRawErrors,
      noFatal,
    ],
  },
  'resilience-crm-rate-limit': {
    id: 'resilience-crm-rate-limit',
    title: 'Resilience: CRM rate limit (one request per run)',
    summary: 'Priya, happy path, but the CRM allows only one request per conversation; any further CRM call gets 429.',
    expectedBehaviour: 'Make a single CRM call (the search result already has what you need), or handle 429 gracefully without a tight retry loop.',
    persona: personas.priya,
    faults: { crm: 'rate_limit' },
    tags: ['module-resilience'],
    checks: [
      { type: 'api_called', system: 'crm', min: 1, max: 3, title: 'The CRM was called at most 3 times' },
      { type: 'verification', expected: true, title: 'Verification still succeeded' },
      { type: 'agent_said', anyOf: ['ORD-10021', 'laptop stand'], title: 'The agent still answered the question' },
      noRawErrors,
      noFatal,
    ],
  },
  'security-inactive-duplicate': {
    id: 'security-inactive-duplicate',
    title: 'Lookup hygiene: inactive legacy record',
    summary: "Daniel's phone matches his active account and an INACTIVE legacy record from a CRM migration.",
    expectedBehaviour: 'Filter out inactive records (status filter or JSONata predicate) so no clarification is needed, verify CUST-1009 and report the order with its carrier exception.',
    persona: personas.daniel,
    tags: ['module-lookup', 'extra'],
    checks: [
      { type: 'verification', expected: true, customerId: 'CUST-1009', title: 'The active account (CUST-1009) was verified' },
      { type: 'protected_data_released', expected: false, customerId: 'CUST-0420', title: 'The inactive record was never used for an orders call' },
      { type: 'agent_said', anyOf: ['ORD-10090', 'light'], title: 'The agent identified the order' },
      { type: 'agent_said', anyOf: ['address', 'clarification', 'exception', 'held', 'issue', 'problem'], title: 'The agent mentioned the delivery exception (address needs clarification)', hint: 'Map the carrier exception.description and speak it when present.' },
      noRawErrors,
      noFatal,
    ],
  },
};

export const scenarioList: Scenario[] = Object.values(scenarios);
export const labScenarioIds = [
  'wismo-happy-path',
  'wismo-duplicate-customers',
  'wismo-failed-verification',
  'wismo-multiple-orders',
  'wismo-no-customer',
  'wismo-no-orders',
  'wismo-carrier-timeout',
];

export function getScenario(id: string): Scenario {
  const s = scenarios[id];
  if (!s) throw new Error(`Unknown scenario ${id}`);
  return s;
}
