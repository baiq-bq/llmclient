import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { imageModelCatalog } from '../catalog.js';
import type { ProviderAdapter } from '../types.js';
import { providerModels, reasoningOptions, settings, type ProviderSettings } from './shared.js';
import { orderedVectors, tokenCount } from './embedding-http.js';

const responseIndices = z.object({ data: z.array(z.object({ index: tokenCount })) });
export function openaiAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return { id: 'openai', imageModels: Object.fromEntries(Object.entries(imageModelCatalog).filter(([id]) => id.startsWith('openai:')).map(([id, def]) => [id.slice('openai:'.length), structuredClone(def)])),
    resolveImageModel: (id, context) => createOpenAI({ ...config, fetch: config.fetch ?? context.fetch }).image(id), models: providerModels('openai'),
    resolveModel: (id, context) => createOpenAI({ ...config, fetch: config.fetch ?? context.fetch }).responses(id),
    async embedText(id, { values, dimensions, signal }, context) {
      const model = createOpenAI({ ...config, fetch: config.fetch ?? context.fetch }).embeddingModel(id);
      const result = await model.doEmbed({ values, abortSignal: signal, providerOptions: { openai: { dimensions } } });
      const indices = responseIndices.safeParse(result.response?.body);
      const embeddings = indices.success
        ? orderedVectors(indices.data.data.map(({ index }, i) => ({ index, embedding: result.embeddings[i]! })), values.length)
        : [];
      return { embeddings, inputTokens: result.usage?.tokens };
    },
    resolveOptions: (_, reasoning, caps) => ({ openai: { ...reasoningOptions('openai', reasoning, caps).openai, passThroughUnsupportedFiles: true } }),
  };
}
export type { ProviderSettings } from './shared.js';
