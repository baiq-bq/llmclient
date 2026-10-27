import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModelUsage } from 'ai';
import type { ProviderAdapter, ProviderOptions, Usage } from '../types.js';
import { providerModels, settings, type ProviderSettings } from './shared.js';

/** Native Chat Completions preserves reasoning_content across tool steps. */
export function deepseekAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return {
    id: 'deepseek', models: providerModels('deepseek'),
    resolveModel: (id, context) => createDeepSeek({ ...config, fetch: config.fetch ?? context.fetch })(id),
    resolveOptions: (_, reasoning): ProviderOptions => !reasoning ? {} : {
      deepseek: reasoning.effort === 'none'
        ? { thinking: { type: 'disabled' } }
        : { thinking: { type: 'enabled' }, reasoningEffort: reasoning.effort },
    },
    normalizeUsage: deepseekUsage,
  };
}

/** The SDK fills missing raw counts with zero. Preserve unknown consumption. */
function deepseekUsage(usage: LanguageModelUsage): Usage {
  const raw = usage.raw;
  const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const detail = (value: unknown, key: string): unknown => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  const inputTokens = count(raw?.prompt_tokens);
  const outputTokens = count(raw?.completion_tokens);
  const cachedInputTokens = count(raw?.prompt_cache_hit_tokens ?? detail(raw?.prompt_tokens_details, 'cached_tokens'));
  return {
    inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens: 0,
    uncachedInputTokens: count(raw?.prompt_cache_miss_tokens) ?? (inputTokens !== undefined && cachedInputTokens !== undefined ? Math.max(0, inputTokens - cachedInputTokens) : undefined),
    totalTokens: count(raw?.total_tokens) ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined),
    reasoningTokens: count(detail(raw?.completion_tokens_details, 'reasoning_tokens')),
  };
}
export type { ProviderSettings } from './shared.js';
