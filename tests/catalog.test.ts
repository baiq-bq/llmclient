import { describe, expect, it, vi } from 'vitest';
import { builtinLanguageModels, builtinImageModels, createLlmClient, defaultPricing, modelCatalog, imageModelCatalog, LanguageModel, type BuiltinLanguageModel, type Reasoning } from '../src/index.js';
import { openaiAdapter } from '../src/providers/openai.js';
import { anthropicAdapter } from '../src/providers/anthropic.js';
import { googleAdapter } from '../src/providers/google.js';
import { xaiAdapter } from '../src/providers/xai.js';
const adapters = [openaiAdapter({ apiKey: 'synthetic' }), anthropicAdapter({ apiKey: 'synthetic' }), googleAdapter({ apiKey: 'synthetic' }), xaiAdapter({ apiKey: 'synthetic' })];
const messages = [{ role: 'user' as const, content: 'test' }];
describe('verified catalog transport compatibility', () => {
  it('keeps exported identifiers and adapter catalogs synchronized', () => {
    expect([...builtinLanguageModels].filter(id => id !== 'mock').sort()).toEqual(Object.keys(modelCatalog).sort());
    expect([...builtinImageModels].filter(id => id !== 'mock').sort()).toEqual(Object.keys(imageModelCatalog).sort());
    for (const adapter of adapters) {
      expect(Object.keys(adapter.models!).map(id => `${adapter.id}:${id}`).sort()).toEqual(Object.keys(modelCatalog).filter(id => id.startsWith(`${adapter.id}:`)).sort());
    }
    for (const model of Object.keys(modelCatalog)) expect(defaultPricing[model as keyof typeof defaultPricing]).toHaveProperty('version', '2026-10-05');
  });
  it.each(builtinLanguageModels.filter(id => id !== 'mock'))('sends the exact language model ID for %s', async model => {
    let body: any; let url: string;
    const send = vi.fn<typeof fetch>(async (input, init) => { url = String(input); body = JSON.parse(String(init?.body)); return Response.json({ error: { message: 'synthetic failure' } }, { status: 400 }); });
    await expect(createLlmClient({ providers: adapters, fetch: send }).generate({ model, messages })).rejects.toMatchObject({ code: 'PROVIDER_ERROR', upstreamStatus: 400 });
    expect(send).toHaveBeenCalledOnce();
    const apiId = model.slice(model.indexOf(':') + 1);
    if (model.startsWith('google:')) expect(url!).toContain(apiId);
    else expect(body.model).toBe(apiId);
  });
  const reasoningCases = Object.entries(modelCatalog).flatMap(([model, def]) => (def.capabilities.reasoning?.efforts ?? []).map(effort => ({ model: model as BuiltinLanguageModel, effort })));
  it.each(reasoningCases)('maps $model effort $effort through its SDK', async ({ model, effort }) => {
    let body: any;
    const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json({}, { status: 400 }); });
    await createLlmClient({ providers: adapters, fetch: send }).generate({ model, messages, reasoning: { effort } as Reasoning }).catch(() => {});
    expect(send).toHaveBeenCalledOnce();
    if (model.startsWith('google:')) expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe(effort);
    else if (model.startsWith('anthropic:')) {
      if (effort === 'none') expect(body.thinking.type).toBe('disabled');
      else if (model !== LanguageModel.ClaudeHaiku45) expect(body.output_config.effort).toBe(effort);
      else expect(body.thinking.type).toBe('enabled');
    } else expect(body.reasoning.effort).toBe(effort);
  });
  it.each(builtinImageModels.filter(id => id !== 'mock'))('sends the exact image model ID for %s', async model => {
    let body: any; let url: string;
    const send = vi.fn<typeof fetch>(async (input, init) => { url = String(input); body = JSON.parse(String(init?.body)); return Response.json({}, { status: 400 }); });
    await expect(createLlmClient({ providers: adapters, fetch: send }).generateImage({ model, prompt: 'test' })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(send).toHaveBeenCalledOnce();
    const apiId = model.slice(model.indexOf(':') + 1);
    if (model.startsWith('google:')) expect(url!).toContain(apiId);
    else expect(body.model).toBe(apiId);
  });
  it('rejects always-on thinking and unsupported xAI formats before transport', async () => {
    const send = vi.fn<typeof fetch>(); const client = createLlmClient({ providers: adapters, fetch: send });
    await expect(client.generate({ model: LanguageModel.ClaudeOpus55, messages, reasoning: { effort: 'none' } })).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    await expect(client.generate({ model: LanguageModel.Grok47, messages, images: [{ bytes: Buffer.from('synthetic'), mediaType: 'image/webp' }] })).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
    expect(send).not.toHaveBeenCalled();
  });
});
