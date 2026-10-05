import { createXai } from '@ai-sdk/xai';
import { imageModelCatalog } from '../catalog.js';
import type { ProviderAdapter } from '../types.js';
import { noCacheWriteUsage, providerModels, reasoningOptions, settings, type ProviderSettings } from './shared.js';
export function xaiAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return { id: 'xai', imageModels: Object.fromEntries(Object.entries(imageModelCatalog).filter(([id]) => id.startsWith('xai:')).map(([id, def]) => [id.slice('xai:'.length), structuredClone(def)])),
    resolveImageModel: (id, context) => createXai({ ...config, fetch: config.fetch ?? context.fetch }).image(id), models: providerModels('xai'),
    resolveModel: (id, context) => createXai({ ...config, fetch: normalizeXaiFetch(config.fetch ?? context.fetch ?? fetch) }).responses(id),
    resolveOptions: (_, reasoning, caps) => reasoningOptions('xai', reasoning, caps), normalizeUsage: noCacheWriteUsage,
  };
}
/** The installed SDK expects a normalized incomplete status; preserve truncation/filter classification. */
function normalizeXaiFetch(send: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await send(input, init);
    if (!response.ok || response.headers.get('content-type')?.includes('text/event-stream')) return response;
    const body = await response.clone().json().catch(() => undefined);
    const reason = body?.status === 'incomplete' ? body?.incomplete_details?.reason : undefined;
    if (reason !== 'max_output_tokens' && reason !== 'content_filter') return response;
    const headers = new Headers(response.headers); headers.delete('content-encoding'); headers.delete('content-length');
    return new Response(JSON.stringify({ ...body, status: reason }), { status: response.status, statusText: response.statusText, headers });
  };
}
export type { ProviderSettings } from './shared.js';
