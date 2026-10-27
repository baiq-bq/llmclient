import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlmClient, LanguageModel, modelCatalog, tool } from '../src/index.js';
import { kimiAdapter } from '../src/providers/kimi.js';
import { messages } from './helpers.js';

const models = [LanguageModel.KimiK31Pro, LanguageModel.KimiK31ProHighspeed, LanguageModel.KimiK3] as const;
const usage = { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130, prompt_tokens_details: { cached_tokens: 10, cache_write_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 10 } };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
function response(content = 'hello') {
  return { id: 'chat-1', object: 'chat.completion', created: 1, model: 'kimi-k3.1-pro', choices: [{ index: 0, message: { role: 'assistant', content, reasoning_content: 'Synthetic reasoning' }, finish_reason: 'stop' }], usage };
}
function client(send: typeof fetch) {
  return createLlmClient({ providers: [kimiAdapter({ apiKey: 'synthetic' })], fetch: send, retries: { maxRetries: 0, baseDelayMs: 0 } });
}
function sse(chunks: unknown[]) {
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
}
describe('Kimi native SDK contract', () => {
  it('catalogs only current K3 models, excluding K2 and retired aliases', () => {
    expect(Object.keys(modelCatalog).filter(id => id.startsWith('kimi:')).sort()).toEqual([...models].sort());
  });
  it('uses the direct endpoint, explicit credentials, headers and adapter transport', async () => {
    let url: string; let headers: Headers;
    const globalSend = vi.fn<typeof fetch>();
    const send = vi.fn<typeof fetch>(async (input, init) => { url = String(input); headers = new Headers(init?.headers); return Response.json(response()); });
    const adapter = kimiAdapter({ apiKey: 'synthetic', headers: { 'x-app': 'example' }, fetch: send });
    await createLlmClient({ providers: [adapter], fetch: globalSend }).generate({ model: models[0], messages });
    expect(url!).toBe('https://api.moonshot.ai/v1/chat/completions');
    expect(headers!.get('authorization')).toBe('Bearer synthetic'); expect(headers!.get('x-app')).toBe('example');
    expect(globalSend).not.toHaveBeenCalled();
  });
  it('supports a custom endpoint and rejects missing credentials or invalid URLs', async () => {
    let url: string;
    const send = vi.fn<typeof fetch>(async input => { url = String(input); return Response.json(response()); });
    await createLlmClient({ providers: [kimiAdapter({ apiKey: 'synthetic', baseURL: 'https://proxy.example/v1/' })], fetch: send }).generate({ model: models[0], messages });
    expect(url!).toBe('https://proxy.example/v1/chat/completions');
    expect(() => kimiAdapter({ apiKey: '' })).toThrow();
    expect(() => kimiAdapter({ apiKey: 'synthetic', baseURL: 'file:///tmp' })).toThrow();
  });
  it.each(models)('accounts for cache writes, hits and reasoning exactly once on %s', async model => {
    const result = await client(async () => Response.json(response())).generate({ model, messages });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30, totalTokens: 130, cachedInputTokens: 10, uncachedInputTokens: 70, cacheWriteTokens: 20, reasoningTokens: 10 });
    const [input, output, cached, write] = model === models[0] ? [2, 10, 0.2, 2] : model === models[1] ? [4, 20, 0.2, 4] : [3, 15, 0.3, 3];
    expect(result.cost.status).toBe('known'); expect(result.cost.estimatedUsd).toBeCloseTo((70 * input! + 10 * cached! + 20 * write! + 30 * output!) / 1e6);
    expect(result.usageComplete).toBe(true);
  });
  it('transports the 1h TTL and applies a per-client write price override', async () => {
    let body: any;
    const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json(response()); });
    const c = createLlmClient({ providers: [kimiAdapter({ apiKey: 'synthetic' })], fetch: send, pricing: { [models[0]]: { rates: { cacheWrite: 4 } } } });
    const result = await c.generate({ model: models[0], messages, providerOptions: { moonshotai: { promptCacheOptions: { mode: 'implicit', ttl: '1h' } } } });
    expect(body.prompt_cache_options).toEqual({ mode: 'implicit', ttl: '1h' });
    expect(result.cost.estimatedUsd).toBeCloseTo((70 * 2 + 10 * 0.2 + 20 * 4 + 30 * 10) / 1e6);
    expect((await client(send).generate({ model: models[0], messages })).entries[0]!.cost.appliedPricing.rates.cacheWrite).toBe(2);
  });
  it.each([undefined, {}, { completion_tokens: 30 }])('preserves missing consumption instead of SDK zeros: %j', async incomplete => {
    const result = await client(async () => Response.json({ ...response(), usage: incomplete })).generate({ model: models[0], messages });
    expect(result.usage.inputTokens).toBeUndefined(); expect(result.usage.cachedInputTokens).toBeUndefined();
    expect(result.usage.cacheWriteTokens).toBeUndefined(); expect(result.usage.reasoningTokens).toBeUndefined();
    expect(result.usage.totalTokens).toBeUndefined(); expect(result.usageComplete).toBe(false);
    expect(result.cost.status).toBe(incomplete && 'completion_tokens' in incomplete ? 'partial' : 'unknown');
  });
  it('does not assume a missing cache-write counter is zero and preserves the output subtotal', async () => {
    const result = await client(async () => Response.json({ ...response(), usage: { prompt_tokens: 100, completion_tokens: 30, cached_tokens: 10 } })).generate({ model: models[0], messages });
    expect(result.usage.cacheWriteTokens).toBeUndefined(); expect(result.usage.uncachedInputTokens).toBeUndefined();
    expect(result.cost.status).toBe('partial'); expect(result.cost.estimatedUsd).toBeCloseTo((10 * 0.2 + 30 * 10) / 1e6);
  });
  it('accepts explicit zero counters and legacy cached_tokens', async () => {
    const result = await client(async () => Response.json({ ...response(), usage: { prompt_tokens: 100, completion_tokens: 30, cached_tokens: 0, prompt_tokens_details: { cache_write_tokens: 0 } } })).generate({ model: models[0], messages });
    expect(result.usage).toMatchObject({ uncachedInputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0 });
    expect(result.cost).toMatchObject({ status: 'known', estimatedUsd: 0.0005 });
  });
  it.each(models)('rejects unsupported reasoning, temperature, documents and output sizes before I/O: %s', async model => {
    const send = vi.fn<typeof fetch>(); const c = client(send);
    for (const extra of [{ reasoning: { effort: 'none' as const } }, { reasoning: { effort: 'medium' as const } }, { reasoning: { effort: 'high' as const, budgetTokens: 4096 } }, { temperature: 1 }, { maxOutputTokens: 32_769 }, { files: [{ bytes: Buffer.from('%PDF'), mediaType: 'application/pdf' }] }, { files: [{ bytes: Buffer.from('PK'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] }, { files: [{ bytes: Buffer.from('<svg/>'), mediaType: 'image/svg+xml' }] }, { images: Array.from({ length: 11 }, () => ({ bytes: png, mediaType: 'image/png' as const })) }, { images: [{ bytes: Buffer.alloc(5 * 1024 * 1024 + 1), mediaType: 'image/png' as const }] }]) {
      await expect(c.generate({ model, messages, ...extra })).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    }
    expect(send).not.toHaveBeenCalled();
    const error = await c.generate({ model, messages, files: [{ bytes: Buffer.from('%PDF'), mediaType: 'application/pdf' }] }).catch(e => e);
    expect(error.details.validModels).toContainEqual({ model: LanguageModel.GPT6Astra, configured: false });
  });
  it.each(models)('sends local image bytes inline for %s', async model => {
    let body: any;
    const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json(response()); });
    await client(send).generate({ model, messages, images: [{ bytes: png, mediaType: 'image/png' }] });
    expect(body.messages[0].content).toContainEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } });
  });
  it.each(models)('preserves reasoning and call IDs through tools on %s', async model => {
    const bodies: any[] = []; const execute = vi.fn(async () => ({ price: 9 }));
    const send = vi.fn<typeof fetch>(async (_, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) return Response.json({ ...response(), choices: [{ index: 0, message: { role: 'assistant', content: null, reasoning_content: 'Need price', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'price', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
      return Response.json(response('Price: 9'));
    });
    const result = await client(send).generate({ model, messages, reasoning: { effort: 'high' }, tools: { price: tool({ description: 'Look up price', inputSchema: z.object({}), execute }) } });
    expect(result.text).toBe('Price: 9'); expect(result.attemptCount).toBe(2); expect(result.usage.inputTokens).toBe(200); expect(execute).toHaveBeenCalledOnce();
    expect(bodies[0].tools[0].function).toMatchObject({ name: 'price', description: 'Look up price', parameters: { type: 'object' } });
    expect(bodies[1].messages).toContainEqual(expect.objectContaining({ role: 'assistant', reasoning_content: 'Need price', tool_calls: [expect.objectContaining({ id: 'call-1' })] }));
    expect(bodies[1].messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }));
  });
  it.each(models)('streams reasoning, text and final cache usage on %s', async model => {
    const send = vi.fn<typeof fetch>(async (_, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true, stream_options: { include_usage: true } });
      return sse([
        { choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'Think' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
      ]);
    });
    const stream = client(send).stream({ model, messages }); const events = [];
    for await (const event of stream.events) events.push(event);
    const result = await stream.result;
    expect(events).toContainEqual(expect.objectContaining({ type: 'reasoning-delta', text: 'Think' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'hello' }));
    expect(result.text).toBe('hello'); expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 30, cachedInputTokens: 10, cacheWriteTokens: 20, uncachedInputTokens: 70, reasoningTokens: 10 });
    expect(send).toHaveBeenCalledOnce();
  });
  it('validates the final streamed object and preserves usage on schema failure', async () => {
    const send = vi.fn<typeof fetch>(async () => sse([
      { choices: [{ index: 0, delta: { content: '{"title":1}' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
    ]));
    const stream = client(send).stream({ model: models[0], messages }, { schema: z.object({ title: z.string() }) });
    const final = stream.result.catch(error => error);
    try { for await (const _ of stream.events) { /* Consume provisional fragments. */ } } catch { /* Same failure as final. */ }
    expect(await final).toMatchObject({ code: 'STRUCTURED_OUTPUT_ERROR', accounting: { usage: { inputTokens: 100, outputTokens: 30, cacheWriteTokens: 20 } } });
    expect(send).toHaveBeenCalledOnce();
  });
  it('keeps usage and never repeats executed tools after provider failure', async () => {
    const execute = vi.fn(async () => ({ price: 9 }));
    const send = vi.fn<typeof fetch>(async () => {
      if (send.mock.calls.length > 1) return Response.json({ error: { message: 'synthetic' } }, { status: 503 });
      return Response.json({ ...response(), choices: [{ index: 0, message: { role: 'assistant', content: null, reasoning_content: 'Need price', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'price', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    });
    const c = createLlmClient({ providers: [kimiAdapter({ apiKey: 'synthetic' })], fetch: send, retries: { baseDelayMs: 0 } });
    const error = await c.generate({ model: models[0], messages, tools: { price: tool({ description: 'Look up price', inputSchema: z.object({}), execute }) } }).catch(e => e);
    expect(error).toMatchObject({ code: 'PROVIDER_ERROR', accounting: { attemptCount: 2, usage: { inputTokens: 100, outputTokens: 30 } } });
    expect(execute).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledTimes(2);
  });
});
