/**
 * Synthetic practice data for the four mock business systems.
 *
 * Everything here is fictional. Phone numbers use the reserved 555-01xx range,
 * e-mail addresses use example.com, and people do not exist.
 *
 * IMPORTANT DESIGN RULE: verification factors (date of birth, postal code) live
 * ONLY in `identityFixtures`. The customer-master API never returns them, the
 * verification API never echoes them, and the trainer redacts them from traces.
 */

export type CustomerStatus = 'ACTIVE' | 'INACTIVE';
export type AccountType = 'PERSONAL' | 'BUSINESS';

export interface CustomerRecord {
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string; // E.164
  city: string;
  state: string;
  country: string;
  status: CustomerStatus;
  accountType: AccountType;
  loyaltyTier: 'NONE' | 'SILVER' | 'GOLD';
  createdAt: string;
  notes?: string;
}

/** Verification factors per customer. Never returned by any API. */
export interface IdentityRecord {
  customerId: string;
  dateOfBirth: string; // YYYY-MM-DD
  postalCode: string;
}

export type OrderStatus =
  | 'PROCESSING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELAYED'
  | 'CANCELLED'
  | 'RETURNED';

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderRecord {
  orderId: string;
  customerId: string;
  status: OrderStatus;
  placedAt: string;
  items: OrderItem[];
  currency: 'USD';
  total: number;
  shipment: { carrier: string; trackingNumber: string } | null;
  estimatedDelivery: string | null;
}

export interface ShipmentEvent {
  code: string;
  description: string;
  location: string;
  timestamp: string;
}

export interface ShipmentRecord {
  trackingNumber: string;
  carrier: string;
  status: 'LABEL_CREATED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'EXCEPTION' | 'RETURNED';
  estimatedDelivery: string | null;
  events: ShipmentEvent[];
  exception?: { code: string; description: string } | null;
}

/**
 * Sandbox credentials. These are NOT secrets: they are published in the
 * practice-system documentation so learners can practise authentication.
 */
export const sandboxCredentials = {
  crmBearerToken: 'crm-sandbox-token-7f3a',
  verificationBearerToken: 'verify-sandbox-token-91c2',
  ordersApiKey: 'oms-sandbox-key-4d8e',
  carrierApiKey: 'carrier-sandbox-key-2b61',
} as const;

export const customerFixtures: CustomerRecord[] = [
  {
    customerId: 'CUST-1001',
    firstName: 'Priya',
    lastName: 'Raman',
    email: 'priya.raman@example.com',
    phone: '+16025550101',
    city: 'Phoenix',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'GOLD',
    createdAt: '2022-04-11T15:22:00Z',
  },
  {
    customerId: 'CUST-1002',
    firstName: 'Maria',
    lastName: 'Garcia',
    email: 'maria.garcia@example.com',
    phone: '+16025550102',
    city: 'Scottsdale',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'SILVER',
    createdAt: '2021-09-03T10:05:00Z',
  },
  {
    // Deliberate duplicate: same person, same phone, separate business account.
    customerId: 'CUST-1003',
    firstName: 'Maria',
    lastName: 'Garcia',
    email: 'm.garcia@garcia-consulting.example.com',
    phone: '+16025550102',
    city: 'Scottsdale',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'BUSINESS',
    loyaltyTier: 'NONE',
    createdAt: '2024-02-19T09:41:00Z',
    notes: 'Business account created via partner portal; shares phone with CUST-1002.',
  },
  {
    customerId: 'CUST-1004',
    firstName: 'Tom',
    lastName: 'Becker',
    email: 'tom.becker@example.com',
    phone: '+16025550104',
    city: 'Tempe',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'NONE',
    createdAt: '2023-06-30T18:12:00Z',
  },
  {
    customerId: 'CUST-1005',
    firstName: 'Wei',
    lastName: 'Chen',
    email: 'wei.chen@example.com',
    phone: '+16025550105',
    city: 'Phoenix',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'GOLD',
    createdAt: '2020-01-15T12:00:00Z',
  },
  {
    customerId: 'CUST-1006',
    firstName: 'Aisha',
    lastName: 'Okafor',
    email: 'aisha.okafor@example.com',
    phone: '+16025550106',
    city: 'Chandler',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'NONE',
    createdAt: '2026-08-28T20:30:00Z',
  },
  {
    customerId: 'CUST-1007',
    firstName: 'Lucas',
    lastName: 'Moreau',
    email: 'lucas.moreau@example.com',
    phone: '+16025550107',
    city: 'Mesa',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'SILVER',
    createdAt: '2022-11-08T08:08:00Z',
  },
  {
    customerId: 'CUST-1008',
    firstName: 'Fatima',
    lastName: 'Al-Sayed',
    email: 'fatima.alsayed@example.com',
    phone: '+16025550108',
    city: 'Glendale',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'NONE',
    createdAt: '2023-03-21T14:45:00Z',
  },
  {
    customerId: 'CUST-1009',
    firstName: 'Daniel',
    lastName: 'Kim',
    email: 'daniel.kim@example.com',
    phone: '+16025550109',
    city: 'Scottsdale',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'GOLD',
    createdAt: '2019-07-07T07:07:00Z',
  },
  {
    customerId: 'CUST-1010',
    firstName: 'Sofia',
    lastName: 'Garcia',
    email: 'sofia.garcia@example.com',
    phone: '+16025550110',
    city: 'Gilbert',
    state: 'AZ',
    country: 'US',
    status: 'ACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'NONE',
    createdAt: '2025-05-05T05:05:00Z',
  },
  {
    // Inactive legacy record: a merged duplicate that still shows up in searches.
    customerId: 'CUST-0420',
    firstName: 'Daniel',
    lastName: 'Kim',
    email: 'dkim.legacy@example.com',
    phone: '+16025550109',
    city: 'Scottsdale',
    state: 'AZ',
    country: 'US',
    status: 'INACTIVE',
    accountType: 'PERSONAL',
    loyaltyTier: 'NONE',
    createdAt: '2016-02-02T02:02:00Z',
    notes: 'Merged into CUST-1009 during 2021 CRM migration.',
  },
];

export const identityFixtures: IdentityRecord[] = [
  { customerId: 'CUST-1001', dateOfBirth: '1988-03-14', postalCode: '85004' },
  { customerId: 'CUST-1002', dateOfBirth: '1979-11-02', postalCode: '85251' },
  { customerId: 'CUST-1003', dateOfBirth: '1979-11-02', postalCode: '85251' },
  { customerId: 'CUST-1004', dateOfBirth: '1990-07-22', postalCode: '85281' },
  { customerId: 'CUST-1005', dateOfBirth: '1985-01-30', postalCode: '85016' },
  { customerId: 'CUST-1006', dateOfBirth: '1993-09-09', postalCode: '85254' },
  { customerId: 'CUST-1007', dateOfBirth: '1982-05-17', postalCode: '85224' },
  { customerId: 'CUST-1008', dateOfBirth: '1996-12-01', postalCode: '85302' },
  { customerId: 'CUST-1009', dateOfBirth: '1975-04-04', postalCode: '85258' },
  { customerId: 'CUST-1010', dateOfBirth: '2000-08-20', postalCode: '85234' },
  { customerId: 'CUST-0420', dateOfBirth: '1975-04-04', postalCode: '85258' },
];

export const orderFixtures: OrderRecord[] = [
  {
    orderId: 'ORD-10021',
    customerId: 'CUST-1001',
    status: 'IN_TRANSIT',
    placedAt: '2026-09-08T16:40:00Z',
    items: [{ sku: 'SKU-STAND-01', name: 'Adjustable Laptop Stand', quantity: 1, unitPrice: 49.0 }],
    currency: 'USD',
    total: 49.0,
    shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-2201' },
    estimatedDelivery: '2026-09-16',
  },
  {
    orderId: 'ORD-10030',
    customerId: 'CUST-1002',
    status: 'DELIVERED',
    placedAt: '2026-08-30T11:15:00Z',
    items: [{ sku: 'SKU-KETTLE-02', name: 'Electric Gooseneck Kettle', quantity: 1, unitPrice: 79.0 }],
    currency: 'USD',
    total: 79.0,
    shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-1830' },
    estimatedDelivery: '2026-09-04',
  },
  {
    orderId: 'ORD-10031',
    customerId: 'CUST-1003',
    status: 'PROCESSING',
    placedAt: '2026-09-12T09:00:00Z',
    items: [{ sku: 'SKU-PAPER-A4', name: 'Office Paper, 10 reams', quantity: 4, unitPrice: 42.0 }],
    currency: 'USD',
    total: 168.0,
    shipment: null,
    estimatedDelivery: '2026-09-18',
  },
  {
    orderId: 'ORD-10040',
    customerId: 'CUST-1004',
    status: 'SHIPPED',
    placedAt: '2026-09-10T13:20:00Z',
    items: [{ sku: 'SKU-TENT-3P', name: '3-Person Camping Tent', quantity: 1, unitPrice: 189.0 }],
    currency: 'USD',
    total: 189.0,
    shipment: { carrier: 'RoadRunner Freight', trackingNumber: 'RR-55010-4' },
    estimatedDelivery: '2026-09-15',
  },
  {
    orderId: 'ORD-10041',
    customerId: 'CUST-1004',
    status: 'DELAYED',
    placedAt: '2026-09-02T08:45:00Z',
    items: [{ sku: 'SKU-BAG-SLP', name: 'Sleeping Bag (0°C)', quantity: 2, unitPrice: 95.0 }],
    currency: 'USD',
    total: 190.0,
    shipment: { carrier: 'RoadRunner Freight', trackingNumber: 'RR-55010-2' },
    estimatedDelivery: '2026-09-19',
  },
  {
    orderId: 'ORD-10050',
    customerId: 'CUST-1005',
    status: 'DELIVERED',
    placedAt: '2026-08-20T17:30:00Z',
    items: [{ sku: 'SKU-SHOE-RUN', name: 'Trail Running Shoes', quantity: 1, unitPrice: 129.0 }],
    currency: 'USD',
    total: 129.0,
    shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-1502' },
    estimatedDelivery: '2026-08-25',
  },
  {
    orderId: 'ORD-10051',
    customerId: 'CUST-1005',
    status: 'IN_TRANSIT',
    placedAt: '2026-09-09T12:10:00Z',
    items: [{ sku: 'SKU-HEAD-BT', name: 'Wireless Headphones', quantity: 1, unitPrice: 159.0 }],
    currency: 'USD',
    total: 159.0,
    shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-2310' },
    estimatedDelivery: '2026-09-17',
  },
  {
    orderId: 'ORD-10052',
    customerId: 'CUST-1005',
    status: 'PROCESSING',
    placedAt: '2026-09-13T21:05:00Z',
    items: [{ sku: 'SKU-MAT-YOGA', name: 'Yoga Mat', quantity: 1, unitPrice: 35.0 }],
    currency: 'USD',
    total: 35.0,
    shipment: null,
    estimatedDelivery: '2026-09-20',
  },
  {
    orderId: 'ORD-10070',
    customerId: 'CUST-1007',
    status: 'SHIPPED',
    placedAt: '2026-09-11T10:00:00Z',
    items: [{ sku: 'SKU-CHAIR-ERG', name: 'Ergonomic Office Chair', quantity: 1, unitPrice: 349.0 }],
    currency: 'USD',
    total: 349.0,
    shipment: { carrier: 'RoadRunner Freight', trackingNumber: 'RR-55011-9' },
    estimatedDelivery: '2026-09-18',
  },
  {
    orderId: 'ORD-10080',
    customerId: 'CUST-1008',
    status: 'RETURNED',
    placedAt: '2026-08-12T15:00:00Z',
    items: [{ sku: 'SKU-LAMP-DSK', name: 'LED Desk Lamp', quantity: 1, unitPrice: 45.0 }],
    currency: 'USD',
    total: 45.0,
    shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-1210' },
    estimatedDelivery: '2026-08-16',
  },
  {
    orderId: 'ORD-10081',
    customerId: 'CUST-1008',
    status: 'CANCELLED',
    placedAt: '2026-09-01T09:30:00Z',
    items: [{ sku: 'SKU-MUG-SET', name: 'Ceramic Mug Set', quantity: 1, unitPrice: 28.0 }],
    currency: 'USD',
    total: 28.0,
    shipment: null,
    estimatedDelivery: null,
  },
  {
    orderId: 'ORD-10090',
    customerId: 'CUST-1009',
    status: 'IN_TRANSIT',
    placedAt: '2026-09-07T19:20:00Z',
    items: [{ sku: 'SKU-BIKE-LGT', name: 'Bicycle Light Set', quantity: 1, unitPrice: 39.0 }],
    currency: 'USD',
    total: 39.0,
    shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-2150' },
    estimatedDelivery: '2026-09-15',
  },
  {
    orderId: 'ORD-10100',
    customerId: 'CUST-1010',
    status: 'DELIVERED',
    placedAt: '2026-08-25T14:14:00Z',
    items: [{ sku: 'SKU-BOOK-ARC', name: 'Enterprise Integration Patterns (hardcover)', quantity: 1, unitPrice: 62.0 }],
    currency: 'USD',
    total: 62.0,
    shipment: { carrier: 'SwiftParcel', trackingNumber: 'SP-7781-1660' },
    estimatedDelivery: '2026-08-29',
  },
];

export const shipmentFixtures: ShipmentRecord[] = [
  {
    trackingNumber: 'SP-7781-2201',
    carrier: 'SwiftParcel',
    status: 'IN_TRANSIT',
    estimatedDelivery: '2026-09-16',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-09-09T14:02:00Z' },
      { code: 'DP', description: 'Departed sorting facility', location: 'Phoenix, AZ', timestamp: '2026-09-10T03:15:00Z' },
      { code: 'AR', description: 'Arrived at regional hub', location: 'Tucson, AZ', timestamp: '2026-09-13T22:40:00Z' },
    ],
    exception: null,
  },
  {
    trackingNumber: 'SP-7781-1830',
    carrier: 'SwiftParcel',
    status: 'DELIVERED',
    estimatedDelivery: '2026-09-04',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-08-31T15:00:00Z' },
      { code: 'OD', description: 'Out for delivery', location: 'Scottsdale, AZ', timestamp: '2026-09-03T12:30:00Z' },
      { code: 'DL', description: 'Delivered — left at front door', location: 'Scottsdale, AZ', timestamp: '2026-09-03T16:48:00Z' },
    ],
    exception: null,
  },
  {
    trackingNumber: 'RR-55010-4',
    carrier: 'RoadRunner Freight',
    status: 'IN_TRANSIT',
    estimatedDelivery: '2026-09-15',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Tempe, AZ', timestamp: '2026-09-11T09:10:00Z' },
      { code: 'DP', description: 'Departed facility', location: 'Tempe, AZ', timestamp: '2026-09-12T01:00:00Z' },
    ],
    exception: null,
  },
  {
    trackingNumber: 'RR-55010-2',
    carrier: 'RoadRunner Freight',
    status: 'EXCEPTION',
    estimatedDelivery: '2026-09-19',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Tempe, AZ', timestamp: '2026-09-03T11:00:00Z' },
      { code: 'EX', description: 'Weather delay at hub', location: 'Flagstaff, AZ', timestamp: '2026-09-06T20:15:00Z' },
    ],
    exception: { code: 'WEATHER', description: 'Shipment held due to severe weather; new estimate issued.' },
  },
  {
    trackingNumber: 'SP-7781-1502',
    carrier: 'SwiftParcel',
    status: 'DELIVERED',
    estimatedDelivery: '2026-08-25',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-08-21T13:00:00Z' },
      { code: 'DL', description: 'Delivered — handed to resident', location: 'Phoenix, AZ', timestamp: '2026-08-24T17:20:00Z' },
    ],
    exception: null,
  },
  {
    trackingNumber: 'SP-7781-2310',
    carrier: 'SwiftParcel',
    status: 'IN_TRANSIT',
    estimatedDelivery: '2026-09-17',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-09-10T15:45:00Z' },
      { code: 'DP', description: 'Departed sorting facility', location: 'Phoenix, AZ', timestamp: '2026-09-11T04:20:00Z' },
    ],
    exception: null,
  },
  {
    trackingNumber: 'RR-55011-9',
    carrier: 'RoadRunner Freight',
    status: 'IN_TRANSIT',
    estimatedDelivery: '2026-09-18',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Mesa, AZ', timestamp: '2026-09-12T08:30:00Z' },
    ],
    exception: null,
  },
  {
    trackingNumber: 'SP-7781-1210',
    carrier: 'SwiftParcel',
    status: 'RETURNED',
    estimatedDelivery: null,
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-08-13T10:00:00Z' },
      { code: 'DL', description: 'Delivered', location: 'Glendale, AZ', timestamp: '2026-08-15T14:00:00Z' },
      { code: 'RT', description: 'Return received at warehouse', location: 'Phoenix, AZ', timestamp: '2026-08-29T09:00:00Z' },
    ],
    exception: null,
  },
  {
    trackingNumber: 'SP-7781-2150',
    carrier: 'SwiftParcel',
    status: 'EXCEPTION',
    estimatedDelivery: '2026-09-15',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-09-08T12:00:00Z' },
      { code: 'EX', description: 'Address needs clarification', location: 'Scottsdale, AZ', timestamp: '2026-09-12T13:00:00Z' },
    ],
    exception: { code: 'ADDRESS', description: 'Carrier could not locate the delivery address; awaiting clarification.' },
  },
  {
    trackingNumber: 'SP-7781-1660',
    carrier: 'SwiftParcel',
    status: 'DELIVERED',
    estimatedDelivery: '2026-08-29',
    events: [
      { code: 'PU', description: 'Picked up by carrier', location: 'Phoenix, AZ', timestamp: '2026-08-26T09:00:00Z' },
      { code: 'DL', description: 'Delivered — left with neighbour', location: 'Gilbert, AZ', timestamp: '2026-08-28T15:30:00Z' },
    ],
    exception: null,
  },
];
