import { APICallError, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlmClient, LanguageModel, LlmError } from '../src/index.js';
import { adapter, generated, messages, pricing, rawUsage, streamed, textStream } from './helpers.js';
const retryFast = { baseDelayMs: 0, maxDelayMs: 0 };
const transient = () => new APICallError({ message: 'secret provider body', url: 'https://synthetic.test', requestBodyValues: {}, statusCode: 503, responseBody: 'private', isRetryable: true });
describe('client lifecycle', () => {
  it('supports external providers and accumulates reported usage', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated() });
    const result = await createLlmClient({ providers: [adapter(model)], pricing }).generate({ model: 'external:test', messages });
    expect(result).toMatchObject({ text: 'hello', attemptCount: 1, usageComplete: true, usage: { inputTokens: 100, outputTokens: 30, reasoningTokens: 10 }, cost: { status: 'known' } });
    expect(result.cost.estimatedUsd).toBeCloseTo(0.0001535, 12);
  });
  it('allows unknown pricing without inventing a cost', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated() });
    expect((await createLlmClient({ providers: [adapter(model)] }).generate({ model: 'external:test', messages })).cost.estimatedUsd).toBeNull();
  });
  it('retries transient errors only and counts all invocations', async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => { if (++calls < 3) throw transient(); return generated(); } });
    const result = await createLlmClient({ providers: [adapter(model)], pricing, retries: retryFast }).generate({ model: 'external:test', messages });
    expect(calls).toBe(3); expect(result.attemptCount).toBe(3); expect(result.usageComplete).toBe(false); expect(result.cost.status).toBe('partial');
  });
  it('honours disabled retries and scrubs provider error bodies', async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw transient(); } });
    const error = await createLlmClient({ providers: [adapter(model)], retries: { maxRetries: 0 } }).generate({ model: 'external:test', messages }).catch(e => e);
    expect(error).toBeInstanceOf(LlmError); expect(error.accounting.attemptCount).toBe(1); expect(JSON.stringify(error)).not.toMatch(/secret|private|accounting/); expect(error.cause).toBeUndefined();
  });
  it('repairs invalid objects on attempt 3 and sums usage', async () => {
    const model = new MockLanguageModelV4({ doGenerate: [generated('{"other":1}'), generated('{"other":1}'), generated('{"title":"ok"}')] });
    const result = await createLlmClient({ providers: [adapter(model)], pricing, retries: retryFast }).generateObject({ model: 'external:test', messages }, { schema: z.object({ title: z.string() }) });
    expect(result.object).toEqual({ title: 'ok' }); expect(result.attemptCount).toBe(3); expect(result.usage.inputTokens).toBe(300);
    expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).not.toContain('previous response');
    expect(JSON.stringify(model.doGenerateCalls[2]!.prompt)).toContain('previous response');
  });
  it('keeps accounting on invalid/truncated objects', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated('{"title":"ok"}', 'length') });
    const error = await createLlmClient({ providers: [adapter(model)], pricing, retries: { maxRetries: 0 } }).generateObject({ model: 'external:test', messages }, { schema: z.object({ title: z.string() }) }).catch(e => e);
    expect(error.code).toBe('TRUNCATED_OUTPUT'); expect(error.accounting.usage.inputTokens).toBe(100);
  });
  it('bounds a model that ignores abort signals', async () => {
    const model = new MockLanguageModelV4({ doGenerate: () => new Promise(() => {}) });
    const error = await createLlmClient({ providers: [adapter(model)] }).generate({ model: 'external:test', messages, timeoutMs: 20 }).catch(e => e);
    expect(error.code).toBe('TIMEOUT'); expect(error.accounting.attemptCount).toBe(1);
  });
  it('includes retry waits in one deadline', async () => {
    const model = new MockLanguageModelV4({ doGenerate: async () => { throw transient(); } });
    const error = await createLlmClient({ providers: [adapter(model)], retries: { baseDelayMs: 100 } }).generate({ model: 'external:test', messages, timeoutMs: 20 }).catch(e => e);
    expect(error.code).toBe('TIMEOUT'); expect(model.doGenerateCalls).toHaveLength(1);
  });
  it('honours caller cancellation before I/O', async () => {
    const model = new MockLanguageModelV4({ doGenerate: generated() }); const controller = new AbortController(); controller.abort();
    await expect(createLlmClient({ providers: [adapter(model)] }).generate({ model: 'external:test', messages, signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
  it('executes tools with schema validation, messages and accumulated usage', async () => {
    const execute = vi.fn(async ({ x }: { x: number }) => x + 1);
    const call = { ...generated(), content: [{ type: 'tool-call' as const, toolCallId: 'call-1', toolName: 'increment', input: '{"x":1}' }], finishReason: { unified: 'tool-calls' as const, raw: 'tool-calls' } };
    const model = new MockLanguageModelV4({ doGenerate: [call, generated('2')] });
    const result = await createLlmClient({ providers: [adapter(model)], pricing }).generate({ model: 'external:test', messages, tools: { increment: tool({ inputSchema: z.object({ x: z.number() }), execute }) } });
    expect(execute).toHaveBeenCalledOnce(); expect(result.attemptCount).toBe(2); expect(result.toolResults).toHaveLength(1); expect(result.messages.some(m => m.role === 'tool')).toBe(true); expect(result.usage.inputTokens).toBe(200);
  });
  it('never reexecutes a tool when a later provider step fails', async () => {
    const execute = vi.fn(async () => 'ok'); let calls = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => { if (++calls === 1) return { ...generated(), content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'run', input: '{}' }], finishReason: { unified: 'tool-calls', raw: 'tool-calls' } }; throw transient(); } });
    const error = await createLlmClient({ providers: [adapter(model)], pricing, retries: retryFast }).generate({ model: 'external:test', messages, tools: { run: tool({ inputSchema: z.object({}), execute }) } }).catch(e => e);
    expect(error.code).toBe('PROVIDER_ERROR'); expect(calls).toBe(2); expect(execute).toHaveBeenCalledOnce(); expect(error.accounting.usage.inputTokens).toBe(100);
  });
  it('preserves usage when a tool fails and does not retry it', async () => {
    const execute = vi.fn(async (): Promise<string> => { throw new Error('secret tool error'); });
    const model = new MockLanguageModelV4({ doGenerate: { ...generated(), content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'run', input: '{}' }], finishReason: { unified: 'tool-calls', raw: 'tool-calls' } } });
    const error = await createLlmClient({ providers: [adapter(model)], pricing }).generate({ model: 'external:test', messages, maxSteps: 1, tools: { run: tool({ inputSchema: z.object({}), execute }) } }).catch(e => e);
    expect(error.code).toBe('TOOL_ERROR'); expect(error.accounting.usage.inputTokens).toBe(100); expect(execute).toHaveBeenCalledOnce();
  });
  it('bounds tools that ignore cancellation', async () => {
    const model = new MockLanguageModelV4({ doGenerate: { ...generated(), content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'run', input: '{}' }], finishReason: { unified: 'tool-calls', raw: 'tool-calls' } } });
    const error = await createLlmClient({ providers: [adapter(model)], pricing }).generate({ model: 'external:test', messages, timeoutMs: 20, tools: { run: tool({ inputSchema: z.object({}), execute: () => new Promise(() => {}) }) } }).catch(e => e);
    expect(error.code).toBe('TIMEOUT'); expect(error.accounting.usage.inputTokens).toBe(100);
  });
  it('streams typed events and a final result', async () => {
    const model = new MockLanguageModelV4({ doStream: streamed(textStream()) });
    const stream = createLlmClient({ providers: [adapter(model)], pricing }).stream({ model: 'external:test', messages });
    const events = []; for await (const event of stream.events) events.push(event);
    expect(events.some(e => e.type === 'text-delta')).toBe(true); expect(await stream.result).toMatchObject({ text: 'hello', attemptCount: 1, usage: { inputTokens: 100 } });
  });
  it('does not restart a partially emitted stream', async () => {
    const model = new MockLanguageModelV4({ doStream: streamed([...textStream().slice(0, 3), { type: 'error', error: transient() }]) });
    const stream = createLlmClient({ providers: [adapter(model)], retries: retryFast }).stream({ model: 'external:test', messages });
    await expect((async () => { for await (const _ of stream.events) {} })()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    await expect(stream.result).rejects.toMatchObject({ code: 'PROVIDER_ERROR' }); expect(model.doStreamCalls).toHaveLength(1);
  });
  it('validates the final streamed object', async () => {
    const model = new MockLanguageModelV4({ doStream: streamed(textStream('{"title":"ok"}')) });
    const stream = createLlmClient({ providers: [adapter(model)] }).stream({ model: 'external:test', messages }, { schema: z.object({ title: z.string() }) });
    for await (const _ of stream.events) {} expect((await stream.result).object).toEqual({ title: 'ok' });
  });
  it('supports free mock text, objects, streams and images without I/O', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = createLlmClient({ providers: [], fetch: transport, mock: { text: 'simulated', object: { title: 'mocked' } } });
    expect(await client.generate({ model: LanguageModel.Mock, messages })).toMatchObject({ text: 'simulated', provider: 'mock', attemptCount: 0, cost: { estimatedUsd: 0 } });
    expect((await client.generateObject({ model: 'mock', messages }, { schema: z.object({ title: z.string() }) })).object.title).toBe('mocked');
    const stream = client.stream({ model: 'mock', messages }); for await (const _ of stream.events) {} expect((await stream.result).cost.estimatedUsd).toBe(0);
    const image = await client.generateImage({ model: 'mock', prompt: 'test' }); expect(image.images[0]!.mediaType).toBe('image/png'); expect(image.cost.estimatedUsd).toBe(0); expect(transport).not.toHaveBeenCalled();
  });
});
