import type { LanguageModelUsage, ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4GenerateResult, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { ModelCapabilities } from '../src/types.js';
import { defineProvider } from '../src/index.js';
export const messages: ModelMessage[] = [{ role: 'user', content: 'synthetic test' }];
export const capabilities: ModelCapabilities = { images: false, structuredOutput: true, tools: true, streaming: true, temperature: { max: 2, withReasoning: true }, maxOutputTokens: 8192 };
export const rawUsage = { inputTokens: { total: 100, noCache: 80, cacheRead: 10, cacheWrite: 10 }, outputTokens: { total: 30, text: 20, reasoning: 10 } };
export function generated(text = 'hello', finishReason: LanguageModelV4GenerateResult['finishReason']['unified'] = 'stop'): LanguageModelV4GenerateResult {
  return { content: [{ type: 'text', text }], finishReason: { unified: finishReason, raw: finishReason }, usage: rawUsage, warnings: [] };
}
export function adapter(model: MockLanguageModelV4) {
  return defineProvider({ id: 'external', models: { test: { capabilities } }, resolveModel: () => model });
}
export function streamed(parts: LanguageModelV4StreamPart[]) {
  return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } }) };
}
export function textStream(text = 'hello'): LanguageModelV4StreamPart[] {
  return [{ type: 'stream-start', warnings: [] }, { type: 'text-start', id: 'text' }, { type: 'text-delta', id: 'text', delta: text }, { type: 'text-end', id: 'text' }, { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: rawUsage }];
}
export const pricing = { 'external:test': { rates: { input: 1, output: 2, cachedInput: 0.1, cacheWrite: 1.25 } } } as const;
export const usage: LanguageModelUsage = { inputTokens: 100, inputTokenDetails: { noCacheTokens: 80, cacheReadTokens: 10, cacheWriteTokens: 10 }, outputTokens: 30, outputTokenDetails: { textTokens: 20, reasoningTokens: 10 }, totalTokens: 130 };
