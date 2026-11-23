import { APICallError } from 'ai';
import { z } from 'zod';
import { LlmError } from '../errors.js';
import type { AdapterContext } from '../types.js';
import type { ProviderSettings } from './shared.js';

export const tokenCount = z.number().int().nonnegative();
const index = tokenCount;
export const indexedVector = z.object({ index, embedding: z.array(z.number()) });

/** Return an invalid vector count for defective responses so the caller can still record usage. */
export function orderedVectors<T>(data: { index: number; embedding: T }[], expectedCount: number): T[] {
  if (data.length !== expectedCount) return [];
  const ordered = [...data].sort((a, b) => a.index - b.index);
  if (!ordered.every((item, i) => item.index === i)) return [];
  return ordered.map(item => item.embedding);
}

export async function postEmbedding(
  url: string, config: ProviderSettings, context: AdapterContext, body: object, signal: AbortSignal,
): Promise<unknown> {
  const headers = new Headers(config.headers);
  headers.set('authorization', `Bearer ${config.apiKey}`);
  headers.set('content-type', 'application/json');
  let response: Response;
  try {
    const send = config.fetch ?? context.fetch ?? globalThis.fetch;
    response = await send(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (error) {
    if (error instanceof TypeError) throw new LlmError('PROVIDER_ERROR', { retryable: true });
    throw error;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new APICallError({
      message: 'Embedding request failed.', url, requestBodyValues: undefined, statusCode: response.status,
      responseHeaders: { 'retry-after': response.headers.get('retry-after') ?? '' },
    });
  }
  return response.json();
}
