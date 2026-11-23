import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Ledger } from './accounting.js';
import { Budget, classify } from './execution.js';
import { invalidConfiguration, LlmError } from './errors.js';
import type { ResolvedPricing } from './pricing.js';
import type { EmbeddingManyRequest, EmbeddingManyResult, EmbeddingModelDefinition, EmbeddingProviderAdapter, ModelId, RetryPolicy } from './types.js';

const positiveInteger = z.number().int().positive();
const dimensionsSchema = z.union([
  z.object({ min: positiveInteger, max: positiveInteger }).strict().refine(({ min, max }) => min <= max),
  z.array(positiveInteger).nonempty(),
]);
const definitionSchema = z.object({
  maxInputTokens: positiveInteger,
  maxBatchSize: positiveInteger,
  maxBatchBytes: positiveInteger.optional(),
  defaultDimensions: positiveInteger.optional(),
  dimensions: dimensionsSchema.optional(),
  inputType: z.boolean().optional(),
  status: z.enum(['stable', 'legacy', 'deprecated']).optional(),
  retirementDate: z.iso.date().optional(),
  source: z.string().optional(),
}).strict();
const requestSchema = z.object({
  model: z.string().regex(/^(mock|[^:]+:.+)$/),
  values: z.array(z.string().refine(value => value.trim().length > 0)).min(1),
  dimensions: positiveInteger.optional(),
  inputType: z.enum(['query', 'document']).optional(),
  timeoutMs: positiveInteger.max(2_147_483_647).optional(),
  signal: z.instanceof(AbortSignal).optional(),
}).strict();

export function validateEmbeddingModel(definition: EmbeddingModelDefinition) {
  if (!definitionSchema.safeParse(definition).success ||
      (definition.defaultDimensions !== undefined && !supportsDimensions(definition, definition.defaultDimensions))) {
    invalidConfiguration();
  }
}

function supportsDimensions(definition: EmbeddingModelDefinition, dimensions: number) {
  const allowed = definition.dimensions;
  if (!allowed) return dimensions === definition.defaultDimensions;
  return 'min' in allowed ? dimensions >= allowed.min && dimensions <= allowed.max : allowed.includes(dimensions);
}

function* batches(values: string[], { maxBatchSize, maxBatchBytes = Infinity }: EmbeddingModelDefinition) {
  let batch: string[] = [];
  let bytes = 0;
  for (const value of values) {
    const size = Buffer.byteLength(value);
    if (batch.length && (batch.length === maxBatchSize || bytes + size > maxBatchBytes)) {
      yield batch;
      batch = [];
      bytes = 0;
    }
    batch.push(value);
    bytes += size;
  }
  if (batch.length) yield batch;
}

export async function executeEmbeddings(
  input: EmbeddingManyRequest<ModelId | 'mock'>,
  operation: 'embed' | 'embedMany',
  config: {
    providers: Map<string, EmbeddingProviderAdapter>;
    models: Map<ModelId, EmbeddingModelDefinition>;
    pricing: Map<ModelId, ResolvedPricing>;
    retries: RetryPolicy;
    timeoutMs?: number;
    fetch?: typeof fetch;
  },
): Promise<EmbeddingManyResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) throw new LlmError('INVALID_REQUEST');
  const { values, dimensions, inputType, timeoutMs, signal } = parsed.data;
  const { model } = input;
  const budget = new Budget(timeoutMs ?? config.timeoutMs ?? 60_000, signal);
  const ledger = new Ledger(model === 'mock' ? undefined : config.pricing.get(model));
  try {
    budget.check();
    if (model === 'mock') {
      const size = dimensions ?? 8;
      if (size > 4096) throw new LlmError('INVALID_REQUEST');
      const embeddings = values.map(value => {
        const bytes = createHash('shake256', { outputLength: size * 2 }).update(value).digest();
        return Array.from({ length: size }, (_, i) => bytes.readUInt16BE(i * 2) / 32767.5 - 1);
      });
      budget.check();
      return {
        model, provider: 'mock', dimensions: size, embeddings, attemptCount: 0, usageComplete: true,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { status: 'known', currency: 'USD', estimatedUsd: 0 }, entries: [],
      };
    }

    const reasonsFor = (definition: EmbeddingModelDefinition) => [
      ...(dimensions !== undefined && !supportsDimensions(definition, dimensions) ? ['dimensions_not_supported'] : []),
      ...(inputType !== undefined && !definition.inputType ? ['input_type_not_supported'] : []),
    ];
    const definition = config.models.get(model);
    const reasons = definition ? reasonsFor(definition) : ['unknown_embedding_model'];
    if (!definition || reasons.length) {
      const validModels = [...config.models]
        .filter(([, candidate]) => !reasonsFor(candidate).length)
        .map(([id]) => ({ model: id, configured: config.providers.has(id.split(':')[0]!) }));
      throw new LlmError('UNSUPPORTED_CAPABILITY', { details: { model, operation, reasons, validModels } });
    }
    const provider = model.split(':')[0]!;
    const adapter = config.providers.get(provider);
    if (!adapter) throw new LlmError('PROVIDER_NOT_CONFIGURED');

    const modelId = model.slice(provider.length + 1);
    const embeddings: number[][] = [];
    let resultDimensions = dimensions ?? definition.defaultDimensions;
    let batchNumber = 0;
    for (const batch of batches(values, definition)) {
      batchNumber++;
      for (let retry = 0; ; retry++) {
        budget.check();
        ledger.begin(batchNumber);
        try {
          const result = await budget.race(adapter.embedText(modelId, {
            values: batch, dimensions: definition.dimensions ? dimensions : undefined, inputType, signal: budget.signal,
          }, { fetch: config.fetch }));
          const tokens = result.inputTokens;
          ledger.record({ inputTokens: tokens, totalTokens: tokens, uncachedInputTokens: tokens, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0 });
          resultDimensions ??= result.embeddings[0]?.length;
          if (!resultDimensions || result.embeddings.length !== batch.length ||
              result.embeddings.some(vector => vector.length !== resultDimensions || !vector.every(Number.isFinite))) {
            throw new LlmError('PROVIDER_ERROR');
          }
          embeddings.push(...result.embeddings);
          budget.check();
          break;
        } catch (error) {
          const failure = classify(error, budget);
          if (!failure.retryable || retry >= config.retries.maxRetries) throw failure;
          await budget.wait(Math.max(failure.retryAfterMs ?? 0, Math.min(config.retries.maxDelayMs, config.retries.baseDelayMs * 2 ** retry)));
        }
      }
    }
    return { ...ledger.snapshot(), model, provider, dimensions: resultDimensions!, embeddings };
  } catch (error) {
    const failure = classify(error, budget);
    throw new LlmError(failure.code, {
      retryable: failure.retryable, upstreamStatus: failure.upstreamStatus,
      retryAfterMs: failure.retryAfterMs, details: failure.details, accounting: ledger.snapshot(),
    });
  } finally { budget.close(); }
}
