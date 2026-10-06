import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLlmClient, defineProvider } from '../src/index.js';
import { supportsStrictOpenAI } from '../src/structured-output.js';
import { adapter, capabilities, generated, messages, pricing } from './helpers.js';
const retries = { baseDelayMs: 0, maxDelayMs: 0 };

describe('structured output repair', () => {
  it('repairs on the second attempt with paths and preserves all consumption', async () => {
    const model = new MockLanguageModelV4({ doGenerate: [generated('{"title":5}'), generated('{"title":"ok"}')] });
    const result = await createLlmClient({ providers: [adapter(model)], pricing, retries }).generateObject({ model: 'external:test', messages }, { schema: z.object({ title: z.string() }) });
    expect(result.object).toEqual({ title: 'ok' }); expect(result.attemptCount).toBe(2);
    expect(result.usage.inputTokens).toBe(200); expect(result.cost.estimatedUsd).toBeCloseTo(0.000307, 12);
    expect(result.entries[0]?.structuredOutput).toMatchObject({ kind: 'schema_validation', issues: [{ code: 'invalid_type', path: ['title'] }], repairContext: 'complete_output' });
    expect(result.entries[1]?.structuredOutput).toBeUndefined();
    expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain('diagnostics');
    expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain('invalid_type');
  });
  it('omits oversized responses entirely rather than sending a broken JSON prefix', async () => {
    const privateOutput = 'sensitive-output-'.repeat(3000);
    const text = JSON.stringify({ title: privateOutput });
    const model = new MockLanguageModelV4({ doGenerate: [generated(text), generated('{"title":5}')] });
    const result = await createLlmClient({ providers: [adapter(model)], retries }).generateObject({ model: 'external:test', messages }, { schema: z.object({ title: z.number() }) });
    const prompt = model.doGenerateCalls[1]!.prompt;
    expect(prompt.some(p => p.role === 'assistant')).toBe(false);
    expect(JSON.stringify(prompt)).not.toContain('sensitive-output');
    expect(result.entries[0]?.structuredOutput).toMatchObject({ outputCharacters: text.length, repairContext: 'omitted_oversized_output' });
  });
  it('diagnoses invalid JSON without exposing the provider output', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated('{"title":"private-output"') });
    const error = await createLlmClient({ providers: [adapter(model)], retries: { maxRetries: 0 } }).generateObject({ model: 'external:test', messages }, { schema: z.object({ title: z.string() }) }).catch(e => e);
    expect(error.structuredOutput.kind).toBe('json_parse'); expect(error.accounting.attemptCount).toBe(1);
    expect(JSON.stringify(error)).not.toContain('private-output'); expect(error.cause).toBeUndefined();
  });
  it('scrubs custom messages and dynamic keys and bounds diagnostic issues', async () => {
    const schema = z.object({ data: z.record(z.string(), z.array(z.string())) }).superRefine((_, ctx) => ctx.addIssue({ code: 'custom', message: 'secret-validator-message' }));
    const model = new MockLanguageModelV4({ doGenerate: generated(JSON.stringify({ data: { 'private-person@example.test': Array(50).fill(3) } })) });
    const error = await createLlmClient({ providers: [adapter(model)], retries: { maxRetries: 0 } }).generateObject({ model: 'external:test', messages }, { schema }).catch(e => e);
    expect(error.structuredOutput.issues).toHaveLength(20); expect(error.structuredOutput.omittedIssueCount).toBeGreaterThan(0);
    expect(error.structuredOutput.issues[0].path).toEqual(['data', '<key>', 0]);
    expect(JSON.stringify(error)).not.toMatch(/private-person|secret-validator-message/);
  });
  it('keeps schema custom messages private while exposing the failing field', async () => {
    const schema = z.object({ title: z.string().refine(() => false, 'private-custom-rule') });
    const model = new MockLanguageModelV4({ doGenerate: generated('{"title":"private-value"}') });
    const error = await createLlmClient({ providers: [adapter(model)], retries: { maxRetries: 0 } }).generateObject({ model: 'external:test', messages }, { schema }).catch(e => e);
    expect(error.structuredOutput.issues[0]).toMatchObject({ code: 'custom', path: ['title'] });
    expect(JSON.stringify(error)).not.toMatch(/private-custom-rule|private-value/);
  });
  it('never replays an output marked truncated and respects the existing retry limit', async () => {
    const model = new MockLanguageModelV4({ doGenerate: [generated('{"title":"ok"}', 'length'), generated('{"title":"ok"}')] });
    const result = await createLlmClient({ providers: [adapter(model)], retries }).generateObject({ model: 'external:test', messages }, { schema: z.object({ title: z.string() }) });
    expect(result.entries[0]?.structuredOutput).toMatchObject({ kind: 'truncated', repairContext: 'omitted_truncated_output' });
    expect(model.doGenerateCalls[1]!.prompt.some(p => p.role === 'assistant')).toBe(false);
    expect(result.attemptCount).toBe(2);
  });
  it('retains diagnostics and settled accounting after all attempts fail', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated('{"title":3}') });
    const error = await createLlmClient({ providers: [adapter(model)], pricing, retries }).generateObject({ model: 'external:test', messages }, { schema: z.object({ title: z.string() }) }).catch(e => e);
    expect(error.code).toBe('STRUCTURED_OUTPUT_ERROR'); expect(error.accounting.attemptCount).toBe(3);
    expect(error.accounting.entries.every((entry: { structuredOutput?: unknown }) => !!entry.structuredOutput)).toBe(true);
    expect(error.accounting.usage.inputTokens).toBe(300); expect(error.structuredOutput.kind).toBe('schema_validation');
  });
});
describe('strict OpenAI schemas', () => {
  it('chooses strict for fixed required fields, relaxed for incompatible shapes', () => {
    expect(supportsStrictOpenAI(z.object({ title: z.string(), items: z.array(z.object({ id: z.string() }).strict()) }).strict())).toBe(true);
    expect(supportsStrictOpenAI(z.object({ title: z.string().optional() }).strict())).toBe(false);
    expect(supportsStrictOpenAI(z.record(z.string(), z.string()))).toBe(false);
    expect(supportsStrictOpenAI(z.object({ data: z.record(z.string(), z.string()) }).strict())).toBe(false);
    expect(supportsStrictOpenAI(z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]))).toBe(false);
    expect(supportsStrictOpenAI(z.object({ website: z.url() }))).toBe(false);
    expect(supportsStrictOpenAI(z.object({ values: z.enum(Array.from({ length: 1001 }, (_, n) => `choice${n}`) as [string, ...string[]]) }))).toBe(false);
    let deep: z.ZodType = z.string();
    for (let n = 0; n < 12; n++) deep = z.object({ child: deep });
    expect(supportsStrictOpenAI(deep)).toBe(false);
  });
  it('configures compatible schemas strictly and preserves explicit overrides', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated('{"title":"ok"}') });
    const provider = defineProvider({ id: 'openai', models: { test: { capabilities } }, resolveModel: () => model });
    const client = createLlmClient({ providers: [provider] });
    const schema = z.object({ title: z.string() }).strict();
    await client.generateObject({ model: 'openai:test', messages }, { schema });
    expect(model.doGenerateCalls[0]?.providerOptions?.openai?.strictJsonSchema).toBe(true);
    await client.generateObject({ model: 'openai:test', messages, providerOptions: { openai: { strictJsonSchema: false } } }, { schema });
    expect(model.doGenerateCalls[1]?.providerOptions?.openai?.strictJsonSchema).toBe(false);
    await client.generateObject({ model: 'openai:test', messages }, { schema: z.object({ title: z.string().optional() }) });
    expect(model.doGenerateCalls[2]?.providerOptions?.openai?.strictJsonSchema).toBe(false);
  });
  it('preserves zero-cost mock diagnostics without attempting retries', async () => {
    const error = await createLlmClient({ providers: [], mock: { object: { title: 4 } } }).generateObject({ model: 'mock', messages }, { schema: z.object({ title: z.string() }) }).catch(e => e);
    expect(error.structuredOutput.issues[0].path).toEqual(['title']);
    expect(error.accounting.attemptCount).toBe(0); expect(error.accounting.cost.estimatedUsd).toBe(0);
  });
});
