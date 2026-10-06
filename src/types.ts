import type { BuiltinLanguageModel, BuiltinImageModel } from './models.js';
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
  tools: boolean;
  streaming: boolean;
  temperature?: { max: number; withReasoning: boolean };
  reasoning?: { mode: 'effort' | 'adaptive' | 'budget' | 'level'; efforts: readonly Reasoning['effort'][]; budgetRange?: readonly [number, number] };
  maxOutputTokens: number;
}
export interface ModelDefinition {
  capabilities: ModelCapabilities;
  /** Documentation used to verify capabilities. */
  source?: string;
}
export interface AdapterContext { fetch?: typeof fetch }
/** An external adapter may wrap any SDK model, including a custom LanguageModel implementation. */
export interface ProviderAdapter {
  id: string;
  models?: Record<string, ModelDefinition>;
  imageModels?: Record<string, ImageModelDefinition>;
  resolveImageModel?(modelId: string, context: AdapterContext): ImageModel;
  resolveModel(modelId: string, context: AdapterContext): LanguageModel;
  resolveOptions?(modelId: string, reasoning: Reasoning | undefined, capabilities: ModelCapabilities): ProviderOptions;
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
  source?: string;
  version?: string;
}
export interface PricingOverride {
  rates?: Rates;
  longContext?: { minimumInputTokens?: number; rates?: Rates } | null;
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
  providers: readonly ProviderAdapter[];
  models?: Partial<Record<ModelId, ModelDefinition>>;
  imageModels?: Partial<Record<ModelId, ImageModelDefinition>>;
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
export interface CompatibilityDetails {
  model: ModelId | 'mock';
  operation: 'generate' | 'generateObject' | 'stream' | 'generateImage';
  reasons: string[];
  validModels: { model: ModelId; configured: boolean }[];
}

type LiteralKeys<T> = string extends keyof T ? never : Extract<keyof T, string>;
type AdapterModels<A, K extends 'models' | 'imageModels'> = A extends { id: infer Id extends string } ? string extends Id ? never : K extends keyof A ? `${Id}:${LiteralKeys<NonNullable<A[K]>>}` : never : never;
export type ClientLanguageModels<O extends LlmClientOptions> = BuiltinLanguageModel | Extract<LiteralKeys<NonNullable<O['models']>>, ModelId> | AdapterModels<O['providers'][number], 'models'>;
export type ClientImageModels<O extends LlmClientOptions> = BuiltinImageModel | Extract<LiteralKeys<NonNullable<O['imageModels']>>, ModelId> | AdapterModels<O['providers'][number], 'imageModels'>;
/** Preserve literal adapter IDs and model keys so createLlmClient can infer custom model identifiers. */
export function defineProvider<const A extends ProviderAdapter>(adapter: A): A { return adapter; }
