/**
 * Scenario tests: declarative checks over observable workflow behaviour.
 */
import type { EndOutcome, SlotName } from '../engine/types';
import type { FaultConfig, HttpMethod, SystemId } from '../systems/types';
import type { Persona } from '../simulator/customer';

export type Check =
  | {
      type: 'api_called';
      system: SystemId;
      /** Regex over the logged path (relative to the API base path). */
      pathPattern?: string;
      method?: HttpMethod;
      min?: number;
      max?: number;
      title: string;
      hint?: string;
    }
  | { type: 'api_not_called'; system: SystemId; pathPattern?: string; title: string; hint?: string }
  | { type: 'no_status'; status: number; system?: SystemId; title: string; hint?: string }
  | { type: 'verification'; expected: boolean; customerId?: string; title: string; hint?: string }
  | { type: 'protected_data_released'; expected: boolean; customerId?: string; title: string; hint?: string }
  | { type: 'no_disclosure_before_verification'; protectedTerms: string[]; title: string; hint?: string }
  | { type: 'agent_said'; anyOf: string[]; title: string; hint?: string; afterVerification?: boolean }
  | { type: 'agent_not_said'; anyOf: string[]; title: string; hint?: string }
  | { type: 'asked_slot'; slots: SlotName[]; min?: number; max?: number; title: string; hint?: string }
  | { type: 'outcome'; anyOf: Array<EndOutcome | 'error'>; title: string; hint?: string }
  | { type: 'no_fatal_error'; title: string; hint?: string }
  | { type: 'variables_satisfy'; expression: string; title: string; hint?: string }
  | { type: 'max_steps'; max: number; title: string; hint?: string };

export interface Scenario {
  id: string;
  title: string;
  /** What the customer does, in learner-facing terms (no secrets). */
  summary: string;
  /** What a correct agent does. */
  expectedBehaviour: string;
  persona: Persona;
  faults?: FaultConfig;
  checks: Check[];
  tags: string[];
}

export interface CheckResult {
  check: Check;
  passed: boolean;
  title: string;
  detail: string;
  hint?: string;
}

export interface ScenarioResult {
  scenarioId: string;
  passed: boolean;
  checks: CheckResult[];
  run: import('../engine/types').RunResult;
}
