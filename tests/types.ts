// These assertions are checked by tsc, not executed. An unused @ts-expect-error fails typecheck.
import { createLlmClient, defineProvider, LanguageModel, ImageModel } from '../src/index.js';
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
