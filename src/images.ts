import { generateImage, NoImageGeneratedError } from 'ai';
import { z } from 'zod';
import { Ledger } from './accounting.js';
import { Budget, classify } from './execution.js';
import { LlmError } from './errors.js';
import { fileReasons, validateFiles } from './validation.js';
import type { ImageModelDefinition, ImageRequest, ImageResult, ModelId, ProviderAdapter, RetryPolicy } from './types.js';
import type { ResolvedPricing } from './pricing.js';
const mockPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
export async function executeImages(input: ImageRequest<ModelId | 'mock'>, config: { providers: Map<string, ProviderAdapter>; models: Map<ModelId, ImageModelDefinition>; pricing: Map<ModelId, ResolvedPricing>; retries: RetryPolicy; fetch?: typeof fetch }): Promise<ImageResult> {
  if (!z.object({ model: z.string().regex(/^(mock|[^:]+:.+)$/), prompt: z.string().min(1), n: z.number().int().min(1).max(100).optional(), timeoutMs: z.number().int().positive().max(2_147_483_647).optional(), size: z.string().regex(/^\d+x\d+$/).optional(), aspectRatio: z.string().regex(/^\d+:\d+$/).optional(), seed: z.number().int().optional() }).strict().safeParse(Object.fromEntries(Object.entries(input).filter(([k]) => !['files', 'signal', 'providerOptions'].includes(k)))).success) throw new LlmError('INVALID_REQUEST');
  validateFiles(input.files ?? []);
  const budget = new Budget(input.timeoutMs ?? 60_000, input.signal);
  const imagePricing = input.model === 'mock' ? undefined : structuredClone(config.pricing.get(input.model));
  // Internal xAI rates are for 1K/low only. Custom rates may price another explicitly selected configuration.
  if (['xai:grok-imagine-image-2.0', 'xai:grok-imagine-image-quality'].includes(input.model) && (input.providerOptions?.xai?.resolution && input.providerOptions.xai.resolution !== '1k' || input.providerOptions?.xai?.quality && input.providerOptions.xai.quality !== 'low') && imagePricing?.standardOrigins.image !== 'custom') { if (imagePricing) delete imagePricing.entry.rates.image; }
  const ledger = new Ledger(input.model === 'mock' ? undefined : imagePricing);
  try {
    budget.check();
    if (input.model === 'mock') return { model: 'mock', provider: 'mock', images: Array.from({ length: input.n ?? 1 }, () => ({ bytes: Buffer.from(mockPng, 'base64'), mediaType: 'image/png' })), attemptCount: 0, usage: { images: input.n ?? 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 }, usageComplete: true, cost: { currency: 'USD', status: 'known', estimatedUsd: 0 }, entries: [] };
    const reasonsFor = (def: ImageModelDefinition) => [
      ...fileReasons(input.files ?? [], def.files),
      ...((input.n ?? 1) > def.maxImages ? ['too_many_images'] : []),
      ...(input.size !== undefined && !def.sizes?.includes(input.size) ? ['size_not_supported'] : []),
      ...(input.aspectRatio !== undefined && !def.aspectRatios?.includes(input.aspectRatio) ? ['aspect_ratio_not_supported'] : []),
      ...(input.seed !== undefined && !def.seed ? ['seed_not_supported'] : []),
    ];
    const definition = config.models.get(input.model);
    const reasons = definition ? reasonsFor(definition) : ['unknown_image_model'];
    if (reasons.length) throw new LlmError('UNSUPPORTED_CAPABILITY', { details: { model: input.model, operation: 'generateImage', reasons, validModels: [...config.models].filter(([, def]) => !reasonsFor(def).length).map(([model]) => ({ model, configured: !!config.providers.get(model.split(':')[0]!)?.resolveImageModel })) } });
    const providerId = input.model.split(':')[0]!;
    const adapter = config.providers.get(providerId);
    if (!adapter?.resolveImageModel) throw new LlmError('PROVIDER_NOT_CONFIGURED');
    const model = adapter.resolveImageModel(input.model.slice(providerId.length + 1), { fetch: config.fetch });
    const images: ImageResult['images'] = [];
    // Single-image calls prevent hidden SDK batching and preserve prior successes if a later call fails.
    for (let image = 0; image < (input.n ?? 1); image++) {
      for (let retry = 0; ; retry++) {
        budget.check(); ledger.begin(image + 1);
        try {
          const generated = await budget.race(generateImage({
            model, prompt: input.files?.length ? { text: input.prompt, images: input.files.map(f => f.bytes) } : input.prompt,
            n: 1, maxImagesPerCall: 1, size: input.size, aspectRatio: input.aspectRatio, seed: input.seed,
            providerOptions: providerId === 'xai' ? { ...input.providerOptions, xai: { resolution: '1k', quality: 'low', ...input.providerOptions?.xai } } : input.providerOptions, maxRetries: 0, abortSignal: budget.signal,
          }));
          ledger.record({ images: generated.images.length, inputImages: input.files?.length ?? 0, inputTokens: generated.usage.inputTokens, outputTokens: generated.usage.outputTokens, totalTokens: generated.usage.totalTokens });
          images.push(...generated.images.map(i => ({ bytes: i.uint8Array, mediaType: i.mediaType })));
          break;
        } catch (error) {
          if (NoImageGeneratedError.isInstance(error) && error.calls?.length) {
            const usage = error.calls[0]!.usage;
            ledger.record({ inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, totalTokens: usage?.totalTokens });
          }
          const failure = classify(error, budget);
          if (!failure.retryable || retry >= config.retries.maxRetries || images.length) throw failure;
          await budget.wait(Math.max(failure.retryAfterMs ?? 0, Math.min(config.retries.maxDelayMs, config.retries.baseDelayMs * 2 ** retry)));
        }
      }
    }
    return { ...ledger.snapshot(), model: input.model, provider: providerId, images };
  } catch (error) {
    const failure = classify(error, budget);
    throw new LlmError(failure.code, { retryable: failure.retryable, upstreamStatus: failure.upstreamStatus, details: failure.details, accounting: ledger.snapshot() });
  } finally { budget.close(); }
}
