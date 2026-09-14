import type { Persona } from './customer';

/**
 * Scripted customers used by the scenarios. Answers for dateOfBirth and
 * postalCode are the simulated caller's own knowledge; the trainer never shows
 * them in traces and no API returns them.
 */

export const personas = {
  priya: <Persona>{
    id: 'priya-raman',
    displayName: 'Priya Raman',
    description: 'Existing customer with one order in transit. Volunteers her phone number and answers both verification questions correctly.',
    opening: "Hi, I'm calling about my order — where is it? My phone number is 602-555-0101.",
    openingSlots: { phone: '602-555-0101' },
    answers: {
      phone: '602-555-0101',
      email: 'priya.raman@example.com',
      lastName: 'Raman',
      dateOfBirth: '1988-03-14',
      postalCode: '85004',
      confirmation: 'Yes',
      accountType: 'personal',
    },
    choices: { orderChoice: { labelContains: ['ORD-10021', 'laptop stand'] } },
  },
  maria: <Persona>{
    id: 'maria-garcia',
    displayName: 'Maria Garcia',
    description: 'Has two active accounts (personal and business) that share one phone number. Knows which account she means: the personal one.',
    opening: "Hello, I'd like to know where my order is. My number is 602-555-0102.",
    openingSlots: { phone: '602-555-0102' },
    answers: {
      phone: '602-555-0102',
      email: 'maria.garcia@example.com',
      lastName: 'Garcia',
      accountType: 'personal',
      customerId: 'CUST-1002',
      dateOfBirth: '1979-11-02',
      postalCode: '85251',
      confirmation: 'Yes',
    },
    choices: {
      customerChoice: { labelContains: ['personal', 'maria.garcia@example.com', 'm***a@example.com', 'CUST-1002'], fallbackText: 'The personal one, with my personal email.' },
      orderChoice: { labelContains: ['ORD-10030', 'kettle'] },
    },
  },
  tom: <Persona>{
    id: 'tom-becker',
    displayName: 'Tom Becker',
    description: 'Existing customer with two orders. Gives a date of birth that does NOT match the record, so verification must fail.',
    opening: 'Hi there, where is my order? You can find me under 602-555-0104.',
    openingSlots: { phone: '602-555-0104' },
    answers: {
      phone: '602-555-0104',
      email: 'tom.becker@example.com',
      lastName: 'Becker',
      dateOfBirth: '1990-07-23',
      postalCode: '85281',
      confirmation: 'Yes',
      accountType: 'personal',
    },
    choices: { orderChoice: { labelContains: ['tent', 'ORD-10040'] } },
  },
  wei: <Persona>{
    id: 'wei-chen',
    displayName: 'Wei Chen',
    description: 'Existing customer with three orders (one delivered, one in transit, one processing). Wants the wireless headphones order.',
    opening: "Where's my order? I placed it last week. My email is wei.chen@example.com.",
    openingSlots: { email: 'wei.chen@example.com' },
    answers: {
      phone: '602-555-0105',
      email: 'wei.chen@example.com',
      lastName: 'Chen',
      dateOfBirth: '1985-01-30',
      postalCode: '85016',
      orderChoice: 'headphones',
      confirmation: 'Yes',
      accountType: 'personal',
    },
    choices: { orderChoice: { labelContains: ['headphones', 'ORD-10051'], fallbackText: 'The one with the wireless headphones.' } },
  },
  aisha: <Persona>{
    id: 'aisha-okafor',
    displayName: 'Aisha Okafor',
    description: 'New customer who has not placed any order yet, but believes she has. Verifies correctly.',
    opening: 'Hi, can you check on my order? My phone is 602-555-0106.',
    openingSlots: { phone: '602-555-0106' },
    answers: {
      phone: '602-555-0106',
      email: 'aisha.okafor@example.com',
      lastName: 'Okafor',
      dateOfBirth: '1993-09-09',
      postalCode: '85254',
      confirmation: 'Yes',
      accountType: 'personal',
    },
  },
  lucas: <Persona>{
    id: 'lucas-moreau',
    displayName: 'Lucas Moreau',
    description: 'Existing customer with one shipped order. Verifies correctly. Used for the carrier-outage scenario.',
    opening: "Hello, I'm wondering where my chair delivery is. My phone number is 602-555-0107.",
    openingSlots: { phone: '602-555-0107' },
    answers: {
      phone: '602-555-0107',
      email: 'lucas.moreau@example.com',
      lastName: 'Moreau',
      dateOfBirth: '1982-05-17',
      postalCode: '85224',
      confirmation: 'Yes',
      accountType: 'personal',
    },
    choices: { orderChoice: { labelContains: ['chair', 'ORD-10070'] } },
  },
  unknown: <Persona>{
    id: 'unknown-caller',
    displayName: 'Unknown caller',
    description: 'Caller whose phone number and email are not in the customer master.',
    opening: "Hi, where's my order? My phone number is 602-555-0199.",
    openingSlots: { phone: '602-555-0199' },
    answers: {
      phone: '602-555-0199',
      email: 'sam.nguyen@example.com',
      lastName: 'Nguyen',
      dateOfBirth: '1991-01-01',
      postalCode: '85000',
      confirmation: 'Yes',
      accountType: 'personal',
    },
    unknownAnswer: "I don't have any other details, sorry.",
  },
  daniel: <Persona>{
    id: 'daniel-kim',
    displayName: 'Daniel Kim',
    description: 'Long-standing customer whose phone number also matches an INACTIVE legacy record from a CRM migration.',
    opening: 'Hi, I need an update on my bicycle light order. Phone number 602-555-0109.',
    openingSlots: { phone: '602-555-0109' },
    answers: {
      phone: '602-555-0109',
      email: 'daniel.kim@example.com',
      lastName: 'Kim',
      customerId: 'CUST-1009',
      dateOfBirth: '1975-04-04',
      postalCode: '85258',
      confirmation: 'Yes',
      accountType: 'personal',
    },
    choices: {
      customerChoice: { labelContains: ['daniel.kim@example.com', 'd***m@example.com', 'CUST-1009', 'active'] },
      orderChoice: { labelContains: ['light', 'ORD-10090'] },
    },
  },
};

export const personaList: Persona[] = Object.values(personas);

export function findPersona(id: string): Persona | undefined {
  return personaList.find((p) => p.id === id);
}
