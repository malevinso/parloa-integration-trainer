import type { WorkflowConfig } from '../engine/types';
import { defaultEnv } from './env';

/**
 * Reference solution for the "Where is my order?" lab. It passes all seven lab
 * scenarios and is used by the automated tests. Learners can reveal it from the
 * capstone module after attempting the lab themselves.
 */
export function referenceWismoWorkflow(): WorkflowConfig {
  return {
    id: 'wismo-reference',
    name: 'Where is my order? — reference solution',
    description: 'Customer lookup → clarification → two-factor verification → orders → order selection → carrier tracking with graceful degradation.',
    env: defaultEnv(),
    variables: {},
    steps: [
      {
        id: 'lookup',
        type: 'http',
        name: 'Look up the customer',
        request: {
          method: 'GET',
          url: '{{env.CRM_BASE_URL}}/customers',
          query: { phone: '{{input.slots.phone}}', email: '{{input.slots.email}}', status: 'ACTIVE' },
          headers: { Authorization: 'Bearer {{env.CRM_TOKEN}}' },
          timeoutMs: 5000,
        },
        retry: { maxAttempts: 2, backoffMs: 300, retryOn: [503, 'timeout'] },
        mapping: { matches: 'response.body.customers[]', matchCount: 'response.body.count' },
        onError: { say: "I'm having trouble reaching our customer system right now. Let me connect you with a colleague.", end: 'handover' },
      },
      {
        id: 'route-matches',
        type: 'branch',
        name: 'How many matches?',
        cases: [
          { label: 'no match', when: 'vars.matchCount = 0', goto: 'no-customer' },
          { label: 'ambiguous', when: 'vars.matchCount > 1', goto: 'ask-email' },
        ],
        otherwise: 'pick-single',
      },
      { id: 'pick-single', type: 'set', name: 'Select the single match', assign: { customer: 'vars.matches[0]' }, next: 'ask-dob' },
      {
        id: 'ask-email',
        type: 'ask',
        name: 'Clarify which account',
        prompt: 'I found more than one account with that phone number. Which e-mail address is on the account you are asking about?',
        slot: 'email',
        saveAs: 'email',
      },
      {
        id: 'lookup-by-email',
        type: 'http',
        name: 'Narrow the search',
        request: {
          method: 'GET',
          url: '{{env.CRM_BASE_URL}}/customers',
          query: { phone: '{{input.slots.phone}}', email: '{{vars.email}}', status: 'ACTIVE' },
          headers: { Authorization: 'Bearer {{env.CRM_TOKEN}}' },
          timeoutMs: 5000,
        },
        mapping: { matches: 'response.body.customers[]', matchCount: 'response.body.count' },
        onError: { say: "I'm having trouble reaching our customer system right now. Let me connect you with a colleague.", end: 'handover' },
      },
      {
        id: 'route-narrowed',
        type: 'branch',
        name: 'Exactly one now?',
        cases: [{ label: 'single', when: 'vars.matchCount = 1', goto: 'pick-single' }],
        otherwise: 'no-customer',
      },
      {
        id: 'ask-dob',
        type: 'ask',
        name: 'Verification factor 1',
        prompt: 'Thanks {{vars.customer.firstName}}. For security, could you confirm your date of birth?',
        slot: 'dateOfBirth',
        saveAs: 'dob',
        sensitive: true,
      },
      {
        id: 'ask-postal',
        type: 'ask',
        name: 'Verification factor 2',
        prompt: 'And the postal code on the account?',
        slot: 'postalCode',
        saveAs: 'postalCode',
        sensitive: true,
      },
      {
        id: 'verify',
        type: 'http',
        name: 'Verify identity',
        request: {
          method: 'POST',
          url: '{{env.VERIFY_BASE_URL}}/verify',
          headers: { Authorization: 'Bearer {{env.VERIFY_TOKEN}}', 'Content-Type': 'application/json' },
          body: { customerId: '{{vars.customer.customerId}}', factors: { dateOfBirth: '{{vars.dob}}', postalCode: '{{vars.postalCode}}' } },
          timeoutMs: 5000,
        },
        mapping: { verified: 'response.body.verified', verificationToken: 'response.body.token' },
        onError: { say: "I'm sorry, I'm not able to verify your identity right now. I'll connect you with a colleague.", end: 'handover' },
      },
      {
        id: 'route-verified',
        type: 'branch',
        name: 'Verified?',
        cases: [{ label: 'verified', when: 'vars.verified = true', goto: 'get-orders' }],
        otherwise: 'not-verified',
      },
      {
        id: 'not-verified',
        type: 'say',
        text: "I'm sorry, I wasn't able to verify your identity with those details, so I can't share any order information. You can try again later, or I can connect you with a colleague.",
        next: 'end-blocked',
      },
      { id: 'end-blocked', type: 'end', outcome: 'blocked', reason: 'verification failed' },
      {
        id: 'get-orders',
        type: 'http',
        name: 'Retrieve orders (protected)',
        request: {
          method: 'GET',
          url: '{{env.ORDERS_BASE_URL}}/orders',
          query: { customerId: '{{vars.customer.customerId}}' },
          headers: { 'X-Api-Key': '{{env.OMS_API_KEY}}', 'X-Verification-Token': '{{vars.verificationToken}}' },
          timeoutMs: 5000,
        },
        retry: { maxAttempts: 2, backoffMs: 300, retryOn: [503, 'timeout'] },
        mapping: { orders: 'response.body.orders[]', orderCount: 'response.body.count' },
        onError: { say: "I'm sorry, I can't access order information at the moment. Let me connect you with a colleague who can help.", end: 'handover' },
      },
      {
        id: 'route-orders',
        type: 'branch',
        name: 'How many orders?',
        cases: [
          { label: 'none', when: 'vars.orderCount = 0', goto: 'no-orders' },
          { label: 'several', when: 'vars.orderCount > 1', goto: 'ask-order' },
        ],
        otherwise: 'pick-order',
      },
      { id: 'pick-order', type: 'set', name: 'Select the only order', assign: { selectedOrder: 'vars.orders[0]' }, next: 'route-shipment' },
      {
        id: 'ask-order',
        type: 'ask',
        name: 'Which order?',
        prompt: 'I can see {{vars.orderCount}} orders on your account. Which one are you asking about?',
        slot: 'orderChoice',
        saveAs: 'selectedOrder',
        options: {
          items: 'vars.orders',
          label: '{{item.items[0].name}} (order {{item.orderId}}, placed {{$substring(item.placedAt, 0, 10)}})',
          value: 'item',
        },
        onNoMatch: { say: "I couldn't match that to one of your orders. Let me connect you with a colleague who can help.", end: 'handover' },
        next: 'route-shipment',
      },
      {
        id: 'route-shipment',
        type: 'branch',
        name: 'Has it shipped?',
        cases: [{ label: 'has tracking', when: '$exists(vars.selectedOrder.shipment.trackingNumber)', goto: 'track' }],
        otherwise: 'status-no-shipment',
      },
      {
        id: 'status-no-shipment',
        type: 'say',
        text: "Your order {{vars.selectedOrder.orderId}} ({{vars.selectedOrder.items[0].name}}) is currently {{$lowercase($replace(vars.selectedOrder.status, '_', ' '))}} and hasn't shipped yet. The estimated delivery date is {{vars.selectedOrder.estimatedDelivery}}.",
        next: 'end-resolved',
      },
      {
        id: 'track',
        type: 'http',
        name: 'Carrier tracking',
        request: {
          method: 'GET',
          url: '{{env.CARRIER_BASE_URL}}/shipments/{{vars.selectedOrder.shipment.trackingNumber}}',
          headers: { 'X-Api-Key': '{{env.CARRIER_API_KEY}}' },
          timeoutMs: 3000,
        },
        retry: { maxAttempts: 2, backoffMs: 500, backoff: 'exponential', retryOn: [503, 429, 'timeout'] },
        mapping: { tracking: 'response.body', lastEvent: 'response.body.lastEvent.description', eta: 'response.body.estimatedDelivery' },
        onError: {
          say: "Your order {{vars.selectedOrder.orderId}} ({{vars.selectedOrder.items[0].name}}) has shipped with {{vars.selectedOrder.shipment.carrier}} and is estimated to arrive on {{vars.selectedOrder.estimatedDelivery}}. Live tracking is temporarily unavailable, so I can't see the latest scan right now — please check again a little later.",
          goto: 'end-resolved',
        },
      },
      {
        id: 'humanize',
        type: 'set',
        name: 'Translate carrier codes into customer language',
        assign: {
          statusText:
            '$lookup({"LABEL_CREATED": "waiting to be picked up by the carrier", "IN_TRANSIT": "in transit", "OUT_FOR_DELIVERY": "out for delivery today", "DELIVERED": "delivered", "EXCEPTION": "held up by a delivery exception", "RETURNED": "on its way back to our warehouse"}, vars.tracking.status)',
        },
      },
      {
        id: 'status-tracked',
        type: 'say',
        text: "Your order {{vars.selectedOrder.orderId}} ({{vars.selectedOrder.items[0].name}}) is {{vars.statusText}}. The latest update from {{vars.tracking.carrier}}: {{vars.lastEvent}} in {{vars.tracking.lastEvent.location}}. Estimated delivery: {{vars.eta}}.{{ vars.tracking.exception ? ' Please note: ' & vars.tracking.exception.description : '' }}",
        next: 'end-resolved',
      },
      { id: 'end-resolved', type: 'end', outcome: 'resolved' },
      {
        id: 'no-orders',
        type: 'say',
        text: "I've verified your account, {{vars.customer.firstName}}, but I don't see any orders on it. If you placed the order in the last few minutes it may still be registering, or it may be under a different account.",
        next: 'end-resolved',
      },
      {
        id: 'no-customer',
        type: 'say',
        text: "I'm sorry, I couldn't find an account with those details. Let me connect you with a colleague who can look into it further.",
        next: 'end-handover',
      },
      { id: 'end-handover', type: 'end', outcome: 'handover', reason: 'no customer match' },
    ],
  };
}
