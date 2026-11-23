import { z } from 'zod';
import { LlmError } from '../errors.js';
import type { EmbeddingProviderAdapter } from '../types.js';
import { indexedVector, orderedVectors, postEmbedding, tokenCount } from './embedding-http.js';
import { settings, type ProviderSettings } from './shared.js';

const usageSchema = z.object({ total_tokens: tokenCount }).nullish();
const responseSchema = z.object({ data: z.array(indexedVector), usage: usageSchema });
const contextualResponseSchema = z.object({
  data: z.array(z.object({ index: tokenCount, data: z.tuple([indexedVector]) })),
  usage: usageSchema,
});

export function voyageAdapter(input: ProviderSettings): EmbeddingProviderAdapter {
  const config = settings(input);
  const baseURL = (config.baseURL ?? 'https://api.voyageai.com/v1').replace(/\/+$/, '');
  return {
    id: 'voyage',
    async embedText(model, { values, dimensions, inputType, signal }, context) {
      const options = { model, output_dimension: dimensions, input_type: inputType };
      if (model.startsWith('voyage-context-')) {
        const raw = await postEmbedding(`${baseURL}/contextualizedembeddings`, config, context, {
          ...options, inputs: values.map(value => [value]),
        }, signal);
        const response = contextualResponseSchema.safeParse(raw);
        if (!response.success) throw new LlmError('PROVIDER_ERROR');
        const { data, usage } = response.data;
        const vectors = data.map(({ index, data: [item] }) => ({ index, embedding: item.index === 0 ? item.embedding : [] }));
        return { embeddings: orderedVectors(vectors, values.length), inputTokens: usage?.total_tokens };
      }
      const multimodal = model.startsWith('voyage-multimodal-');
      const body = multimodal
        ? { ...options, inputs: values.map(text => ({ content: [{ type: 'text', text }] })), truncation: false }
        : { ...options, input: values, truncation: false };
      const raw = await postEmbedding(`${baseURL}/${multimodal ? 'multimodalembeddings' : 'embeddings'}`, config, context, body, signal);
      const response = responseSchema.safeParse(raw);
      if (!response.success) throw new LlmError('PROVIDER_ERROR');
      const { data, usage } = response.data;
      return { embeddings: orderedVectors(data, values.length), inputTokens: usage?.total_tokens };
    },
  };
}
export type { ProviderSettings } from './shared.js';
