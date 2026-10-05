import type { ProviderOptions } from '../types.js';
import type { LanguageModelUsage } from 'ai';
import { normalizeUsage } from '../accounting.js';
import { invalidConfiguration } from '../errors.js';
import type { ModelCapabilities, ModelDefinition, Reasoning } from '../types.js';
import { modelCatalog } from '../catalog.js';

export interface ProviderSettings { apiKey: string; baseURL?: string; headers?: Record<string, string>; fetch?: typeof fetch; }
export function settings(input: ProviderSettings): ProviderSettings {
  if (!input || typeof input.apiKey !== 'string' || !input.apiKey.trim()) invalidConfiguration();
  if (input.baseURL !== undefined) {
    try { const url = new URL(input.baseURL); if (!['http:', 'https:'].includes(url.protocol)) invalidConfiguration(); } catch { invalidConfiguration(); }
  }
  return { ...input, headers: input.headers ? { ...input.headers } : undefined };
}
export function providerModels(id: string): Record<string, ModelDefinition> {
  return Object.fromEntries(Object.entries(modelCatalog).filter(([key]) => key.startsWith(`${id}:`)).map(([key, value]) => [key.slice(id.length + 1), structuredClone(value)]));
}
export function reasoningBudget(reasoning: Reasoning): number {
  return reasoning.effort === 'none' ? 0 : reasoning.budgetTokens ?? ({ minimal: 1024, low: 1024, medium: 4096, high: 16_384, xhigh: 32_768, max: 32_768 }[reasoning.effort]);
}
export function reasoningOptions(id: string, reasoning: Reasoning | undefined, caps: ModelCapabilities): ProviderOptions {
  if (!reasoning) return {};
  if (id === 'openai' || id === 'xai') return { [id]: { reasoningEffort: reasoning.effort } };
  if (id === 'anthropic') {
    if (reasoning.effort === 'none') return { anthropic: { thinking: { type: 'disabled' } } };
    return caps.reasoning?.mode === 'adaptive' ? { anthropic: { thinking: { type: 'adaptive' }, effort: reasoning.effort } }
      : { anthropic: { thinking: { type: 'enabled', budgetTokens: reasoningBudget(reasoning) } } };
  }
  return caps.reasoning?.mode === 'level' ? { google: { thinkingConfig: { thinkingLevel: reasoning.effort } } }
    : { google: { thinkingConfig: { thinkingBudget: reasoningBudget(reasoning) } } };
}
/** These APIs have no per-generation billable cache-write category. Cache storage is outside this client. */
export function noCacheWriteUsage(usage: LanguageModelUsage) {
  return { ...normalizeUsage(usage), cacheWriteTokens: 0 };
}
