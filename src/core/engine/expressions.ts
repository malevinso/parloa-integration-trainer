/**
 * Expression evaluation (JSONata) and {{ }} templating.
 */
import jsonata from 'jsonata';

export class ExpressionError extends Error {
  constructor(
    message: string,
    public readonly expression: string,
    public readonly code: string = 'EXPRESSION_ERROR',
  ) {
    super(message);
    this.name = 'ExpressionError';
  }
}

const cache = new Map<string, ReturnType<typeof jsonata>>();

function compile(expression: string) {
  let compiled = cache.get(expression);
  if (!compiled) {
    try {
      compiled = jsonata(expression);
    } catch (err) {
      const e = err as { message?: string; code?: string; position?: number };
      throw new ExpressionError(
        `JSONata syntax error${e.position !== undefined ? ` at position ${e.position}` : ''}: ${e.message ?? String(err)}`,
        expression,
        'EXPRESSION_SYNTAX',
      );
    }
    cache.set(expression, compiled);
  }
  return compiled;
}

/** Evaluate a JSONata expression against a context object. */
export async function evaluate(expression: string, context: unknown): Promise<unknown> {
  const trimmed = expression.trim();
  if (!trimmed) return undefined;
  const compiled = compile(trimmed);
  try {
    const result = await compiled.evaluate(context);
    return unwrapSequence(result);
  } catch (err) {
    const e = err as { message?: string; code?: string; token?: string };
    throw new ExpressionError(`JSONata evaluation error${e.code ? ` (${e.code})` : ''}: ${e.message ?? String(err)}`, expression, 'EXPRESSION_RUNTIME');
  }
}

/** JSONata returns "sequence" arrays with extra props; copy into plain JSON. */
function unwrapSequence(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(unwrapSequence);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = unwrapSequence(v);
    return out;
  }
  return value;
}

/** Truthiness following JSONata's $boolean() rules. */
export function truthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.some(truthy);
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return Boolean(value);
}

/** Convert an expression result to text for speaking or for URLs/headers. */
export function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(stringify).join(', ');
  return JSON.stringify(value);
}

const TEMPLATE_RE = /\{\{\s*([\s\S]+?)\s*\}\}/g;

/** Does the text contain any {{ }} placeholders? */
export function hasTemplate(text: string): boolean {
  return TEMPLATE_RE.test(text) && ((TEMPLATE_RE.lastIndex = 0), true);
}

/**
 * Render a {{ expression }} template. Each placeholder is a JSONata expression.
 * Returns the rendered text plus the individual placeholder values (for traces).
 */
export async function renderTemplate(
  template: string,
  context: unknown,
): Promise<{ text: string; parts: Array<{ expression: string; value: unknown }> }> {
  const parts: Array<{ expression: string; value: unknown }> = [];
  const matches = Array.from(template.matchAll(TEMPLATE_RE));
  if (matches.length === 0) return { text: template, parts };
  let out = '';
  let last = 0;
  for (const m of matches) {
    out += template.slice(last, m.index);
    const expr = m[1];
    const value = await evaluate(expr, context);
    parts.push({ expression: expr, value });
    out += stringify(value);
    last = (m.index ?? 0) + m[0].length;
  }
  out += template.slice(last);
  return { text: out, parts };
}

/**
 * Render every string leaf in a JSON structure. A string of the form "=expr"
 * is replaced by the evaluated expression value (any JSON type), which lets a
 * body field carry an object or number rather than text.
 */
export async function renderJson(value: unknown, context: unknown): Promise<unknown> {
  if (typeof value === 'string') {
    if (value.startsWith('=')) return evaluate(value.slice(1), context);
    return (await renderTemplate(value, context)).text;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const v of value) out.push(await renderJson(v, context));
    return out;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = await renderJson(v, context);
    return out;
  }
  return value;
}

/** Validate that an expression at least compiles; returns an error message or null. */
export function checkSyntax(expression: string): string | null {
  try {
    compile(expression.trim() || '$');
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
