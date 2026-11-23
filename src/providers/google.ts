import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { imageModelCatalog } from '../catalog.js';
import type { ProviderAdapter } from '../types.js';
import { noCacheWriteUsage, providerModels, reasoningOptions, settings, type ProviderSettings } from './shared.js';
import { tokenCount } from './embedding-http.js';

const embeddingUsage = z.object({ usageMetadata: z.object({ promptTokenCount: tokenCount }) });
export function googleAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return { id: 'google', imageModels: Object.fromEntries(Object.entries(imageModelCatalog).filter(([id]) => id.startsWith('google:')).map(([id, def]) => [id.slice('google:'.length), structuredClone(def)])),
    resolveImageModel: (id, context) => createGoogleGenerativeAI({ ...config, fetch: config.fetch ?? context.fetch }).image(id), models: providerModels('google'),
    resolveModel: (id, context) => createGoogleGenerativeAI({ ...config, fetch: config.fetch ?? context.fetch })(id),
    async embedText(id, { values, dimensions, inputType, signal }, context) {
      const model = createGoogleGenerativeAI({ ...config, fetch: config.fetch ?? context.fetch }).embeddingModel(id);
      const taskType = inputType === 'query' ? 'RETRIEVAL_QUERY' : inputType === 'document' ? 'RETRIEVAL_DOCUMENT' : undefined;
      const result = await model.doEmbed({ values, abortSignal: signal, providerOptions: { google: { outputDimensionality: dimensions, taskType } } });
      const usage = embeddingUsage.safeParse(result.response?.body);
      return { embeddings: result.embeddings, inputTokens: result.usage?.tokens ?? usage.data?.usageMetadata.promptTokenCount };
    },
    resolveOptions: (_, reasoning, caps) => reasoningOptions('google', reasoning, caps), normalizeUsage: noCacheWriteUsage,
  };
}
export type { ProviderSettings } from './shared.js';
