import type { BuiltinLanguageModel, BuiltinImageModel, BuiltinEmbeddingModel } from './models.js';
import type { generateText } from 'ai';
export type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]['providerOptions']>;
import type { ImageModel, LanguageModel, ModelMessage, ToolSet, TextStreamPart, LanguageModelUsage } from 'ai';
import type { z } from 'zod';

export type ModelId = `${string}:${string}`;
export type Reasoning = { effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'; budgetTokens?: number };
export interface ModelCapabilities {
  images: boolean;
  files?: FileCapabilities;
  structuredOutput: boolean;
  structuredOutputWithReasoning?: boolean;
  tools: boolean;
  streaming: boolean;
  temperature?: { max: number; withReasoning: boolean };
  reasoning?: {
    mode: 'effort' | 'adaptive' | 'budget' | 'level';
    efforts: readonly Reasoning['effort'][];
    budgetRange?: readonly [number, number];
    streamOnly?: boolean;
    budgetSharesOutputLimit?: boolean;
    maxCombinedOutputTokens?: number;
  };
  maxOutputTokens: number;
}
export interface ModelDefinition {
  capabilities: ModelCapabilities;
  /** Documentation used to verify capabilities. */
  source?: string;
  status?: 'stable' | 'preview' | 'restricted' | 'legacy' | 'deprecated';
  retirementDate?: string;
}
export interface AdapterContext { fetch?: typeof fetch }
/** An external adapter may wrap any SDK model, including a custom LanguageModel implementation. */
export interface ProviderAdapter extends Partial<Pick<EmbeddingProviderAdapter, 'embeddingModels' | 'embedText'>> {
  id: string;
  models?: Record<string, ModelDefinition>;
  imageModels?: Record<string, ImageModelDefinition>;
  resolveImageModel?(modelId: string, context: AdapterContext): ImageModel;
  resolveModel(modelId: string, context: AdapterContext): LanguageModel;
  resolveOptions?(modelId: string, reasoning: Reasoning | undefined, capabilities: ModelCapabilities, operation: { structuredOutput: boolean; streaming: boolean }): ProviderOptions;
  normalizeUsage?(usage: LanguageModelUsage): Usage;
}
export interface Rates {
  input?: number;
  output?: number;
  cachedInput?: number;
  cacheWrite?: number;
  /** USD per generated image (not per million). */
  image?: number;
  /** USD per reference image. */
  inputImage?: number;
}
export interface PricingEntry {
  rates: Rates;
  longContext?: { minimumInputTokens: number; rates: Rates };
  contextTiers?: readonly { minimumInputTokens: number; rates: Rates }[];
  /** Treat a cache hit as unpriced when the public cache rate is unavailable. */
  cachedInputFallback?: false;
  source?: string;
  version?: string;
}
export interface PricingOverride {
  rates?: Rates;
  longContext?: { minimumInputTokens?: number; rates?: Rates } | null;
  contextTiers?: PricingEntry['contextTiers'] | null;
  source?: string;
  version?: string;
}
export type PricingTable = Partial<Record<ModelId, PricingOverride>>;
export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  uncachedInputTokens?: number;
  images?: number;
  inputImages?: number;
}
export type RateKey = keyof Rates;
export interface AppliedPricing {
  rates: Rates;
  origins: Partial<Record<RateKey, 'internal' | 'custom'>>;
  context: 'standard' | 'long';
  source?: string;
  version?: string;
  internalSource?: string;
  internalVersion?: string;
}
export interface Cost {
  currency: 'USD';
  status: 'known' | 'partial' | 'unknown';
  /** Known subtotal. Null means that no billable component is known. */
  estimatedUsd: number | null;
  missing: string[];
  appliedPricing: AppliedPricing;
}
export interface AccountingEntry {
  attempt: number;
  step: number;
  usage: Usage;
  cost: Cost;
  /** Safe validation metadata only; never contains output text or provider bodies. */
  structuredOutput?: StructuredOutputDiagnostics;
}
export interface StructuredOutputIssue {
  code: string;
  path: (string | number)[];
  /** Generated from the issue code, never copied from a custom validator message. */
  message: string;
}
export interface StructuredOutputDiagnostics {
  kind: 'json_parse' | 'schema_validation' | 'no_output' | 'truncated' | 'unknown';
  issues: StructuredOutputIssue[];
  omittedIssueCount: number;
  finishReason?: string;
  outputCharacters?: number;
  repairContext: 'complete_output' | 'omitted_oversized_output' | 'omitted_truncated_output' | 'unavailable';
}
export interface Accounting {
  /** Provider invocations, including unsuccessful calls without reported usage. */
  attemptCount: number;
  usage: Usage;
  usageComplete: boolean;
  cost: { currency: 'USD'; status: Cost['status']; estimatedUsd: number | null };
  entries: AccountingEntry[];
}
export interface RetryPolicy {
  maxRetries: number;
  repairFromAttempt: number;
  maxRepairCharacters: number;
  baseDelayMs: number;
  maxDelayMs: number;
}
export interface RequestDefaults {
  model?: ModelId | 'mock';
  system?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxSteps?: number;
  temperature?: number;
  reasoning?: Reasoning;
}
export interface LlmClientOptions {
  providers: readonly (ProviderAdapter | EmbeddingProviderAdapter)[];
  models?: Partial<Record<ModelId, ModelDefinition>>;
  imageModels?: Partial<Record<ModelId, ImageModelDefinition>>;
  embeddingModels?: Partial<Record<ModelId, EmbeddingModelDefinition>>;
  pricing?: PricingTable;
  defaults?: RequestDefaults;
  retries?: Partial<RetryPolicy>;
  fetch?: typeof fetch;
  mock?: { text?: string; object?: unknown; generateObject?: (schema: z.ZodType) => unknown | Promise<unknown> };
}
export interface LlmRequest<M extends ModelId | 'mock' = BuiltinLanguageModel> extends RequestDefaults {
  model?: M;
  messages: ModelMessage[];
  files?: readonly InputFile[];
  images?: readonly { bytes: Uint8Array; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }[];
  tools?: ToolSet;
  signal?: AbortSignal;
  providerOptions?: ProviderOptions;
}
export interface ObjectOutput<T> { schema: z.ZodType<T>; name?: string; description?: string }
export interface LlmResult<T = never> extends Accounting {
  model: ModelId | 'mock';
  provider: string;
  text: string;
  finishReason: string;
  messages: ModelMessage[];
  toolCalls: unknown[];
  toolResults: unknown[];
  object?: T;
}
/** SDK event union, with raw provider chunks disabled. Object results are validated only at completion. */
export type LlmStreamEvent = TextStreamPart<ToolSet>;
export interface LlmStream<T = never> {
  events: AsyncIterable<LlmStreamEvent>;
  result: Promise<LlmResult<T>>;
  cancel(): void;
}

export interface InputFile { bytes: Uint8Array; mediaType: string; filename?: string }
export interface FileCapabilities { mediaTypes: readonly string[]; maxFileBytes: number; maxTotalBytes: number; maxFiles: number }
export interface ImageModelDefinition {
  files?: FileCapabilities;
  maxImages: number;
  sizes?: readonly string[];
  aspectRatios?: readonly string[];
  seed?: boolean;
  source?: string;
}
export interface ImageRequest<M extends ModelId | 'mock' = BuiltinImageModel> {
  model: M;
  prompt: string;
  files?: readonly InputFile[];
  n?: number;
  size?: `${number}x${number}`;
  aspectRatio?: `${number}:${number}`;
  seed?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  providerOptions?: ProviderOptions;
}
export interface ImageResult extends Accounting {
  model: ModelId | 'mock';
  provider: string;
  images: { bytes: Uint8Array; mediaType: string }[];
}

export interface EmbeddingModelDefinition {
  maxInputTokens: number;
  maxBatchSize: number;
  /** Conservative byte budget for grouping multiple texts in one call. */
  maxBatchBytes?: number;
  defaultDimensions?: number;
  dimensions?: { min: number; max: number } | readonly number[];
  inputType?: boolean;
  status?: 'stable' | 'legacy' | 'deprecated';
  retirementDate?: string;
  source?: string;
}
export interface EmbeddingModelOptions {
  dimensions?: number;
  inputType?: 'query' | 'document';
}
export interface EmbeddingProviderAdapter {
  id: string;
  embeddingModels?: Record<string, EmbeddingModelDefinition>;
  /** Embed one transport batch. Vectors must follow input order. */
  embedText(modelId: string, request: EmbeddingModelOptions & { values: string[]; signal: AbortSignal }, context: AdapterContext): Promise<{ embeddings: number[][]; inputTokens?: number }>;
}
interface EmbeddingRequestOptions<M> extends EmbeddingModelOptions {
  model: M;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface EmbeddingRequest<M extends ModelId | 'mock' = BuiltinEmbeddingModel> extends EmbeddingRequestOptions<M> {
  value: string;
}
export interface EmbeddingManyRequest<M extends ModelId | 'mock' = BuiltinEmbeddingModel> extends EmbeddingRequestOptions<M> {
  values: readonly string[];
}
interface EmbeddingAccounting extends Accounting {
  model: ModelId | 'mock';
  provider: string;
  dimensions: number;
}
export interface EmbeddingResult extends EmbeddingAccounting { embedding: number[] }
export interface EmbeddingManyResult extends EmbeddingAccounting { embeddings: number[][] }
export interface CompatibilityDetails {
  model: ModelId | 'mock';
  operation: 'generate' | 'generateObject' | 'stream' | 'generateImage' | 'embed' | 'embedMany';
  reasons: string[];
  validModels: { model: ModelId; configured: boolean }[];
}

type LiteralKeys<T> = string extends keyof T ? never : Extract<keyof T, string>;
type AdapterModels<A, K extends 'models' | 'imageModels' | 'embeddingModels'> = A extends { id: infer Id extends string } ? string extends Id ? never : K extends keyof A ? `${Id}:${LiteralKeys<NonNullable<A[K]>>}` : never : never;
export type ClientLanguageModels<O extends LlmClientOptions> = BuiltinLanguageModel | Extract<LiteralKeys<NonNullable<O['models']>>, ModelId> | AdapterModels<O['providers'][number], 'models'>;
export type ClientImageModels<O extends LlmClientOptions> = BuiltinImageModel | Extract<LiteralKeys<NonNullable<O['imageModels']>>, ModelId> | AdapterModels<O['providers'][number], 'imageModels'>;
export type ClientEmbeddingModels<O extends LlmClientOptions> = BuiltinEmbeddingModel | Extract<LiteralKeys<NonNullable<O['embeddingModels']>>, ModelId> | AdapterModels<O['providers'][number], 'embeddingModels'>;
/** Preserve literal adapter IDs and model keys so createLlmClient can infer custom model identifiers. */
export function defineProvider<const A extends ProviderAdapter | EmbeddingProviderAdapter>(adapter: A): A { return adapter; }
