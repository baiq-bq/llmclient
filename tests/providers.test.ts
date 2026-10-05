import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlmClient, LanguageModel, LlmError, type BuiltinLanguageModel, type LlmRequest } from '../src/index.js';
import { openaiAdapter } from '../src/providers/openai.js';
import { anthropicAdapter } from '../src/providers/anthropic.js';
import { googleAdapter } from '../src/providers/google.js';
import { xaiAdapter } from '../src/providers/xai.js';
import { messages } from './helpers.js';
const models = [LanguageModel.GPT6Astra, LanguageModel.ClaudeSonnet5, LanguageModel.Gemini38Flash, LanguageModel.Grok46] as const;
function client(transport: typeof fetch) { return createLlmClient({ providers: [openaiAdapter({ apiKey: 'synthetic' }), anthropicAdapter({ apiKey: 'synthetic' }), googleAdapter({ apiKey: 'synthetic' }), xaiAdapter({ apiKey: 'synthetic' })], fetch: transport, retries: { maxRetries: 0, baseDelayMs: 0 } }); }
function response(model: BuiltinLanguageModel, text: string, kind: 'valid' | 'length' | 'filter' = 'valid') {
  if (model.startsWith('google:')) return { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: kind === 'length' ? 'MAX_TOKENS' : kind === 'filter' ? 'SAFETY' : 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 10, cachedContentTokenCount: 10, totalTokenCount: 130 } };
  if (model.startsWith('anthropic:')) return { id: 'message-1', type: 'message', role: 'assistant', model: model.slice('anthropic:'.length), content: [{ type: 'text', text }], stop_reason: kind === 'length' ? 'max_tokens' : kind === 'filter' ? 'refusal' : 'end_turn', stop_sequence: null, usage: { input_tokens: 80, output_tokens: 30, cache_read_input_tokens: 10, cache_creation_input_tokens: 10 } };
  return { id: 'response-1', created_at: 1, object: 'response', model: model.slice(model.indexOf(':') + 1), status: kind === 'valid' ? 'completed' : 'incomplete', ...(kind === 'valid' ? {} : { incomplete_details: { reason: kind === 'length' ? 'max_output_tokens' : 'content_filter' } }), output: [{ type: 'message', id: 'message-1', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }], usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 10 } } };
}
describe('real SDK adapters using simulated HTTP', () => {
  it.each(models)('generates text and normalizes accounting for %s', async model => {
    const send = vi.fn<typeof fetch>(async () => Response.json(response(model, 'hello')));
    const result = await client(send).generate({ model, messages });
    expect(result.text).toBe('hello'); expect(result.attemptCount).toBe(1); expect(result.usage.inputTokens).toBe(100); expect(result.usage.outputTokens).toBe(30); expect(send).toHaveBeenCalledOnce();
  });
  it.each(models)('sends structured schema and validates %s', async model => {
    let body: any;
    const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json(response(model, '{"title":"book"}')); });
    const result = await client(send).generateObject({ model, messages }, { name: 'book', schema: z.object({ title: z.string() }) });
    expect(result.object.title).toBe('book');
    if (model.startsWith('google:')) expect(body.generationConfig.responseMimeType).toBe('application/json');
    else if (model.startsWith('anthropic:')) expect(body.output_config.format.type).toBe('json_schema');
    else expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
  });
  it.each(models)('preserves usage for invalid structured output from %s', async model => {
    const send = vi.fn<typeof fetch>(async () => Response.json(response(model, '{"title":1}')));
    const error = await client(send).generateObject({ model, messages }, { schema: z.object({ title: z.string() }) }).catch(e => e);
    expect(error.code).toBe('STRUCTURED_OUTPUT_ERROR'); expect(error.accounting.usage.inputTokens).toBe(100); expect(send).toHaveBeenCalledOnce();
  });
  it.each(models)('preserves truncation and usage from %s', async model => {
    const send = vi.fn<typeof fetch>(async () => Response.json(response(model, '{"title":"book"}', 'length')));
    const error = await client(send).generateObject({ model, messages }, { schema: z.object({ title: z.string() }) }).catch(e => e);
    expect(error.code).toBe('TRUNCATED_OUTPUT'); expect(error.accounting.usage.inputTokens).toBe(100);
  });
  it.each(models)('maps reasoning exactly and disables SDK retries for %s', async model => {
    let body: any;
    const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json({ error: { message: 'private' } }, { status: 503 }); });
    await expect(client(send).generate({ model, messages, reasoning: { effort: 'high' } })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(send).toHaveBeenCalledOnce();
    if (model.startsWith('google:')) expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('high');
    else if (model.startsWith('anthropic:')) { expect(body.thinking.type).toBe('adaptive'); expect(body.output_config.effort).toBe('high'); }
    else expect(body.reasoning.effort).toBe('high');
  });
  it('adds the Haiku thinking budget to its output limit', async () => {
    let body: any; const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json({}, { status: 400 }); });
    await client(send).generate({ model: LanguageModel.ClaudeHaiku45, messages, reasoning: { effort: 'low' }, maxOutputTokens: 4096 }).catch(() => {});
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 }); expect(body.max_tokens).toBe(5120);
  });
  it.each(models)('forwards cancellation to %s', async model => {
    const controller = new AbortController(); let signal: AbortSignal | null | undefined;
    const send = vi.fn<typeof fetch>(async (_, init) => { signal = init?.signal; controller.abort(); return new Promise(() => {}); });
    await expect(client(send).generate({ model, messages, signal: controller.signal })).rejects.toMatchObject({ code: 'ABORTED' }); expect(signal?.aborted).toBe(true); expect(send).toHaveBeenCalledOnce();
  });
  it('rejects unsupported capability before I/O with structured alternatives', async () => {
    const send = vi.fn<typeof fetch>();
    const error = await client(send).generate({ model: LanguageModel.GPT6Astra, messages, temperature: 1 }).catch(e => e);
    expect(error).toBeInstanceOf(LlmError); expect(error.details.reasons).toContain('temperature_not_supported');
    expect(error.details.validModels).toContainEqual({ model: LanguageModel.Gemini38Flash, configured: true }); expect(send).not.toHaveBeenCalled();
  });
  it('allows native PDF input for OpenAI, Anthropic and Google', async () => {
    for (const model of [LanguageModel.GPT6Astra, LanguageModel.ClaudeSonnet5, LanguageModel.Gemini38Flash]) {
      let body: any; const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json(response(model, 'hello')); });
      await client(send).generate({ model, messages, files: [{ bytes: Buffer.from('%PDF-1.7 synthetic'), mediaType: 'application/pdf', filename: 'test.pdf' }] });
      expect(send).toHaveBeenCalledOnce(); expect(JSON.stringify(body)).toMatch(/application\/pdf|document|input_file/);
    }
  });
  it('passes native DOCX to OpenAI Responses without conversion', async () => {
    let body: any; const send = vi.fn<typeof fetch>(async (_, init) => { body = JSON.parse(String(init?.body)); return Response.json(response(LanguageModel.GPT6Astra, 'hello')); });
    await client(send).generate({ model: LanguageModel.GPT6Astra, messages, files: [{ bytes: Buffer.from('PK synthetic'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'test.docx' }] });
    expect(body.input[0].content[0]).toMatchObject({ type: 'input_file', filename: 'test.docx' }); expect(body.input[0].content[0].file_data).toContain('wordprocessingml.document');
  });
  it('rejects DOCX on Google with OpenAI as compatible alternative', async () => {
    const send = vi.fn<typeof fetch>();
    const error = await client(send).generate({ model: LanguageModel.Gemini38Flash, messages, files: [{ bytes: Buffer.from('PK synthetic'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'test.docx' }] }).catch(e => e);
    expect(error.details.reasons).toContain('unsupported_media_type'); expect(error.details.validModels).toEqual(expect.arrayContaining([{ model: LanguageModel.GPT6Astra, configured: true }])); expect(send).not.toHaveBeenCalled();
  });
  it('validates embedded file parts, sizes and counts before I/O', async () => {
    const send = vi.fn<typeof fetch>();
    const error = await client(send).generate({ model: LanguageModel.Gemini38Flash, messages: [{ role: 'user', content: [{ type: 'file', data: Buffer.alloc(5 * 1024 * 1024 + 1), mediaType: 'application/pdf' }] }] }).catch(e => e);
    expect(error.details.reasons).toContain('file_too_large'); expect(error.details.validModels).toContainEqual({ model: LanguageModel.GPT6Astra, configured: true }); expect(send).not.toHaveBeenCalled();
  });
  it('labels unconfigured valid alternatives explicitly', async () => {
    const c = createLlmClient({ providers: [googleAdapter({ apiKey: 'synthetic', fetch: vi.fn() })] });
    const error = await c.generate({ model: LanguageModel.Gemini38Flash, messages, files: [{ bytes: Buffer.from('PK'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] }).catch(e => e);
    expect(error.details.validModels).toEqual(expect.arrayContaining([{ model: LanguageModel.GPT6Astra, configured: false }]));
  });
});
