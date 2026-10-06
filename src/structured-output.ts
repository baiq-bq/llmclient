import { z } from 'zod';
import type { StructuredOutputDiagnostics, StructuredOutputIssue } from './types.js';

const jsonSchemas = new WeakMap<z.ZodType, Record<string, unknown> | null>();
function jsonSchema(schema: z.ZodType): Record<string, unknown> | null {
  if (!jsonSchemas.has(schema)) {
    try { jsonSchemas.set(schema, z.toJSONSchema(schema) as Record<string, unknown>); }
    catch { jsonSchemas.set(schema, null); }
  }
  return jsonSchemas.get(schema) ?? null;
}
/** Conservative structural check before I/O. Explicit provider options take precedence. */
export function supportsStrictOpenAI(schema: z.ZodType): boolean {
  const root = jsonSchema(schema);
  if (!root || root.type !== 'object' || root.anyOf || root.allOf) return false;
  let propertiesCount = 0; let enumCount = 0; let stringCharacters = 0;
  function supported(node: unknown, depth = 0): boolean {
    if (depth > 10) return false;
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    const s = node as Record<string, unknown>;
    if (['default', 'patternProperties', 'allOf', 'not', 'oneOf', 'dependentRequired', 'dependentSchemas', 'if', 'then', 'else', 'prefixItems', 'uniqueItems', 'contains', 'propertyNames'].some(key => key in s)) return false;
    if (s.format && !['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'ipv4', 'ipv6', 'uuid'].includes(s.format as string)) return false;
    // Reference depth and recursive contracts need an explicit caller choice.
    if (s.$ref || s.$defs) return false;
    if (Array.isArray(s.enum)) {
      enumCount += s.enum.length;
      const characters = s.enum.reduce<number>((n, value) => n + (typeof value === 'string' ? value.length : 0), 0);
      stringCharacters += characters;
      if (s.enum.length > 250 && characters > 15_000) return false;
    }
    if (typeof s.const === 'string') stringCharacters += s.const.length;
    if (s.anyOf) return Array.isArray(s.anyOf) && s.anyOf.every(branch => supported(branch, depth));
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (types.some(t => !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(t as string))) return false;
    if (types.includes('object')) {
      if (s.additionalProperties !== false || !Array.isArray(s.required) || !s.properties) return false;
      const properties = s.properties as Record<string, unknown>;
      propertiesCount += Object.keys(properties).length;
      stringCharacters += Object.keys(properties).reduce((n, key) => n + key.length, 0);
      if (Object.keys(properties).some(key => !(s.required as unknown[]).includes(key))) return false;
      if (!Object.values(properties).every(value => supported(value, depth + 1))) return false;
    }
    if (types.includes('array') && !supported(s.items, depth + 1)) return false;
    return true;
  }
  return supported(root) && propertiesCount <= 5000 && enumCount <= 1000 && stringCharacters <= 120_000;
}
function declaredKeys(schema: z.ZodType): Set<string> {
  const keys = new Set<string>();
  let visited = 0;
  function visit(value: unknown) {
    if (++visited > 10_000 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const s = value as Record<string, unknown>;
    if (s.properties && typeof s.properties === 'object') for (const key of Object.keys(s.properties)) keys.add(key);
    Object.values(s).forEach(visit);
  }
  visit(jsonSchema(schema)); return keys;
}
const messages: Record<string, string> = {
  invalid_type: 'The value has the wrong type or is missing.', invalid_value: 'The value is not permitted by the schema.',
  too_small: 'The value is below the required size or bound.', too_big: 'The value exceeds the permitted size or bound.',
  invalid_format: 'The value does not match the required format.', not_multiple_of: 'The number does not match the required multiple.',
  unrecognized_keys: 'The object contains unsupported fields.', invalid_union: 'The value does not match any permitted shape.',
  invalid_key: 'A map key is invalid.', invalid_element: 'A collection element is invalid.', custom: 'An additional schema constraint failed.',
};
/** Custom messages, received values, dynamic keys and provider response bodies are excluded. */
export function outputDiagnostics(error: unknown, schema: z.ZodType, state: {
  finishReason?: string; outputCharacters?: number; repairContext: StructuredOutputDiagnostics['repairContext'];
}): StructuredOutputDiagnostics {
  let current: unknown = error; let rawIssues: unknown[] = []; let parseError = false;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const e = current as { name?: unknown; issues?: unknown; cause?: unknown };
    if (Array.isArray(e.issues)) { rawIssues = e.issues; break; }
    if (typeof e.name === 'string' && e.name.includes('JSONParseError')) parseError = true;
    current = e.cause;
  }
  const keys = declaredKeys(schema);
  const issues: StructuredOutputIssue[] = rawIssues.slice(0, 20).map(value => {
    const issue = value as { code?: unknown; path?: unknown };
    const code = typeof issue?.code === 'string' && Object.hasOwn(messages, issue.code) ? issue.code : 'custom';
    const path = Array.isArray(issue?.path) ? issue.path.slice(0, 12).map(p => typeof p === 'number' && Number.isSafeInteger(p) ? p : typeof p === 'string' && keys.has(p) && p.length <= 64 ? p : '<key>') : [];
    return { code, path, message: messages[code]! };
  });
  return {
    kind: state.finishReason === 'length' ? 'truncated' : rawIssues.length ? 'schema_validation' : parseError ? 'json_parse' : state.outputCharacters === 0 ? 'no_output' : 'unknown',
    issues, omittedIssueCount: Math.max(0, rawIssues.length - issues.length),
    ...(state.finishReason && ['stop', 'length', 'content-filter', 'tool-calls', 'error', 'unknown', 'other'].includes(state.finishReason) ? { finishReason: state.finishReason } : {}),
    ...(state.outputCharacters !== undefined ? { outputCharacters: state.outputCharacters } : {}), repairContext: state.repairContext,
  };
}
