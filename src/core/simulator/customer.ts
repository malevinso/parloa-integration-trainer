/**
 * Deterministic conversation simulator.
 *
 * A Persona is a scripted customer: an opening line, the identifiers they
 * volunteer up-front, and the answer they give for each kind of question the
 * agent may ask (a "slot"). No language model is involved: the persona answers
 * by slot, and picks options by matching label text. That keeps runs
 * repeatable, which is what makes the graded scenarios meaningful.
 *
 * NOTE: persona answers for dateOfBirth/postalCode are the simulated customer's
 * knowledge. The trainer redacts them from traces; they are never returned by
 * any practice API.
 */
import type { AskQuestion, Customer, CustomerAnswer } from '../engine/executor';
import type { SlotName } from '../engine/types';

export interface OptionChoice {
  /** Pick the first option whose label contains any of these (case-insensitive). */
  labelContains?: string[];
  /** Or pick by index. */
  index?: number;
  /** What the customer says if nothing matches. */
  fallbackText?: string;
}

export interface Persona {
  id: string;
  displayName: string;
  /** Short description shown to learners (no secrets). */
  description: string;
  opening: string;
  /** Identifiers the customer volunteers in the opening line. */
  openingSlots: Partial<Record<SlotName, string>>;
  /** Scripted answer per slot. */
  answers: Partial<Record<SlotName, string>>;
  /** How the customer picks from offered options, per slot. */
  choices?: Partial<Record<SlotName, OptionChoice>>;
  /** Said when asked something they have no answer for. */
  unknownAnswer?: string;
}

export interface SimulatorTurn {
  question: AskQuestion;
  answer: CustomerAnswer;
}

export class ScriptedCustomer implements Customer {
  readonly turns: SimulatorTurn[] = [];

  constructor(private readonly persona: Persona) {}

  opening() {
    const slots: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.persona.openingSlots)) if (v !== undefined) slots[k] = v;
    return { text: this.persona.opening, slots };
  }

  async answer(question: AskQuestion): Promise<CustomerAnswer> {
    const answer = this.decide(question);
    this.turns.push({ question, answer });
    return answer;
  }

  private decide(question: AskQuestion): CustomerAnswer {
    const p = this.persona;
    if (question.options && question.options.length) {
      const choice = p.choices?.[question.slot];
      if (choice?.index !== undefined && choice.index >= 0 && choice.index < question.options.length) {
        return { text: question.options[choice.index].label, optionIndex: choice.index };
      }
      if (choice?.labelContains) {
        for (const needle of choice.labelContains) {
          const idx = question.options.findIndex((o) => o.label.toLowerCase().includes(needle.toLowerCase()));
          if (idx >= 0) return { text: question.options[idx].label, optionIndex: idx };
        }
      }
      // Try to match the scripted answer for the slot against the labels.
      const scripted = p.answers[question.slot];
      if (scripted) {
        const idx = question.options.findIndex((o) => o.label.toLowerCase().includes(scripted.toLowerCase()));
        if (idx >= 0) return { text: question.options[idx].label, optionIndex: idx };
      }
      if (question.options.length === 1 && question.slot === 'confirmation') {
        return { text: question.options[0].label, optionIndex: 0 };
      }
      return { text: choice?.fallbackText ?? p.unknownAnswer ?? "I'm not sure which one you mean.", optionIndex: null };
    }
    const scripted = p.answers[question.slot] ?? p.openingSlots[question.slot];
    if (scripted !== undefined) return { text: scripted, optionIndex: null };
    if (question.slot === 'confirmation') return { text: 'Yes', optionIndex: null };
    return { text: p.unknownAnswer ?? "Sorry, I don't have that to hand.", optionIndex: null };
  }
}

/**
 * A customer driven by a human in the UI. `answer` resolves when the UI
 * supplies the next line.
 */
export class InteractiveCustomer implements Customer {
  private pending: ((answer: CustomerAnswer) => void) | null = null;
  onQuestion: ((question: AskQuestion) => void) | null = null;

  constructor(private readonly openingText: string, private readonly slots: Record<string, string> = {}) {}

  opening() {
    return { text: this.openingText, slots: { ...this.slots } };
  }

  answer(question: AskQuestion): Promise<CustomerAnswer> {
    return new Promise((resolve) => {
      this.pending = resolve;
      this.onQuestion?.(question);
    });
  }

  /** Called by the UI when the human types a reply. */
  reply(text: string, optionIndex: number | null = null) {
    const resolve = this.pending;
    this.pending = null;
    resolve?.({ text, optionIndex });
  }

  get waiting() {
    return this.pending !== null;
  }
}
