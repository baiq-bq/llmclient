import { describe, expect, it, vi } from 'vitest';
import { builtinEmbeddingModels, createLlmClient, defaultPricing, defineProvider, EmbeddingModel, embeddingModelCatalog, type EmbeddingProviderAdapter } from '../src/index.js';
import { deepinfraAdapter } from '../src/providers/deepinfra.js';
import { googleAdapter } from '../src/providers/google.js';
import { openaiAdapter } from '../src/providers/openai.js';
import { voyageAdapter } from '../src/providers/voyage.js';

const apiKey = 'synthetic';
const adapters = [openaiAdapter({ apiKey }), googleAdapter({ apiKey }), voyageAdapter({ apiKey }), deepinfraAdapter({ apiKey })];
const vector = (size: number, value = 0.1) => Array.from({ length: size }, () => value);

describe('embedding catalog and adapters', () => {
  it('exports the same IDs as the catalog and advertises configuration independently of language models', () => {
    expect(Object.keys(embeddingModelCatalog).sort()).toEqual(builtinEmbeddingModels.filter(id => id !== 'mock').sort());
    const client = createLlmClient({ providers: [voyageAdapter({ apiKey })] });
    expect(client.listEmbeddingModels().filter(model => model.configured)).toHaveLength(26);
    expect(Object.keys(embeddingModelCatalog).filter(id => id.startsWith('deepinfra:'))).toHaveLength(30);
    expect(client.listModels().filter(model => model.configured)).toEqual([]);
    expect(defaultPricing[EmbeddingModel.Voyage4Lite]!.rates.input).toBe(0.02);
    expect(defaultPricing[EmbeddingModel.Qwen3Embedding8B]!.rates.input).toBe(0.01);
  });

  it.each(builtinEmbeddingModels.filter(id => id !== 'mock'))('uses the exact transport and model ID for %s', async model => {
    const definition = embeddingModelCatalog[model];
    const dimensions = definition.defaultDimensions ?? 2;
    const [provider, id] = model.split(':') as [string, string];
    const embedding = vector(dimensions);
    const send = vi.fn<typeof fetch>(async (url, init) => {
      const body = JSON.parse(String(init?.body));
      if (provider === 'google') {
        expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${id}:embedContent`);
        expect(body).toMatchObject({ model: `models/${id}`, content: { parts: [{ text: 'test' }] } });
        return Response.json({ embedding: { values: embedding }, usageMetadata: { promptTokenCount: 4 } });
      }
      expect(body.model).toBe(id);
      const usage = { prompt_tokens: 4, total_tokens: 4 };
      if (provider === 'voyage') {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic');
        if (id.startsWith('voyage-context-')) {
          expect(url).toBe('https://api.voyageai.com/v1/contextualizedembeddings');
          expect(body.inputs).toEqual([['test']]);
          return Response.json({ data: [{ index: 0, data: [{ index: 0, embedding }] }], usage });
        }
        if (id.startsWith('voyage-multimodal-')) {
          expect(url).toBe('https://api.voyageai.com/v1/multimodalembeddings');
          expect(body.inputs).toEqual([{ content: [{ type: 'text', text: 'test' }] }]);
        } else {
          expect(url).toBe('https://api.voyageai.com/v1/embeddings');
          expect(body.input).toEqual(['test']);
        }
        expect(body.truncation).toBe(false);
      } else {
        expect(url).toBe(provider === 'openai' ? 'https://api.openai.com/v1/embeddings' : 'https://api.deepinfra.com/v1/openai/embeddings');
        expect(body).toMatchObject({ input: ['test'], encoding_format: 'float' });
      }
      return Response.json({ data: [{ index: 0, embedding }], usage });
    });
    const client = createLlmClient({ providers: adapters, fetch: send });
    const result = await client.embed({ model, value: 'test' });
    expect(result).toMatchObject({ model, provider, dimensions, embedding, attemptCount: 1, usageComplete: true, usage: { inputTokens: 4 }, cost: { status: 'known' } });
    expect(result.cost.estimatedUsd).toBeCloseTo(4 * defaultPricing[model]!.rates.input! / 1_000_000, 12);
    expect(send).toHaveBeenCalledOnce();
  });

  it('maps dimensions and input type and respects response indices', async () => {
    const send = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ input: ['a', 'b'], output_dimension: 256, input_type: 'document' });
      return Response.json({ data: [{ index: 1, embedding: vector(256, 0.2) }, { index: 0, embedding: vector(256) }], usage: { total_tokens: 8 } });
    });
    const client = createLlmClient({ providers: adapters, fetch: send });
    expect(await client.embedMany({ model: EmbeddingModel.Voyage4Lite, values: ['a', 'b'], dimensions: 256, inputType: 'document' }))
      .toMatchObject({ embeddings: [vector(256), vector(256, 0.2)], dimensions: 256, usage: { inputTokens: 8 } });
  });

  it('uses a single Google request with separate content per text and preserves unknown usage', async () => {
    const send = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toContain('gemini-embedding-2:batchEmbedContents');
      const { requests } = JSON.parse(String(init?.body));
      expect(requests).toMatchObject([
        { content: { parts: [{ text: 'a' }] }, outputDimensionality: 128 },
        { content: { parts: [{ text: 'b' }] }, outputDimensionality: 128 },
      ]);
      return Response.json({ embeddings: [{ values: vector(128) }, { values: vector(128, 0.2) }] });
    });
    const result = await createLlmClient({ providers: adapters, fetch: send }).embedMany({
      model: EmbeddingModel.GeminiEmbedding2, values: ['a', 'b'], dimensions: 128,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ usageComplete: false, cost: { status: 'unknown', estimatedUsd: null }, embeddings: [vector(128), vector(128, 0.2)] });
    expect(result.usage.inputTokens).toBeUndefined();
  });

  it('validates the request before making a provider call', async () => {
    const send = vi.fn<typeof fetch>();
    const client = createLlmClient({ providers: [voyageAdapter({ apiKey })], fetch: send });
    await expect(client.embedMany({ model: EmbeddingModel.Voyage4Lite, values: [] })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(client.embed({ model: EmbeddingModel.Voyage4, value: '   ' })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(client.embed({ model: EmbeddingModel.Voyage4, value: 'a', dimensions: 384 })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY', details: { operation: 'embed', reasons: ['dimensions_not_supported'] },
    });
    await expect(client.embedMany({ model: EmbeddingModel.GeminiEmbedding2, values: ['a'], inputType: 'query' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY', details: { operation: 'embedMany', reasons: ['input_type_not_supported'], validModels: expect.arrayContaining([{ model: EmbeddingModel.Voyage4, configured: true }]) },
    });
    await expect(client.embed({ model: EmbeddingModel.Qwen3Embedding8B, value: 'test' })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    await expect(client.embed({ model: EmbeddingModel.Voyage4, value: 'test', signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'ABORTED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('retries only the failed batch and retains prior cost if it fails again', async () => {
    const send = vi.fn<typeof fetch>(async (_url, init) => {
      const { input } = JSON.parse(String(init?.body));
      if (input[0] === 'first') return Response.json({ data: [{ index: 0, embedding: vector(256) }], usage: { total_tokens: 5 } });
      return Response.json({ message: 'private provider body' }, { status: 429 });
    });
    const client = createLlmClient({
      providers: [voyageAdapter({ apiKey })], fetch: send, retries: { maxRetries: 1, baseDelayMs: 0 },
      embeddingModels: { [EmbeddingModel.Voyage4Lite]: { ...embeddingModelCatalog[EmbeddingModel.Voyage4Lite], maxBatchSize: 1 } },
      pricing: { [EmbeddingModel.Voyage4Lite]: { rates: { input: 0 } } },
    });
    await expect(client.embedMany({ model: EmbeddingModel.Voyage4Lite, values: ['first', 'second'], dimensions: 256 })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR', upstreamStatus: 429, accounting: {
        attemptCount: 3, usage: { inputTokens: 5 }, usageComplete: false, cost: { status: 'partial', estimatedUsd: 0 },
      },
    });
    expect(send.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).input)).toEqual([['first'], ['second'], ['second']]);
  });

  it('rejects an invalid provider vector with its reported usage', async () => {
    const send = vi.fn<typeof fetch>(async () => Response.json({
      data: [{ index: 0, embedding: vector(2) }], usage: { prompt_tokens: 4 },
    }));
    const client = createLlmClient({ providers: adapters, fetch: send });
    await expect(client.embed({ model: EmbeddingModel.TextEmbedding3Small, value: 'test', dimensions: 3 })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR', accounting: { attemptCount: 1, usage: { inputTokens: 4 } },
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it('uses one deadline even when a custom transport ignores cancellation', async () => {
    const adapter = defineProvider({
      id: 'custom', embeddingModels: { sample: { maxInputTokens: 100, maxBatchSize: 1 } },
      embedText: vi.fn<EmbeddingProviderAdapter['embedText']>(async () => new Promise<never>(() => {})),
    });
    const client = createLlmClient({ providers: [adapter], defaults: { timeoutMs: 20 } });
    await expect(client.embed({ model: 'custom:sample', value: 'hello' })).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(adapter.embedText).toHaveBeenCalledOnce();
    expect(adapter.embedText.mock.calls[0]?.[1]).toMatchObject({ signal: expect.objectContaining({ aborted: true }) });
  });

  it('returns deterministic offline embeddings at zero cost', async () => {
    const send = vi.fn<typeof fetch>();
    const client = createLlmClient({ providers: [], fetch: send });
    const result = await client.embed({ model: EmbeddingModel.Mock, value: 'a' });
    expect(result).toMatchObject({ dimensions: 8, attemptCount: 0, cost: { status: 'known', estimatedUsd: 0 } });
    const many = await client.embedMany({ model: EmbeddingModel.Mock, values: ['a', 'b', 'a'] });
    expect(many.embeddings[0]).toEqual(result.embedding);
    expect(many.embeddings[1]).not.toEqual(result.embedding);
    expect(many.embeddings[2]).toEqual(result.embedding);
    expect(send).not.toHaveBeenCalled();
  });
});
