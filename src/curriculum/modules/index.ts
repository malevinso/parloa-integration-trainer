import type { Module } from '../types';
import { m1 } from './m1-architecture';
import { m2 } from './m2-lookup';
import { m3 } from './m3-auth';
import { m4 } from './m4-mapping';
import { m5 } from './m5-verification';
import { m6 } from './m6-branching';
import { m7 } from './m7-resilience';
import { m8 } from './m8-testing';
import { m9 } from './m9-capstone';

/**
 * The learning path, in order. To add a module: create a file exporting a
 * Module, import it here, and give it a unique id and order. Scenario ids must
 * exist in src/core/simulator/scenarios.ts and starter ids in
 * src/core/workflows/starters.ts (both are checked by tests/curriculum.test.ts).
 */
export const modules: Module[] = [m1, m2, m3, m4, m5, m6, m7, m8, m9].sort((a, b) => a.order - b.order);

export function getModule(id: string): Module | undefined {
  return modules.find((m) => m.id === id);
}
