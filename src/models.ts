/** Stable package identifiers. Provider API IDs remain in the catalog. */
export const Provider = Object.freeze({ OpenAI: 'openai', Anthropic: 'anthropic', Google: 'google', XAI: 'xai', DeepSeek: 'deepseek', Kimi: 'kimi', Mock: 'mock' } as const);
export type BuiltinProvider = typeof Provider[keyof typeof Provider];
export const LanguageModel = Object.freeze({
  GPT62Astra: 'openai:gpt-6.2-astra', GPT62Sol: 'openai:gpt-6.2-sol', Gemini4Neon: 'google:gemini-4-neon',
  ClaudeFable52: 'anthropic:claude-fable-5-2', ClaudeMythos52: 'anthropic:claude-mythos-5-2', Gemini4Carbon: 'google:gemini-4-carbon', Gemini4Hydrogen: 'google:gemini-4-hydrogen',
  KimiK31Pro: 'kimi:kimi-k3.1-pro', KimiK31ProHighspeed: 'kimi:kimi-k3.1-pro-highspeed', KimiK3: 'kimi:kimi-k3',
  GPT61Terra: 'openai:gpt-6.1-terra', ClaudeHaiku55: 'anthropic:claude-haiku-5-5', Gemini4Argon: 'google:gemini-4-argon',
  DeepSeekFlash: 'deepseek:deepseek-flash', DeepSeekV4Pro: 'deepseek:deepseek-v4-pro',
  Mock: 'mock', GPT61Sol: 'openai:gpt-6.1-sol', GPT6Luna: 'openai:gpt-6-luna', GPT6Astra: 'openai:gpt-6-astra', ClaudeSonnet5: 'anthropic:claude-sonnet-5', ClaudeOpus5: 'anthropic:claude-opus-5',
  ClaudeFable51: 'anthropic:claude-fable-5-1', ClaudeMythos51: 'anthropic:claude-mythos-5-1', ClaudeOpus55: 'anthropic:claude-opus-5-5', ClaudeSonnet55: 'anthropic:claude-sonnet-5-5', ClaudeHaiku45: 'anthropic:claude-haiku-4-5-20251001', Gemini38Flash: 'google:gemini-3.8-flash', Gemini37Flash: 'google:gemini-3.7-flash', Gemini36Flash: 'google:gemini-3.6-flash', Gemini35Flash: 'google:gemini-3.5-flash', Gemini35FlashLite: 'google:gemini-3.5-flash-lite', Gemini31FlashLite: 'google:gemini-3.1-flash-lite', Gemini31ProPreview: 'google:gemini-3.1-pro-preview', Gemini3FlashPreview: 'google:gemini-3-flash-preview', Grok47: 'xai:grok-4.7', GrokBuild01: 'xai:grok-build-0.1', Grok46: 'xai:grok-4.6', Grok45: 'xai:grok-4.5', Grok43: 'xai:grok-4.3', Grok420Reasoning: 'xai:grok-4.20-0309-reasoning', Grok420NonReasoning: 'xai:grok-4.20-0309-non-reasoning',
} as const);
export type BuiltinLanguageModel = typeof LanguageModel[keyof typeof LanguageModel];
export const ImageModel = Object.freeze({
  GPTImage26Sunburst: 'openai:gpt-image-2.6-sunburst', GPTImage26Flare: 'openai:gpt-image-2.6-flare',
  GeminiNanoBanana21: 'google:gemini-nano-banana-2.1',
  Mock: 'mock', GPTImage25Sunburst: 'openai:gpt-image-2.5-sunburst', GPTImage25Flare: 'openai:gpt-image-2.5-flare', GPTImage2: 'openai:gpt-image-2', Gemini31FlashImage: 'google:gemini-3.1-flash-image', Gemini31FlashImagePreview: 'google:gemini-3.1-flash-image-preview', Gemini31FlashLiteImage: 'google:gemini-3.1-flash-lite-image', Gemini3ProImage: 'google:gemini-3-pro-image', GrokImagineImage2: 'xai:grok-imagine-image-2.0', GrokImagineImage: 'xai:grok-imagine-image', GrokImagineImageQuality: 'xai:grok-imagine-image-quality',
} as const);
export type BuiltinImageModel = typeof ImageModel[keyof typeof ImageModel];
export const builtinLanguageModels: readonly BuiltinLanguageModel[] = Object.freeze(Object.values(LanguageModel));
export const builtinImageModels: readonly BuiltinImageModel[] = Object.freeze(Object.values(ImageModel));
export const builtinProviders: readonly BuiltinProvider[] = Object.freeze(Object.values(Provider));
