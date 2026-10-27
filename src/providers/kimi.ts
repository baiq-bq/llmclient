import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type { LanguageModelUsage } from 'ai';
import type { ProviderAdapter, ProviderOptions, Usage } from '../types.js';
import { providerModels, settings, type ProviderSettings } from './shared.js';

/** Direct Moonshot Chat Completions; preserves reasoning_content across tool steps. */
export function kimiAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return {
    id: 'kimi', models: providerModels('kimi'),
    resolveModel: (id, context) => createMoonshotAI({ ...config, fetch: config.fetch ?? context.fetch })(id),
    resolveOptions: (_, reasoning): ProviderOptions => !reasoning ? {} : { moonshotai: { reasoningEffort: reasoning.effort } },
    normalizeUsage: kimiUsage,
  };
}

/** Read raw counters: the SDK substitutes zeros for several missing fields. */
function kimiUsage(usage: LanguageModelUsage): Usage {
  const raw = usage.raw;
  const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const detail = (value: unknown, key: string): unknown => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  const inputTokens = count(raw?.prompt_tokens);
  const outputTokens = count(raw?.completion_tokens);
  const cachedInputTokens = count(raw?.cached_tokens ?? detail(raw?.prompt_tokens_details, 'cached_tokens'));
  // K3 must report cache writes, including an explicit zero.
  const cacheWriteTokens = count(detail(raw?.prompt_tokens_details, 'cache_write_tokens'));
  return {
    inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens,
    uncachedInputTokens: inputTokens !== undefined && cachedInputTokens !== undefined && cacheWriteTokens !== undefined
      ? Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens) : undefined,
    totalTokens: count(raw?.total_tokens) ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined),
    reasoningTokens: count(detail(raw?.completion_tokens_details, 'reasoning_tokens')),
  };
}
export type { ProviderSettings } from './shared.js';
