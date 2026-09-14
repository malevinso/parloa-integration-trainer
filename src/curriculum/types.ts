/**
 * Curriculum model. Content lives in src/curriculum/modules/*.ts; see the
 * README section "Adding lessons and scenarios".
 */

export type SourceKind = 'parloa-docs' | 'parloa-site' | 'external';

export interface Reference {
  title: string;
  url: string;
  kind: SourceKind;
  /** One line on what the source supports. */
  note?: string;
}

export interface LessonSection {
  heading: string;
  /** Markdown (see src/ui/Markdown.tsx for the supported subset, including [!PARLOA] / [!GENERAL] / [!SIM] callouts). */
  body: string;
}

export interface WorkedExample {
  title: string;
  /** Markdown */
  body: string;
  /** Starter id to load into the workspace so the learner can run the example. */
  workflowId?: string;
  /** Scenario to run the example against. */
  scenarioId?: string;
}

export interface Exercise {
  title: string;
  /** Markdown */
  instructions: string;
  /** Starter workflow id (src/core/workflows/starters.ts). */
  starterWorkflowId: string;
  /** Scenario ids graded for this exercise. */
  scenarioIds: string[];
  /** Markdown */
  completionCriteria: string;
  /** Progressive hints, revealed one at a time. */
  hints: string[];
  /** Optional solution workflow id that can be revealed after an attempt. */
  solutionWorkflowId?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  choices: string[];
  /** Index of the correct choice. */
  answer: number;
  explanation: string;
}

export interface Module {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  /** Markdown */
  objective: string;
  sections: LessonSection[];
  workedExample: WorkedExample;
  exercise: Exercise;
  quiz: QuizQuestion[];
  references: Reference[];
}
