import { createOpenAI } from '@ai-sdk/openai';
import { imageModelCatalog } from '../catalog.js';
import type { ProviderAdapter } from '../types.js';
import { providerModels, reasoningOptions, settings, type ProviderSettings } from './shared.js';
export function openaiAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return { id: 'openai', imageModels: Object.fromEntries(Object.entries(imageModelCatalog).filter(([id]) => id.startsWith('openai:')).map(([id, def]) => [id.slice('openai:'.length), structuredClone(def)])),
    resolveImageModel: (id, context) => createOpenAI({ ...config, fetch: config.fetch ?? context.fetch }).image(id), models: providerModels('openai'),
    resolveModel: (id, context) => createOpenAI({ ...config, fetch: config.fetch ?? context.fetch }).responses(id),
    resolveOptions: (_, reasoning, caps) => ({ openai: { ...reasoningOptions('openai', reasoning, caps).openai, passThroughUnsupportedFiles: true } }),
  };
}
export type { ProviderSettings } from './shared.js';
