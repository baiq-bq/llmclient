import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { calculateCost, createLlmClient, defaultPricing, LanguageModel, resolvePricing, tool } from '../src/index.js';
import { qwenAdapter } from '../src/providers/qwen.js';
import { messages } from './helpers.js';

const model = LanguageModel.Qwen4Max;
const usage = {
  prompt_tokens: 100, completion_tokens: 30, total_tokens: 130,
  prompt_tokens_details: { cached_tokens: 10, cache_creation_input_tokens: 20 },
  completion_tokens_details: { reasoning_tokens: 5 },
};
function completion(content = 'answer', reasoning?: string) {
  return {
    id: 'qwen-synthetic', object: 'chat.completion', created: 1, model: 'qwen4-max',
    choices: [{ index: 0, message: { role: 'assistant', content, reasoning_content: reasoning }, finish_reason: 'stop' }],
    usage,
  };
}

function client(fetch: typeof globalThis.fetch) {
  return createLlmClient({ providers: [qwenAdapter({ apiKey: 'test' })], fetch, retries: { maxRetries: 0 } });
}

describe('Alibaba Qwen adapter', () => {
  it('sends the original image bytes and explicit reasoning budget and retains the known subtotal', async () => {
    const bytes = Buffer.from('synthetic image');
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(url).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: 'qwen4-max', enable_thinking: true, thinking_budget: 500, preserve_thinking: true,
        messages: [{ content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` } }] }, { content: expect.anything() }],
      });
      return Response.json(completion());
    });
    const result = await client(fetch).generate({ model, messages, images: [{ bytes, mediaType: 'image/png' }], reasoning: { effort: 'low', budgetTokens: 500 } });
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 30, reasoningTokens: 5, cachedInputTokens: 10, cacheWriteTokens: 20, uncachedInputTokens: 70 });
    expect(result.cost.status).toBe('partial');
    expect(result.cost.estimatedUsd).toBeCloseTo((70 * 1.5 + 30 * 4.5) / 1e6, 12);
  });

  it('uses the regional or plan endpoint supplied by the caller and never rewrites an alias', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(url).toBe('https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
      expect(JSON.parse(String(init?.body)).model).toBe('qwen4.0-max-preview');
      return Response.json(completion());
    });
    const configured = createLlmClient({ providers: [qwenAdapter({
      apiKey: 'test', baseURL: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/',
    })], fetch });
    const result = await configured.generate({ model: LanguageModel.Qwen40MaxPreview, messages });
    expect(result.cost.status).toBe('unknown');
  });

  it('preserves reasoning and the call ID when a tool result is sent back', async () => {
    const execute = vi.fn(async () => 9);
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ ...completion(), choices: [{
        index: 0, finish_reason: 'tool_calls', message: {
          role: 'assistant', content: null, reasoning_content: 'Synthetic reasoning',
          tool_calls: [{ id: 'qwen-tool-1', type: 'function', function: { name: 'price', arguments: '{}' } }],
        },
      }] }))
      .mockResolvedValueOnce(Response.json(completion('Price: 9')));
    const result = await client(fetch).generate({ model, messages, tools: {
      price: tool({ description: 'Look up the price', inputSchema: z.object({}), execute }),
    } });
    expect(execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ text: 'Price: 9', attemptCount: 2, usage: { inputTokens: 200 } });
    const followup = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
    expect(followup.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'assistant', reasoning_content: 'Synthetic reasoning' }),
      expect.objectContaining({ role: 'tool', tool_call_id: 'qwen-tool-1' }),
    ]));
  });

  it('uses non-thinking JSON Object mode where required and validates the result with Zod', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ enable_thinking: false, response_format: { type: 'json_object' } });
      return Response.json(completion('{"name":"library"}'));
    });
    const result = await client(fetch).generateObject(
      { model: LanguageModel.Qwen36Plus, messages }, { schema: z.object({ name: z.string() }) },
    );
    expect(result.object.name).toBe('library');
  });

  it('rejects incompatible requests before provider I/O', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const configured = client(fetch);
    const output = { schema: z.object({ name: z.string() }) };
    await expect(configured.generateObject({ model: LanguageModel.Qwen36Plus, messages, reasoning: { effort: 'low' } }, output))
      .rejects.toMatchObject({ details: { reasons: ['structured_output_requires_no_reasoning'] } });
    await expect(configured.generate({ model: LanguageModel.Qwen35_27B, messages, reasoning: { effort: 'low' } }))
      .rejects.toMatchObject({ details: { reasons: ['reasoning_requires_streaming'] } });
    await expect(configured.generate({ model: LanguageModel.Qwen37MaxPreview, messages, reasoning: { effort: 'none' } }))
      .rejects.toMatchObject({ details: { reasons: ['reasoning_not_supported'] } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('streams reasoning and text and accounts for the usage-only frame', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true, stream_options: { include_usage: true } });
      const chunks = [
        { choices: [{ index: 0, delta: { reasoning_content: 'Think' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: { content: 'answer' }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        { choices: [], usage },
      ];
      return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } });
    });
    const stream = client(fetch).stream({ model, messages });
    const events = [];
    for await (const event of stream.events) events.push(event);
    expect(events).toContainEqual(expect.objectContaining({ type: 'reasoning-delta', text: 'Think' }));
    expect(await stream.result).toMatchObject({ text: 'answer', usageComplete: true, usage: { inputTokens: 100 } });
  });
});

describe('Qwen tiered pricing', () => {
  const model = LanguageModel.Qwen37Flash;
  const rates = resolvePricing(defaultPricing).get(model);
  it.each([[32_000, 0.03], [32_001, 0.1], [256_000, 0.1], [256_001, 0.2]])(
    'selects the correct input rate at %i tokens', (inputTokens, inputRate) => {
      expect(calculateCost(rates, { inputTokens }).appliedPricing.rates.input).toBe(inputRate);
    },
  );
  it('merges verified and custom fields for matching thresholds', () => {
    const pricing = resolvePricing(defaultPricing, { [model]: { contextTiers: [
      { minimumInputTokens: 32_001, rates: {} }, { minimumInputTokens: 256_001, rates: { output: 0 } },
    ] } }).get(model);
    expect(calculateCost(pricing, { inputTokens: 300_000 }).appliedPricing).toMatchObject({
      rates: { input: 0.2, output: 0 }, origins: { input: 'internal', output: 'custom' },
    });
  });
});
