/**
 * Structural validation of a WorkflowConfig with readable messages.
 * Used by the executor (before running) and the workspace editor (while editing).
 */
import { checkSyntax } from './expressions';
import type { Step, WorkflowConfig } from './types';

export interface ValidationProblem {
  severity: 'error' | 'warning';
  message: string;
  stepId?: string;
  path?: string;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STEP_TYPES = ['http', 'set', 'branch', 'ask', 'say', 'end'];
const OUTCOMES = ['resolved', 'handover', 'blocked', 'abandoned'];

export function validateWorkflow(config: unknown): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const err = (message: string, stepId?: string, path?: string) => problems.push({ severity: 'error', message, stepId, path });
  const warn = (message: string, stepId?: string, path?: string) => problems.push({ severity: 'warning', message, stepId, path });

  if (!config || typeof config !== 'object') {
    err('Workflow must be a JSON object.');
    return problems;
  }
  const wf = config as Partial<WorkflowConfig>;
  if (!wf.id || typeof wf.id !== 'string') err('Workflow needs a string "id".', undefined, 'id');
  if (!wf.name || typeof wf.name !== 'string') err('Workflow needs a string "name".', undefined, 'name');
  if (wf.env !== undefined && (typeof wf.env !== 'object' || Array.isArray(wf.env))) err('"env" must be an object of string values.', undefined, 'env');
  if (wf.variables !== undefined && (typeof wf.variables !== 'object' || Array.isArray(wf.variables))) err('"variables" must be an object.', undefined, 'variables');
  if (!Array.isArray(wf.steps)) {
    err('"steps" must be an array of steps.', undefined, 'steps');
    return problems;
  }
  if (wf.steps.length === 0) err('The workflow has no steps.', undefined, 'steps');

  const ids = new Set<string>();
  wf.steps.forEach((raw, i) => {
    const s = raw as Partial<Step> & Record<string, unknown>;
    const where = `steps[${i}]`;
    if (!s || typeof s !== 'object') {
      err(`${where} is not an object.`, undefined, where);
      return;
    }
    if (!s.id || typeof s.id !== 'string') {
      err(`${where} needs a string "id".`, undefined, `${where}.id`);
      return;
    }
    if (ids.has(s.id)) err(`Duplicate step id "${s.id}".`, s.id, `${where}.id`);
    ids.add(s.id);
    if (!s.type || !STEP_TYPES.includes(s.type as string)) {
      err(`Step "${s.id}" has unknown type "${String(s.type)}". Use one of ${STEP_TYPES.join(', ')}.`, s.id, `${where}.type`);
    }
  });

  const checkTarget = (target: unknown, stepId: string, path: string) => {
    if (target === undefined) return;
    if (typeof target !== 'string' || !ids.has(target)) err(`Step "${stepId}" references unknown step "${String(target)}" at ${path}.`, stepId, path);
  };
  const checkExpr = (expr: unknown, stepId: string, path: string) => {
    if (typeof expr !== 'string') {
      err(`Expression at ${path} in step "${stepId}" must be a string.`, stepId, path);
      return;
    }
    const problem = checkSyntax(expr);
    if (problem) err(`Invalid JSONata at ${path} in step "${stepId}": ${problem}`, stepId, path);
  };
  const checkRoute = (route: unknown, stepId: string, path: string) => {
    if (route === undefined) return;
    if (!route || typeof route !== 'object') {
      err(`${path} in step "${stepId}" must be an object.`, stepId, path);
      return;
    }
    const r = route as Record<string, unknown>;
    checkTarget(r.goto, stepId, `${path}.goto`);
    if (r.end !== undefined && !OUTCOMES.includes(r.end as string)) err(`${path}.end in step "${stepId}" must be one of ${OUTCOMES.join(', ')}.`, stepId, `${path}.end`);
    if (r.setVars) for (const [k, v] of Object.entries(r.setVars as Record<string, unknown>)) checkExpr(v, stepId, `${path}.setVars.${k}`);
  };

  for (const raw of wf.steps as Step[]) {
    const s = raw as Step & Record<string, unknown>;
    if (!s || typeof s !== 'object' || !s.id) continue;
    const where = `step "${s.id}"`;
    switch (s.type) {
      case 'http': {
        const req = s.request as unknown as Record<string, unknown> | undefined;
        if (!req || typeof req !== 'object') {
          err(`${where} needs a "request" object.`, s.id, 'request');
          break;
        }
        if (!HTTP_METHODS.includes(req.method as string)) err(`${where}: request.method must be one of ${HTTP_METHODS.join(', ')}.`, s.id, 'request.method');
        if (typeof req.url !== 'string' || !req.url.trim()) err(`${where}: request.url is required.`, s.id, 'request.url');
        if (req.timeoutMs !== undefined && (typeof req.timeoutMs !== 'number' || req.timeoutMs <= 0)) err(`${where}: request.timeoutMs must be a positive number.`, s.id, 'request.timeoutMs');
        if (req.headers && typeof req.headers === 'object') {
          for (const [k, v] of Object.entries(req.headers as Record<string, unknown>)) if (typeof v !== 'string') err(`${where}: header "${k}" must be a string.`, s.id, `request.headers.${k}`);
        }
        if (s.mapping) for (const [k, v] of Object.entries(s.mapping)) checkExpr(v, s.id, `mapping.${k}`);
        if (s.retry) {
          if (typeof s.retry.maxAttempts !== 'number' || s.retry.maxAttempts < 1) err(`${where}: retry.maxAttempts must be >= 1.`, s.id, 'retry.maxAttempts');
          if (s.retry.maxAttempts > 10) warn(`${where}: retry.maxAttempts of ${s.retry.maxAttempts} is unusually high; most systems recommend 2–4.`, s.id, 'retry.maxAttempts');
          if (typeof s.retry.backoffMs !== 'number' || s.retry.backoffMs < 0) err(`${where}: retry.backoffMs must be a non-negative number.`, s.id, 'retry.backoffMs');
        }
        checkRoute(s.onError, s.id, 'onError');
        checkTarget(s.next, s.id, 'next');
        if (!s.onError) warn(`${where} has no onError route: any failure (timeout, 4xx/5xx, malformed body) will abort the conversation.`, s.id, 'onError');
        break;
      }
      case 'set':
        if (!s.assign || typeof s.assign !== 'object') err(`${where} needs an "assign" object of variable → expression.`, s.id, 'assign');
        else for (const [k, v] of Object.entries(s.assign)) checkExpr(v, s.id, `assign.${k}`);
        checkTarget(s.next, s.id, 'next');
        break;
      case 'branch':
        if (!Array.isArray(s.cases) || s.cases.length === 0) err(`${where} needs a non-empty "cases" array.`, s.id, 'cases');
        else
          s.cases.forEach((c, i) => {
            checkExpr(c?.when, s.id, `cases[${i}].when`);
            if (!c?.goto) err(`${where}: cases[${i}] needs a goto.`, s.id, `cases[${i}].goto`);
            else checkTarget(c.goto, s.id, `cases[${i}].goto`);
          });
        checkTarget(s.otherwise, s.id, 'otherwise');
        break;
      case 'ask':
        if (typeof s.prompt !== 'string' || !s.prompt.trim()) err(`${where} needs a "prompt".`, s.id, 'prompt');
        if (typeof s.saveAs !== 'string' || !s.saveAs.trim()) err(`${where} needs "saveAs" (variable name).`, s.id, 'saveAs');
        if (typeof s.slot !== 'string' || !s.slot) err(`${where} needs a "slot" (what is being asked).`, s.id, 'slot');
        if (s.options) {
          checkExpr(s.options.items, s.id, 'options.items');
          if (typeof s.options.label !== 'string') err(`${where}: options.label must be a template string.`, s.id, 'options.label');
          if (s.options.value !== undefined) checkExpr(s.options.value, s.id, 'options.value');
          if (!s.onNoMatch) warn(`${where} offers options but has no onNoMatch route.`, s.id, 'onNoMatch');
        }
        checkRoute(s.onNoMatch, s.id, 'onNoMatch');
        checkTarget(s.next, s.id, 'next');
        break;
      case 'say':
        if (typeof s.text !== 'string' || !s.text.trim()) err(`${where} needs "text".`, s.id, 'text');
        checkTarget(s.next, s.id, 'next');
        break;
      case 'end':
        if (!OUTCOMES.includes(s.outcome)) err(`${where}: outcome must be one of ${OUTCOMES.join(', ')}.`, s.id, 'outcome');
        break;
      default:
        break;
    }
  }
  return problems;
}
