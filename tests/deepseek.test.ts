import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlmClient, LanguageModel, tool, type PricingTable } from '../src/index.js';
import { deepseekAdapter } from '../src/providers/deepseek.js';
import { messages } from './helpers.js';

const models = [LanguageModel.DeepSeekFlash, LanguageModel.DeepSeekV4Pro] as const;
const usage = { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130, prompt_cache_hit_tokens: 10, prompt_cache_miss_tokens: 90, completion_tokens_details: { reasoning_tokens: 10 } };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
function response(content = 'hello') {
  return { id: 'chat-1', object: 'chat.completion', created: 1, model: 'deepseek-flash', choices: [{ index: 0, message: { role: 'assistant', content, reasoning_content: 'Synthetic reasoning' }, finish_reason: 'stop' }], usage };
}
function client(send: typeof fetch, pricing?: PricingTable) {
  return createLlmClient({ providers: [deepseekAdapter({ apiKey: 'synthetic' })], fetch: send, pricing, retries: { maxRetries: 0, baseDelayMs: 0 } });
}
describe('DeepSeek native SDK contract', () => {
  it('uses the direct endpoint, explicit credentials, custom headers and adapter transport', async () => {
    let url: string; let headers: Headers;
    const globalSend = vi.fn<typeof fetch>();
    const send = vi.fn<typeof fetch>(async (input, init) => { url = String(input); headers = new Headers(init?.headers); return Response.json(response()); });
    const adapter = deepseekAdapter({ apiKey: 'synthetic', headers: { 'x-app': 'example' }, fetch: send });
    await createLlmClient({ providers: [adapter], fetch: globalSend }).generate({ model: models[0], messages });
    expect(url!).toBe('https://api.deepseek.com/chat/completions');
    expect(headers!.get('authorization')).toBe('Bearer synthetic'); expect(headers!.get('x-app')).toBe('example');
    expect(globalSend).not.toHaveBeenCalled();
  });
  it('supports a custom endpoint without reading environment credentials', async () => {
    let url: string;
    const send = vi.fn<typeof fetch>(async input => { url = String(input); return Response.json(response()); });
    await createLlmClient({ providers: [deepseekAdapter({ apiKey: 'synthetic', baseURL: 'https://proxy.example/v1/' })], fetch: send }).generate({ model: models[1], messages });
    expect(url!).toBe('https://proxy.example/v1/chat/completions');
    expect(() => deepseekAdapter({ apiKey: '' })).toThrow();
    expect(() => deepseekAdapter({ apiKey: 'synthetic', baseURL: 'file:///tmp' })).toThrow();
  });
  it.each(models)('preserves cache and reasoning usage for %s with unknown default price', async model => {
    const result = await client(async () => Response.json(response())).generate({ model, messages });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 30, totalTokens: 130, cachedInputTokens: 10, uncachedInputTokens: 90, cacheWriteTokens: 0, reasoningTokens: 10 });
    expect(result.usageComplete).toBe(true);
    expect(result.cost).toEqual({ currency: 'USD', status: 'unknown', estimatedUsd: null });
  });
  it('uses caller-selected off-peak rates without charging cached input or reasoning twice', async () => {
    const send = async () => Response.json(response());
    const priced = client(send, { [models[0]]: { rates: { input: 0.15, cachedInput: 0.003, output: 0.6 } } });
    const result = await priced.generate({ model: models[0], messages });
    expect(result.cost.status).toBe('known'); expect(result.cost.estimatedUsd).toBeCloseTo((90 * 0.15 + 10 * 0.003 + 30 * 0.6) / 1e6);
    expect((await client(send).generate({ model: models[0], messages })).cost.status).toBe('unknown');
  });
  it.each([undefined, {}, { completion_tokens: 30 }])('does not invent missing usage: %j', async incomplete => {
    const result = await client(async () => Response.json({ ...response(), usage: incomplete })).generate({ model: models[0], messages });
    expect(result.usage.inputTokens).toBeUndefined(); expect(result.usage.cachedInputTokens).toBeUndefined();
    expect(result.usage.reasoningTokens).toBeUndefined(); expect(result.usage.totalTokens).toBeUndefined(); expect(result.usageComplete).toBe(false);
    expect(result.cost.status).toBe('unknown');
  });
  it('preserves reported output subtotal when input consumption is missing', async () => {
    const result = await client(async () => Response.json({ ...response(), usage: { completion_tokens: 30 } }), {
      [models[0]]: { rates: { input: 0.15, output: 0.6, cachedInput: 0.003 } },
    }).generate({ model: models[0], messages });
    expect(result.cost).toMatchObject({ status: 'partial', estimatedUsd: 0.000018 });
  });
  it.each(models)('rejects unsupported reasoning, budgets, temperature and files before I/O: %s', async model => {
    const send = vi.fn<typeof fetch>(); const c = client(send);
    for (const extra of [{ reasoning: { effort: 'medium' as const } }, { reasoning: { effort: 'high' as const, budgetTokens: 4096 } }, { temperature: 1 }, { maxOutputTokens: 393_217 }, { files: [{ bytes: Buffer.from('%PDF'), mediaType: 'application/pdf' }] }]) {
      await expect(c.generate({ model, messages, ...extra })).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    }
    expect(send).not.toHaveBeenCalled();
  });
  it('sends Flash image bytes inline and rejects images on Pro', async () => {
    let body: any;
    const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json(response()); });
    const c = client(send); const images = [{ bytes: png, mediaType: 'image/png' as const }];
    await c.generate({ model: models[0], messages, images });
    expect(body.messages[0].content).toContainEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } });
    const error = await c.generate({ model: models[1], messages, images }).catch(e => e);
    expect(error.details).toMatchObject({ reasons: expect.arrayContaining(['images_not_supported']), validModels: expect.arrayContaining([{ model: models[0], configured: true }]) });
    expect(send).toHaveBeenCalledOnce();
  });
  it.each(models)('preserves reasoning, call IDs and usage through a tool loop on %s', async model => {
    const bodies: any[] = [];
    const execute = vi.fn(async ({ id }: { id: string }) => ({ id, price: 9 }));
    const send = vi.fn<typeof fetch>(async (_, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 1) return Response.json({ ...response(), choices: [{ index: 0, message: { role: 'assistant', content: null, reasoning_content: 'Need a price', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'price', arguments: '{"id":"book"}' } }] }, finish_reason: 'tool_calls' }] });
      return Response.json(response('Price: 9'));
    });
    const result = await client(send).generate({ model, messages, reasoning: { effort: 'high' }, tools: { price: tool({ description: 'Look up price', inputSchema: z.object({ id: z.string() }), execute }) } });
    expect(result.text).toBe('Price: 9'); expect(result.attemptCount).toBe(2); expect(result.usage.inputTokens).toBe(200); expect(execute).toHaveBeenCalledOnce();
    expect(bodies[0].tools[0].function).toMatchObject({ name: 'price', description: 'Look up price', parameters: { type: 'object' } });
    expect(bodies[1].messages).toContainEqual(expect.objectContaining({ role: 'assistant', reasoning_content: 'Need a price', tool_calls: [expect.objectContaining({ id: 'call-1' })] }));
    expect(bodies[1].messages).toContainEqual(expect.objectContaining({ role: 'tool', tool_call_id: 'call-1' }));
  });
  it.each(models)('streams reasoning, text and final usage on %s', async model => {
    const chunks = [
      { choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'Think' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
    ];
    const send = vi.fn<typeof fetch>(async (_, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true, stream_options: { include_usage: true } });
      return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    });
    const stream = client(send).stream({ model, messages }); const events = [];
    for await (const event of stream.events) events.push(event);
    const result = await stream.result;
    expect(events).toContainEqual(expect.objectContaining({ type: 'reasoning-delta', text: 'Think' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'text-delta', text: 'hello' }));
    expect(result.text).toBe('hello'); expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 30, cachedInputTokens: 10, reasoningTokens: 10 });
    expect(send).toHaveBeenCalledOnce();
  });
  it('validates the completed streamed object and preserves usage on schema failure', async () => {
    const send = vi.fn<typeof fetch>(async () => new Response([
      { choices: [{ index: 0, delta: { content: '{"title":1}' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
    ].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    const stream = client(send).stream({ model: models[0], messages }, { schema: z.object({ title: z.string() }) });
    const final = stream.result.catch(error => error);
    try { for await (const _ of stream.events) { /* Consume provisional fragments. */ } } catch { /* Same failure as final. */ }
    const error = await final;
    expect(error).toMatchObject({ code: 'STRUCTURED_OUTPUT_ERROR', accounting: { usage: { inputTokens: 100, outputTokens: 30 } } });
    expect(send).toHaveBeenCalledOnce();
  });
  it('keeps usage and never repeats an executed tool after a later provider failure', async () => {
    const execute = vi.fn(async () => ({ price: 9 }));
    const send = vi.fn<typeof fetch>(async () => {
      if (send.mock.calls.length > 1) return Response.json({ error: { message: 'synthetic' } }, { status: 503 });
      return Response.json({ ...response(), choices: [{ index: 0, message: { role: 'assistant', content: null, reasoning_content: 'Need price', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'price', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] });
    });
    const c = createLlmClient({ providers: [deepseekAdapter({ apiKey: 'synthetic' })], fetch: send, retries: { baseDelayMs: 0 } });
    const error = await c.generate({ model: models[0], messages, tools: { price: tool({ description: 'Look up price', inputSchema: z.object({}), execute }) } }).catch(e => e);
    expect(error).toMatchObject({ code: 'PROVIDER_ERROR', accounting: { attemptCount: 2, usage: { inputTokens: 100, outputTokens: 30 } } });
    expect(execute).toHaveBeenCalledOnce(); expect(send).toHaveBeenCalledTimes(2);
  });
});
