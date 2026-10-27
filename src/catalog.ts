import type { ModelCapabilities, ModelDefinition, ModelId, PricingEntry, ImageModelDefinition } from './types.js';

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const documents = ['application/pdf'];
const fileCaps = (mediaTypes: string[], maxFileBytes = 5 * 1024 * 1024, maxFiles = 10) => ({ mediaTypes, maxFileBytes, maxFiles, maxTotalBytes: 20 * 1024 * 1024 });
const common = { images: true, files: fileCaps([...imageTypes, ...documents]), structuredOutput: true, streaming: true, tools: true };
const xaiImages = ['image/png', 'image/jpeg'];
const effort: ModelCapabilities = { ...common, maxOutputTokens: 128_000, reasoning: { mode: 'effort', efforts: ['low', 'medium', 'high'] } };
const adaptive: ModelCapabilities = { ...common, maxOutputTokens: 128_000, reasoning: { mode: 'adaptive', efforts: ['none', 'low', 'medium', 'high'] } };
/** Conservative supported subset, updated 2026-10-27. Additional models can be registered per client. */
const languageDefinitions: Record<ModelId, ModelDefinition> = {
  'openai:gpt-6-astra': { capabilities: { ...effort, files: fileCaps([...imageTypes, ...documents, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'text/markdown', 'application/json', 'text/html', 'application/rtf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'], 20 * 1024 * 1024) }, source: 'https://developers.openai.com/api/docs/models/gpt-6-astra' },
  'anthropic:claude-sonnet-5': { capabilities: adaptive, source: 'https://platform.claude.com/docs/en/models/overview' },
  'anthropic:claude-opus-5': { capabilities: adaptive, source: 'https://platform.claude.com/docs/en/models/overview' },
  'anthropic:claude-haiku-4-5-20251001': {
    capabilities: { ...common, maxOutputTokens: 64_000, temperature: { max: 1, withReasoning: false }, reasoning: { mode: 'budget', efforts: ['none', 'low', 'medium', 'high'], budgetRange: [1024, 32_768] } },
    source: 'https://platform.claude.com/docs/en/models/overview',
  },
  'google:gemini-3.8-flash': { capabilities: { ...common, maxOutputTokens: 65_536, temperature: { max: 2, withReasoning: true }, reasoning: { mode: 'level', efforts: ['low', 'medium', 'high'] } }, source: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash' },
  'xai:grok-4.6': { capabilities: { ...effort, files: fileCaps(xaiImages), reasoning: { mode: 'effort', efforts: ['low', 'medium', 'high', 'xhigh'] } }, source: 'https://docs.x.ai/developers/models/grok-4.6' },
};
// Latest public family versions and active general-purpose alternatives. Restricted models
// remain selectable, but access is still controlled by the provider account.
const openaiCaps = languageDefinitions['openai:gpt-6-astra']!.capabilities;
const googleCaps = languageDefinitions['google:gemini-3.8-flash']!.capabilities;
const fullEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
for (const name of ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna']) languageDefinitions[`openai:${name}`] = {
  // The SDK drops `none` for Terra, so expose only efforts transported correctly.
  capabilities: { ...openaiCaps, reasoning: { mode: 'effort', efforts: name === 'gpt-6-luna' ? ['none', ...fullEfforts] : fullEfforts } },
  source: `https://developers.openai.com/api/docs/models/${name}`,
};
for (const name of ['claude-fable-5-1', 'claude-mythos-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5']) languageDefinitions[`anthropic:${name}`] = {
  capabilities: { ...adaptive, reasoning: { mode: 'adaptive', efforts: fullEfforts } },
  source: 'https://platform.claude.com/docs/en/models/overview',
};
languageDefinitions['anthropic:claude-haiku-5-5'] = {
  capabilities: { ...adaptive, reasoning: { mode: 'adaptive', efforts: ['none', ...fullEfforts] } },
  source: 'https://platform.claude.com/docs/en/models/haiku-5-5/overview',
};
// Synchronous generation only: Argon's longer decodes require a separate API flow.
languageDefinitions['google:gemini-4-argon'] = {
  capabilities: { ...googleCaps, maxOutputTokens: 65_536, temperature: undefined },
  source: 'https://ai.google.dev/gemini-api/docs/models/gemini-4-argon',
};
for (const name of ['deepseek-flash', 'deepseek-v4-pro']) languageDefinitions[`deepseek:${name}`] = {
  capabilities: {
    images: name === 'deepseek-flash',
    ...(name === 'deepseek-flash' ? { files: fileCaps([...imageTypes, 'image/gif']) } : {}),
    structuredOutput: true, streaming: true, tools: true, maxOutputTokens: 393_216,
    reasoning: { mode: 'effort', efforts: ['none', 'low', 'high', 'max'] },
  },
  source: 'https://api-docs.deepseek.com/quick_start/pricing/',
};
for (const name of ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview']) languageDefinitions[`google:${name}`] = {
  capabilities: { ...googleCaps, reasoning: { mode: 'level', efforts: ['gemini-3.1-pro-preview', 'gemini-3.7-flash'].includes(name) ? ['low', 'medium', 'high'] : ['minimal', 'low', 'medium', 'high'] } },
  source: `https://ai.google.dev/gemini-api/docs/models/${name}`,
};
for (const name of ['grok-4.7', 'grok-4.5', 'grok-4.3', 'grok-4.20-0309-reasoning', 'grok-4.20-0309-non-reasoning', 'grok-build-0.1']) languageDefinitions[`xai:${name}`] = {
  capabilities: name === 'grok-build-0.1' ? { ...effort, files: fileCaps(xaiImages), reasoning: undefined, maxOutputTokens: 16_384 }
    : { ...effort, files: fileCaps(xaiImages), reasoning: name === 'grok-4.20-0309-non-reasoning' ? undefined : { mode: 'effort', efforts: ['grok-4.7', 'grok-4.5'].includes(name) ? ['low', 'medium', 'high', 'xhigh'] : ['low', 'medium', 'high'] } },
  source: `https://docs.x.ai/developers/models/${name}`,
};
export const modelCatalog: Readonly<Record<ModelId, ModelDefinition>> = deepFreeze(languageDefinitions);
export const pricingVersion = '2026-10-27';
const openaiSource = 'https://developers.openai.com/api/docs/pricing';
const anthropicSource = 'https://platform.claude.com/docs/en/about-claude/pricing';
/** Standard/global/on-demand text and image token rates; excludes storage, hosted tools, tax and nonstandard service tiers. */
const priceDefinitions: Record<ModelId, PricingEntry> = {
  'openai:gpt-6-astra': { rates: { input: 10, output: 50, cachedInput: 1, cacheWrite: 12.5 }, longContext: { minimumInputTokens: 272_001, rates: { input: 20, output: 75, cachedInput: 2, cacheWrite: 25 } }, source: openaiSource, version: pricingVersion },
  'anthropic:claude-sonnet-5': { rates: { input: 2, output: 10, cachedInput: 0.2, cacheWrite: 2.5 }, source: anthropicSource, version: pricingVersion },
  'anthropic:claude-opus-5': { rates: { input: 5, output: 25, cachedInput: 0.5, cacheWrite: 6.25 }, source: anthropicSource, version: pricingVersion },
  'anthropic:claude-haiku-4-5-20251001': { rates: { input: 1, output: 5, cachedInput: 0.1, cacheWrite: 1.25 }, source: anthropicSource, version: pricingVersion },
  'google:gemini-3.8-flash': { rates: { input: 0.75, output: 3.75, cachedInput: 0.075 }, source: 'https://ai.google.dev/gemini-api/docs/pricing', version: pricingVersion },
  'xai:grok-imagine-image-2.0': { rates: { image: 0.04, inputImage: 0.01 }, source: 'https://docs.x.ai/developers/models/grok-imagine-image-2.0', version: pricingVersion },
  'xai:grok-4.6': { rates: { input: 2, output: 6, cachedInput: 0.5 }, longContext: { minimumInputTokens: 200_000, rates: { input: 4, output: 12, cachedInput: 1 } }, source: 'https://docs.x.ai/developers/pricing', version: pricingVersion },
};
const entry = (source: string, input: number, output: number, cachedInput: number, cacheWrite?: number): PricingEntry => ({ rates: { input, output, cachedInput, ...(cacheWrite !== undefined ? { cacheWrite } : {}) }, source, version: pricingVersion });
for (const [name, input, output, cached] of [['gpt-6.1-sol', 2, 10, 0.1], ['gpt-6.1-terra', 1, 5, 0.05], ['gpt-6-luna', 0.1, 0.5, 0.01]] as const) priceDefinitions[`openai:${name}`] = { ...entry(openaiSource, input, output, cached, input * 1.25), longContext: { minimumInputTokens: 272_001, rates: { input: input * 2, output: output * 1.5, cachedInput: cached * 2, cacheWrite: input * 2.5 } } };
for (const [name, input, output, cached] of [['claude-fable-5-1', 10, 50, 0.25], ['claude-mythos-5-1', 10, 50, 0.25], ['claude-opus-5-5', 4, 20, 0.2], ['claude-sonnet-5-5', 2, 10, 0.2]] as const) priceDefinitions[`anthropic:${name}`] = entry(anthropicSource, input, output, cached, input * 1.25);
priceDefinitions['anthropic:claude-haiku-5-5'] = {
  ...entry('https://platform.claude.com/docs/en/models/haiku-5-5/overview', 0.1, 0.5, 0.01, 0.125),
  longContext: { minimumInputTokens: 100_001, rates: { input: 0.5, output: 2.5, cachedInput: 0.05, cacheWrite: 0.625 } },
};
// DeepSeek prices depend on peak/off-peak hours and Chinese public holidays.
// Require explicit pricing rather than applying one rate to every request.
for (const name of ['deepseek-flash', 'deepseek-v4-pro']) priceDefinitions[`deepseek:${name}`] = {
  rates: {}, source: 'https://api-docs.deepseek.com/quick_start/pricing/', version: pricingVersion,
};
const googleSource = 'https://ai.google.dev/gemini-api/docs/pricing';
// Introductory standard rates through 2026-11-30; override for later requests.
priceDefinitions['google:gemini-4-argon'] = entry(googleSource, 2, 10, 0.1);
for (const name of ['gemini-3.7-flash', 'gemini-3.6-flash']) priceDefinitions[`google:${name}`] = entry(googleSource, 0.75, 3.75, 0.075);
for (const [name, input, output, cached] of [['gemini-3.5-flash', 1.5, 9, 0.15], ['gemini-3.5-flash-lite', 0.3, 2.5, 0.03], ['gemini-3.1-flash-lite', 0.25, 1.5, 0.025], ['gemini-3-flash-preview', 0.5, 3, 0.05]] as const) priceDefinitions[`google:${name}`] = entry(googleSource, input, output, cached);
priceDefinitions['google:gemini-3.1-pro-preview'] = { ...entry(googleSource, 2, 12, 0.2), longContext: { minimumInputTokens: 200_001, rates: { input: 4, output: 18, cachedInput: 0.4 } } };
const xaiSource = 'https://docs.x.ai/developers/pricing';
for (const [name, input, output, cached] of [['grok-4.7', 2, 6, 0.5], ['grok-4.5', 2, 6, 0.3], ['grok-4.3', 1.25, 2.5, 0.2], ['grok-build-0.1', 1, 2, 0.2], ['grok-4.20-0309-reasoning', 1.25, 2.5, 0.2], ['grok-4.20-0309-non-reasoning', 1.25, 2.5, 0.2]] as const) priceDefinitions[`xai:${name}`] = { ...entry(xaiSource, input, output, cached), longContext: { minimumInputTokens: 200_000, rates: { input: input * 2, output: output * 2, cachedInput: cached * 2 } } };
priceDefinitions['xai:grok-imagine-image'] = { rates: { image: 0.02, inputImage: 0.002 }, source: xaiSource, version: pricingVersion };
priceDefinitions['xai:grok-imagine-image-quality'] = { rates: { image: 0.05, inputImage: 0.01 }, source: xaiSource, version: pricingVersion };
export const defaultPricing: Readonly<Record<ModelId, PricingEntry>> = deepFreeze(priceDefinitions);
function deepFreeze<T extends object>(obj: T): T {
  for (const child of Object.values(obj)) if (child && typeof child === 'object') deepFreeze(child);
  return Object.freeze(obj);
}

/** Image-generation models have a separate capability contract. */
const imageDefinitions: Record<ModelId, ImageModelDefinition> = {
  'openai:gpt-image-2': { files: fileCaps(imageTypes, 20 * 1024 * 1024, 4), maxImages: 10, sizes: ['1024x1024', '1536x1024', '1024x1536'], source: 'https://developers.openai.com/api/docs/guides/image-generation' },
  'google:gemini-3.1-flash-image-preview': { files: fileCaps(imageTypes, 5 * 1024 * 1024, 4), maxImages: 10, aspectRatios: ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'], source: 'https://ai.google.dev/gemini-api/docs/image-generation' },
  'xai:grok-imagine-image-2.0': { files: fileCaps(imageTypes, 5 * 1024 * 1024, 5), maxImages: 10, aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'], source: 'https://docs.x.ai/developers/model-capabilities/images/generation' },
};
for (const name of ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']) imageDefinitions[`openai:${name}`] = { ...imageDefinitions['openai:gpt-image-2']!, source: `https://developers.openai.com/api/docs/models/${name}` };
for (const name of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image']) imageDefinitions[`google:${name}`] = { ...imageDefinitions['google:gemini-3.1-flash-image-preview']!, source: `https://ai.google.dev/gemini-api/docs/models/${name}` };
imageDefinitions['google:gemini-nano-banana-2.1'] = {
  ...imageDefinitions['google:gemini-3.1-flash-image-preview']!,
  source: 'https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1',
};
for (const name of ['grok-imagine-image', 'grok-imagine-image-quality']) imageDefinitions[`xai:${name}`] = { ...imageDefinitions['xai:grok-imagine-image-2.0']!, source: xaiSource };
for (const name of ['gemini-3.1-flash-lite-image', 'gemini-3-pro-image']) imageDefinitions[`google:${name}`]!.aspectRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const imageModelCatalog: Readonly<Record<ModelId, ImageModelDefinition>> = deepFreeze(imageDefinitions);
