import { z } from 'zod';
import { LlmError } from '../errors.js';
import type { EmbeddingProviderAdapter } from '../types.js';
import { indexedVector, orderedVectors, postEmbedding, tokenCount } from './embedding-http.js';
import { settings, type ProviderSettings } from './shared.js';

const responseSchema = z.object({
  data: z.array(indexedVector),
  usage: z.object({ prompt_tokens: tokenCount.optional(), total_tokens: tokenCount.optional() }).nullish(),
});
export function deepinfraAdapter(input: ProviderSettings): EmbeddingProviderAdapter {
  const config = settings(input);
  const baseURL = (config.baseURL ?? 'https://api.deepinfra.com/v1/openai').replace(/\/+$/, '');
  return {
    id: 'deepinfra',
    async embedText(model, { values, dimensions, inputType, signal }, context) {
      const task = inputType === 'query' ? 'search_query' : inputType;
      const raw = await postEmbedding(`${baseURL}/embeddings`, config, context, {
        model, input: values, dimensions, task, encoding_format: 'float',
      }, signal);
      const response = responseSchema.safeParse(raw);
      if (!response.success) throw new LlmError('PROVIDER_ERROR');
      const { data, usage } = response.data;
      return { embeddings: orderedVectors(data, values.length), inputTokens: usage?.prompt_tokens ?? usage?.total_tokens };
    },
  };
}
export type { ProviderSettings } from './shared.js';
