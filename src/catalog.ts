import { qwenModelDefinitions, qwenPriceDefinitions } from './qwen-catalog.js';
import { EmbeddingModel, type BuiltinEmbeddingModel } from './models.js';
import type { EmbeddingModelDefinition, ModelCapabilities, ModelDefinition, ModelId, PricingEntry, ImageModelDefinition } from './types.js';

const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const documents = ['application/pdf'];
const fileCaps = (mediaTypes: string[], maxFileBytes = 5 * 1024 * 1024, maxFiles = 10) => ({ mediaTypes, maxFileBytes, maxFiles, maxTotalBytes: 20 * 1024 * 1024 });
const common = { images: true, files: fileCaps([...imageTypes, ...documents]), structuredOutput: true, streaming: true, tools: true };
const xaiImages = ['image/png', 'image/jpeg'];
const effort: ModelCapabilities = { ...common, maxOutputTokens: 128_000, reasoning: { mode: 'effort', efforts: ['low', 'medium', 'high'] } };
const adaptive: ModelCapabilities = { ...common, maxOutputTokens: 128_000, reasoning: { mode: 'adaptive', efforts: ['none', 'low', 'medium', 'high'] } };
/** Conservative supported subset, updated 2026-11-19. Additional models can be registered per client. */
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
for (const name of ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna']) languageDefinitions[`openai:${name}`] = {
  // The SDK drops `none` for Terra, so expose only efforts transported correctly.
  capabilities: { ...openaiCaps, reasoning: { mode: 'effort', efforts: name === 'gpt-6-luna' ? ['none', ...fullEfforts] : fullEfforts } },
  source: `https://developers.openai.com/api/docs/models/${name}`,
};
for (const name of ['claude-fable-5-2', 'claude-mythos-5-2', 'claude-fable-5-1', 'claude-mythos-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5']) languageDefinitions[`anthropic:${name}`] = {
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
// Neon and Hydrogen support xhigh upstream, but the installed Google SDK cannot transport it.
for (const name of ['gemini-4-carbon', 'gemini-4-neon', 'gemini-4-hydrogen']) languageDefinitions[`google:${name}`] = {
  capabilities: { ...googleCaps, temperature: undefined, reasoning: { mode: 'level', efforts: ['low', 'medium', 'high'] } },
  source: `https://aistudio.google.com/docs/models/${name}`,
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
// Verified 2026-11-19. Conservative synchronous output cap, not the context window.
for (const name of ['kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed', 'kimi-k3']) languageDefinitions[`kimi:${name}`] = {
  capabilities: {
    images: true, files: fileCaps([...imageTypes, 'image/gif']),
    structuredOutput: true, streaming: true, tools: true, maxOutputTokens: 32_768,
    reasoning: { mode: 'effort', efforts: ['low', 'high', 'max'] },
  },
  source: 'https://platform.kimi.ai/docs/models',
};
export const modelCatalog: Readonly<Record<ModelId, ModelDefinition>> = deepFreeze({ ...languageDefinitions, ...qwenModelDefinitions });
export const pricingVersion = '2026-11-19';
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
for (const [name, input, output, cached] of [['gpt-6.2-astra', 8, 40, 0.4], ['gpt-6.2-sol', 2, 10, 0.1], ['gpt-6.1-sol', 2, 10, 0.1], ['gpt-6.1-terra', 1, 5, 0.05], ['gpt-6-luna', 0.1, 0.5, 0.01]] as const) priceDefinitions[`openai:${name}`] = { ...entry(openaiSource, input, output, cached, input * 1.25), longContext: { minimumInputTokens: 272_001, rates: { input: input * 2, output: output * 1.5, cachedInput: cached * 2, cacheWrite: input * 2.5 } } };
for (const [name, input, output, cached] of [['claude-fable-5-2', 8, 40, 0.2], ['claude-mythos-5-2', 8, 40, 0.2], ['claude-fable-5-1', 10, 50, 0.25], ['claude-mythos-5-1', 10, 50, 0.25], ['claude-opus-5-5', 4, 20, 0.2], ['claude-sonnet-5-5', 2, 10, 0.1]] as const) priceDefinitions[`anthropic:${name}`] = entry(anthropicSource, input, output, cached, input * 1.25);
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
priceDefinitions['google:gemini-4-carbon'] = entry(googleSource, 2, 10, 0.1);
priceDefinitions['google:gemini-4-neon'] = entry(googleSource, 3, 15, 0.15);
priceDefinitions['google:gemini-4-hydrogen'] = entry(googleSource, 1.5, 7.5, 0.075);
for (const name of ['gemini-3.7-flash', 'gemini-3.6-flash']) priceDefinitions[`google:${name}`] = entry(googleSource, 0.75, 3.75, 0.075);
for (const [name, input, output, cached] of [['gemini-3.5-flash', 1.5, 9, 0.15], ['gemini-3.5-flash-lite', 0.3, 2.5, 0.03], ['gemini-3.1-flash-lite', 0.25, 1.5, 0.025], ['gemini-3-flash-preview', 0.5, 3, 0.05]] as const) priceDefinitions[`google:${name}`] = entry(googleSource, input, output, cached);
priceDefinitions['google:gemini-3.1-pro-preview'] = { ...entry(googleSource, 2, 12, 0.2), longContext: { minimumInputTokens: 200_001, rates: { input: 4, output: 18, cachedInput: 0.4 } } };
const xaiSource = 'https://docs.x.ai/developers/pricing';
for (const [name, input, output, cached] of [['grok-4.7', 2, 6, 0.5], ['grok-4.5', 2, 6, 0.3], ['grok-4.3', 1.25, 2.5, 0.2], ['grok-build-0.1', 1, 2, 0.2], ['grok-4.20-0309-reasoning', 1.25, 2.5, 0.2], ['grok-4.20-0309-non-reasoning', 1.25, 2.5, 0.2]] as const) priceDefinitions[`xai:${name}`] = { ...entry(xaiSource, input, output, cached), longContext: { minimumInputTokens: 200_000, rates: { input: input * 2, output: output * 2, cachedInput: cached * 2 } } };
priceDefinitions['xai:grok-imagine-image'] = { rates: { image: 0.02, inputImage: 0.002 }, source: xaiSource, version: pricingVersion };
priceDefinitions['xai:grok-imagine-image-quality'] = { rates: { image: 0.04, inputImage: 0.01 }, source: 'https://docs.x.ai/developers/migration/imagine-image-quality-nov-2', version: pricingVersion };
// K3 cacheWrite uses the default 5m TTL. A 1h TTL requires an explicit rate override.
for (const [name, input, output, cached, write] of [
  ['kimi-k3.1-pro', 2, 10, 0.2, 2], ['kimi-k3.1-pro-highspeed', 4, 20, 0.2, 4], ['kimi-k3', 3, 15, 0.3, 3],
] as const) priceDefinitions[`kimi:${name}`] = entry('https://platform.kimi.ai/docs/pricing/chat', input, output, cached, write);
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
for (const name of ['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']) imageDefinitions[`openai:${name}`] = { ...imageDefinitions['openai:gpt-image-2']!, source: `https://developers.openai.com/api/docs/models/${name}` };
for (const name of ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image']) imageDefinitions[`google:${name}`] = { ...imageDefinitions['google:gemini-3.1-flash-image-preview']!, source: `https://ai.google.dev/gemini-api/docs/models/${name}` };
imageDefinitions['google:gemini-nano-banana-2.1'] = {
  ...imageDefinitions['google:gemini-3.1-flash-image-preview']!,
  source: 'https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1',
};
for (const name of ['grok-imagine-image', 'grok-imagine-image-quality']) imageDefinitions[`xai:${name}`] = { ...imageDefinitions['xai:grok-imagine-image-2.0']!, source: xaiSource };
for (const name of ['gemini-3.1-flash-lite-image', 'gemini-3-pro-image']) imageDefinitions[`google:${name}`]!.aspectRatios = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const imageModelCatalog: Readonly<Record<ModelId, ImageModelDefinition>> = deepFreeze(imageDefinitions);

const embeddingPricingVersion = '2026-11-23';
const voyageTextSource = 'https://docs.voyageai.com/docs/embeddings';
const voyageContextSource = 'https://docs.voyageai.com/docs/contextualized-chunk-embeddings';
const voyageMultimodalSource = 'https://docs.voyageai.com/docs/multimodal-embeddings';
const voyageDimensions = [256, 512, 1024, 2048] as const;

function embedding(maxInputTokens: number, maxBatchSize: number, defaultDimensions: number | undefined, input: number, source: string, options: Partial<EmbeddingModelDefinition> = {}, pricingSource = source) {
  const definition: EmbeddingModelDefinition = { maxInputTokens, maxBatchSize, defaultDimensions, source, status: 'stable', ...options };
  const pricing: PricingEntry = { rates: { input }, source: pricingSource, version: embeddingPricingVersion };
  return { definition, pricing };
}
function voyageEmbedding(maxInputTokens: number, dimensions: number, input: number, source: string, options?: Partial<EmbeddingModelDefinition>) {
  return embedding(maxInputTokens, 100, dimensions, input, source, { inputType: true, maxBatchBytes: 100_000, ...options }, 'https://docs.voyageai.com/docs/pricing');
}
function deepInfraEmbedding(id: string, maxInputTokens: number, dimensions: number | undefined, input: number, options?: Partial<EmbeddingModelDefinition>) {
  return embedding(maxInputTokens, 32, dimensions, input, `https://deepinfra.com/${id}/api`, { maxBatchBytes: 100_000, ...options });
}

const embeddingDefinitions = {
  [EmbeddingModel.TextEmbedding3Small]: embedding(8_192, 32, 1_536, 0.02, 'https://developers.openai.com/api/docs/models/text-embedding-3-small', { dimensions: { min: 1, max: 1536 }, maxBatchBytes: 300_000 }),
  [EmbeddingModel.TextEmbedding3Large]: embedding(8_192, 32, 3_072, 0.13, 'https://developers.openai.com/api/docs/models/text-embedding-3-large', { dimensions: { min: 1, max: 3072 }, maxBatchBytes: 300_000 }),
  [EmbeddingModel.GeminiEmbedding2]: embedding(8_192, 100, 3_072, 0.20, 'https://ai.google.dev/gemini-api/docs/embeddings', { dimensions: { min: 128, max: 3072 } }, 'https://ai.google.dev/gemini-api/docs/pricing#gemini-embedding-2'),
  [EmbeddingModel.GeminiEmbedding001]: embedding(2_048, 100, 3_072, 0.15, 'https://ai.google.dev/gemini-api/docs/embeddings', { dimensions: { min: 128, max: 3072 }, inputType: true, status: 'legacy', retirementDate: '2028-05-14' }, 'https://ai.google.dev/gemini-api/docs/pricing#gemini-embedding'),
  [EmbeddingModel.Voyage4Lite]: voyageEmbedding(32_000, 1_024, 0.02, voyageTextSource, { dimensions: voyageDimensions }),
  [EmbeddingModel.Voyage4]: voyageEmbedding(32_000, 1_024, 0.06, voyageTextSource, { dimensions: voyageDimensions }),
  [EmbeddingModel.Voyage4Large]: voyageEmbedding(32_000, 1_024, 0.12, voyageTextSource, { dimensions: voyageDimensions }),
  [EmbeddingModel.VoyageCode4]: voyageEmbedding(32_000, 1_024, 0.12, voyageTextSource, { dimensions: voyageDimensions }),
  [EmbeddingModel.VoyageContext4]: voyageEmbedding(32_000, 1_024, 0.12, voyageContextSource, { dimensions: voyageDimensions, maxBatchBytes: 30_000 }),
  [EmbeddingModel.VoyageMultimodal35]: voyageEmbedding(32_000, 1_024, 0.12, voyageMultimodalSource, { dimensions: voyageDimensions }),
  [EmbeddingModel.Voyage35Lite]: voyageEmbedding(32_000, 1_024, 0.02, voyageTextSource, { dimensions: voyageDimensions, status: 'legacy', retirementDate: '2027-12-01' }),
  [EmbeddingModel.Voyage35]: voyageEmbedding(32_000, 1_024, 0.06, voyageTextSource, { dimensions: voyageDimensions, status: 'legacy', retirementDate: '2027-12-01' }),
  [EmbeddingModel.Voyage3Large]: voyageEmbedding(32_000, 1_024, 0.18, voyageTextSource, { dimensions: voyageDimensions, status: 'legacy', retirementDate: '2027-12-01' }),
  [EmbeddingModel.Voyage3]: voyageEmbedding(32_000, 1_024, 0.06, voyageTextSource, { status: 'legacy' }),
  [EmbeddingModel.Voyage3Lite]: voyageEmbedding(32_000, 512, 0.02, voyageTextSource, { status: 'legacy' }),
  [EmbeddingModel.VoyageCode3]: voyageEmbedding(32_000, 1_024, 0.18, voyageTextSource, { dimensions: voyageDimensions, status: 'legacy', retirementDate: '2028-02-13' }),
  [EmbeddingModel.VoyageCode2]: voyageEmbedding(16_000, 1_536, 0.12, voyageTextSource, { status: 'legacy', retirementDate: '2027-12-01' }),
  [EmbeddingModel.VoyageContext3]: voyageEmbedding(32_000, 1_024, 0.18, voyageContextSource, { dimensions: voyageDimensions, status: 'legacy', retirementDate: '2027-12-30' }),
  [EmbeddingModel.VoyageMultimodal3]: voyageEmbedding(32_000, 1_024, 0.12, voyageMultimodalSource, { status: 'legacy', retirementDate: '2027-12-01' }),
  [EmbeddingModel.VoyageFinance2]: voyageEmbedding(32_000, 1_024, 0.12, voyageTextSource, { status: 'legacy', retirementDate: '2027-12-01' }),
  [EmbeddingModel.VoyageLaw2]: voyageEmbedding(16_000, 1_024, 0.12, voyageTextSource, { status: 'legacy', retirementDate: '2027-12-01' }),
  [EmbeddingModel.VoyageMultilingual2]: voyageEmbedding(32_000, 1_024, 0.12, voyageTextSource, { status: 'legacy' }),
  [EmbeddingModel.VoyageLarge2Instruct]: voyageEmbedding(16_000, 1_024, 0.12, voyageTextSource, { status: 'legacy' }),
  [EmbeddingModel.VoyageLarge2]: voyageEmbedding(16_000, 1_536, 0.12, voyageTextSource, { status: 'legacy' }),
  [EmbeddingModel.Voyage2]: voyageEmbedding(4_000, 1_024, 0.10, voyageTextSource, { status: 'legacy' }),
  [EmbeddingModel.VoyageLite02Instruct]: voyageEmbedding(4_000, 1_024, 0.10, voyageTextSource, { status: 'deprecated' }),
  [EmbeddingModel.Voyage02]: voyageEmbedding(4_000, 1_024, 0.10, voyageTextSource, { status: 'deprecated' }),
  [EmbeddingModel.Voyage01]: voyageEmbedding(4_000, 1_024, 0.10, voyageTextSource, { status: 'deprecated' }),
  [EmbeddingModel.VoyageLite01]: voyageEmbedding(4_000, 1_024, 0.10, voyageTextSource, { status: 'deprecated' }),
  [EmbeddingModel.VoyageLite01Instruct]: voyageEmbedding(4_000, 1_024, 0.10, voyageTextSource, { status: 'deprecated' }),
  [EmbeddingModel.BgeBaseEn15]: deepInfraEmbedding('BAAI/bge-base-en-v1.5', 512, 768, 0.005),
  [EmbeddingModel.BgeEnIcl]: deepInfraEmbedding('BAAI/bge-en-icl', 8_192, 4_096, 0.010),
  [EmbeddingModel.BgeLargeEn15]: deepInfraEmbedding('BAAI/bge-large-en-v1.5', 512, 1_024, 0.010),
  [EmbeddingModel.BgeM3]: deepInfraEmbedding('BAAI/bge-m3', 8_192, 1_024, 0.010),
  [EmbeddingModel.BgeM3Multi]: deepInfraEmbedding('BAAI/bge-m3-multi', 512, 1_024, 0.010),
  [EmbeddingModel.BgeM3Multi8K]: deepInfraEmbedding('BAAI/bge-m3-multi-8k', 8_192, 1_024, 0.010),
  [EmbeddingModel.EmbeddingGemma2]: deepInfraEmbedding('google/embeddinggemma-2', 8_192, 768, 0.020, { dimensions: [128, 256, 512, 768], inputType: true }),
  [EmbeddingModel.E5BaseV2]: deepInfraEmbedding('intfloat/e5-base-v2', 512, undefined, 0.005),
  [EmbeddingModel.E5LargeV2]: deepInfraEmbedding('intfloat/e5-large-v2', 512, 1_024, 0.010),
  [EmbeddingModel.MultilingualE5Large]: deepInfraEmbedding('intfloat/multilingual-e5-large', 512, 1_024, 0.010),
  [EmbeddingModel.MultilingualE5LargeInstruct]: deepInfraEmbedding('intfloat/multilingual-e5-large-instruct', 512, 1_024, 0.010),
  [EmbeddingModel.LlamaNemotronEmbedVl1BV2]: deepInfraEmbedding('nvidia/llama-nemotron-embed-vl-1b-v2', 10_240, 2_048, 0.010),
  [EmbeddingModel.Nemotron3Embed1BBf16]: deepInfraEmbedding('nvidia/Nemotron-3-Embed-1B-BF16', 32_768, 2_048, 0.015),
  [EmbeddingModel.Nemotron3Embed1BNvfp4]: deepInfraEmbedding('nvidia/Nemotron-3-Embed-1B-NVFP4', 32_768, 2_048, 0.010),
  [EmbeddingModel.Nemotron3Embed8B]: deepInfraEmbedding('nvidia/Nemotron-3-Embed-8B', 32_768, 4_096, 0.035),
  [EmbeddingModel.Nemotron35Embed1BBf16]: deepInfraEmbedding('nvidia/Nemotron-3.5-Embed-1B-BF16', 32_768, undefined, 0.015, { inputType: true }),
  [EmbeddingModel.Nemotron35Embed8BBf16]: deepInfraEmbedding('nvidia/Nemotron-3.5-Embed-8B-BF16', 32_768, undefined, 0.035, { inputType: true }),
  [EmbeddingModel.Qwen3Embedding06B]: deepInfraEmbedding('Qwen/Qwen3-Embedding-0.6B', 32_768, 1_024, 0.010),
  [EmbeddingModel.Qwen3Embedding4B]: deepInfraEmbedding('Qwen/Qwen3-Embedding-4B', 32_768, 2_560, 0.020),
  [EmbeddingModel.Qwen3Embedding8B]: deepInfraEmbedding('Qwen/Qwen3-Embedding-8B', 32_768, 4_096, 0.010),
  [EmbeddingModel.AllMiniLML12V2]: deepInfraEmbedding('sentence-transformers/all-MiniLM-L12-v2', 512, 384, 0.005),
  [EmbeddingModel.AllMiniLML6V2]: deepInfraEmbedding('sentence-transformers/all-MiniLM-L6-v2', 512, 384, 0.005),
  [EmbeddingModel.AllMpnetBaseV2]: deepInfraEmbedding('sentence-transformers/all-mpnet-base-v2', 512, 768, 0.005),
  [EmbeddingModel.ClipViTB32]: deepInfraEmbedding('sentence-transformers/clip-ViT-B-32', 77, 512, 0.005),
  [EmbeddingModel.ClipViTB32MultilingualV1]: deepInfraEmbedding('sentence-transformers/clip-ViT-B-32-multilingual-v1', 512, 512, 0.005),
  [EmbeddingModel.MultiQaMpnetBaseDotV1]: deepInfraEmbedding('sentence-transformers/multi-qa-mpnet-base-dot-v1', 512, 768, 0.005),
  [EmbeddingModel.ParaphraseMiniLML6V2]: deepInfraEmbedding('sentence-transformers/paraphrase-MiniLM-L6-v2', 512, 384, 0.005),
  [EmbeddingModel.Text2VecBaseChinese]: deepInfraEmbedding('shibing624/text2vec-base-chinese', 512, 768, 0.005),
  [EmbeddingModel.GteBase]: deepInfraEmbedding('thenlper/gte-base', 512, 768, 0.005),
  [EmbeddingModel.GteLarge]: deepInfraEmbedding('thenlper/gte-large', 512, 1_024, 0.010),
} satisfies Record<Exclude<BuiltinEmbeddingModel, 'mock'>, ReturnType<typeof embedding>>;
export const embeddingModelCatalog = deepFreeze(Object.fromEntries(
  Object.entries(embeddingDefinitions).map(([id, { definition }]) => [id, definition]),
) as Record<Exclude<BuiltinEmbeddingModel, 'mock'>, EmbeddingModelDefinition>);

for (const [id, { pricing }] of Object.entries(embeddingDefinitions)) priceDefinitions[id as ModelId] = pricing;
export const defaultPricing: Readonly<Record<ModelId, PricingEntry>> = deepFreeze({ ...priceDefinitions, ...qwenPriceDefinitions });
