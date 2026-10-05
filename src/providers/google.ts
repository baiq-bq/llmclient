import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { imageModelCatalog } from '../catalog.js';
import type { ProviderAdapter } from '../types.js';
import { noCacheWriteUsage, providerModels, reasoningOptions, settings, type ProviderSettings } from './shared.js';
export function googleAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return { id: 'google', imageModels: Object.fromEntries(Object.entries(imageModelCatalog).filter(([id]) => id.startsWith('google:')).map(([id, def]) => [id.slice('google:'.length), structuredClone(def)])),
    resolveImageModel: (id, context) => createGoogleGenerativeAI({ ...config, fetch: config.fetch ?? context.fetch }).image(id), models: providerModels('google'),
    resolveModel: (id, context) => createGoogleGenerativeAI({ ...config, fetch: config.fetch ?? context.fetch })(id),
    resolveOptions: (_, reasoning, caps) => reasoningOptions('google', reasoning, caps), normalizeUsage: noCacheWriteUsage,
  };
}
export type { ProviderSettings } from './shared.js';
