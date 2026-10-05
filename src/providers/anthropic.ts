import { createAnthropic } from '@ai-sdk/anthropic';
import type { ProviderAdapter } from '../types.js';
import { providerModels, reasoningOptions, settings, type ProviderSettings } from './shared.js';
export function anthropicAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return { id: 'anthropic', models: providerModels('anthropic'),
    resolveModel: (id, context) => createAnthropic({ ...config, fetch: config.fetch ?? context.fetch })(id),
    resolveOptions: (_, reasoning, caps) => reasoningOptions('anthropic', reasoning, caps),
  };
}
export type { ProviderSettings } from './shared.js';
