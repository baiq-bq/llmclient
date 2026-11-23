// These assertions are checked by tsc, not executed. An unused @ts-expect-error fails typecheck.
import { createLlmClient, defineProvider, LanguageModel, ImageModel, EmbeddingModel } from '../src/index.js';
import { MockLanguageModelV4 } from 'ai/test';
import { capabilities, messages } from './helpers.js';
if (false) {
  // @ts-expect-error default model typo
  createLlmClient({ providers: [], defaults: { model: 'openai:gpt-typo' } });
  const client = createLlmClient({ providers: [] });
  client.generate({ model: LanguageModel.GPT6Astra, messages });
  client.generate({ model: LanguageModel.DeepSeekFlash, messages });
  client.generate({ model: LanguageModel.GPT61Terra, messages });
  client.generate({ model: LanguageModel.ClaudeHaiku55, messages });
  client.generate({ model: LanguageModel.Gemini4Argon, messages });
  client.generateImage({ model: ImageModel.GeminiNanoBanana21, prompt: 'test' });
  client.generate({ model: LanguageModel.Qwen4Max, messages });
  client.generate({ model: 'qwen:qwen3.8-max-0902', messages });
  // @ts-expect-error model ids must be registered
  client.generate({ model: 'qwen:qwen4-mx', messages });
  client.generate({ model: LanguageModel.KimiK31Pro, messages });
  client.generate({ model: 'kimi:kimi-k3.1-pro-highspeed', messages });
  // @ts-expect-error Kimi typo must not become an arbitrary string
  client.generate({ model: 'kimi:kimi-k3.1-prp', messages });
  // @ts-expect-error Kimi is not an image generator
  client.generateImage({ model: LanguageModel.KimiK31Pro, prompt: 'test' });
  // @ts-expect-error DeepSeek typo must not become an arbitrary string
  client.generate({ model: 'deepseek:deepseek-flahs', messages });
  // @ts-expect-error DeepSeek is a language model, not an image generator
  client.generateImage({ model: LanguageModel.DeepSeekFlash, prompt: 'test' });
  client.generateImage({ model: ImageModel.GPTImage2, prompt: 'test' });
  // @ts-expect-error unknown language model
  client.generate({ model: 'openai:gpt-typo', messages });
  // @ts-expect-error image model cannot be used as a language model
  client.generate({ model: ImageModel.GPTImage2, messages });
  // @ts-expect-error language model cannot be used for image generation
  client.generateImage({ model: LanguageModel.GPT6Astra, prompt: 'test' });
  client.embed({ model: EmbeddingModel.Voyage4, value: 'test' });
  client.embedMany({ model: 'deepinfra:Qwen/Qwen3-Embedding-8B', values: ['test'] });
  // @ts-expect-error embedding ID is not a generation model
  client.generate({ model: EmbeddingModel.Voyage4, messages });
  // @ts-expect-error generation ID is not an embedding model
  client.embed({ model: LanguageModel.GPT6Astra, value: 'test' });
  // @ts-expect-error model IDs are case-sensitive
  client.embed({ model: 'deepinfra:Qwen/Qwen3-Embedding-8b', value: 'test' });
  const embeddingProvider = defineProvider({
    id: 'vector-only',
    embeddingModels: { sample: { maxInputTokens: 1_000, maxBatchSize: 8 } },
    async embedText() { return { embeddings: [[0.1]] }; },
  });
  const embeddingClient = createLlmClient({ providers: [embeddingProvider] });
  embeddingClient.embed({ model: 'vector-only:sample', value: 'test' });
  // @ts-expect-error unknown external embedding model
  embeddingClient.embed({ model: 'vector-only:typo', value: 'test' });
  const external = defineProvider({ id: 'acme', models: { custom: { capabilities } }, resolveModel: () => new MockLanguageModelV4() });
  const extensible = createLlmClient({ providers: [external] });
  extensible.generate({ model: 'acme:custom', messages });
  // @ts-expect-error custom model typo
  extensible.generate({ model: 'acme:typo', messages });
  const additional = createLlmClient({ providers: [], models: { 'acme:another': { capabilities } } });
  additional.generate({ model: 'acme:another', messages });
  // @ts-expect-error unregistered model
  additional.generate({ model: 'acme:typo', messages });
}
