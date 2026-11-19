# Models and adapters

List every supported identifier and the pricing snapshot from the installed package:

```bash
node --input-type=module -e 'import { LanguageModel, ImageModel, pricingVersion } from "@baiq-bq/llmclient"; console.log({ pricingVersion, text: LanguageModel, image: ImageModel })'
```

Use the installed `modelCatalog`, `imageModelCatalog` and `defaultPricing` for exact capabilities and rates. Import each adapter from a subpath of `@baiq-bq/llmclient`.

| Provider | Adapter subpath | Installable SDK | Models to start with |
| --- | --- | --- | --- |
| OpenAI | `providers/openai` | `@ai-sdk/openai` | `GPT62Sol` for general work, `GPT6Luna` for focused tasks, `GPT62Astra` for demanding tasks, `GPTImage26Flare` or `GPTImage26Sunburst` for images |
| Anthropic | `providers/anthropic` | `@ai-sdk/anthropic` | `ClaudeSonnet55` for general work, `ClaudeHaiku55` for short requests, `ClaudeOpus55` or `ClaudeFable52` for harder tasks |
| Google | `providers/google` | `@ai-sdk/google` | `Gemini4Hydrogen` for general work, `Gemini4Neon` or `Gemini4Carbon` for harder tasks, `Gemini31FlashLite` for inexpensive short requests, `GeminiNanoBanana21` for images |
| xAI | `providers/xai` | `@ai-sdk/xai` | `Grok47` for text and `GrokImagineImage2` for images |
| DeepSeek | `providers/deepseek` | `@ai-sdk/deepseek` | `DeepSeekFlash` for text and vision, `DeepSeekV4Pro` for text |
| Kimi | `providers/kimi` | `@ai-sdk/moonshotai` | `KimiK31Pro` for text and vision, `KimiK31ProHighspeed` for latency-sensitive work |

Use a lower-cost compatible model first, then evaluate quality on representative inputs. Mythos requires provider approval. Gemini 4 synchronous output is capped at 65,536 tokens. DeepSeek estimates require explicit peak or off-peak rates. Check the provider's rate for long context, cache retention, service tiers and image settings before quoting or budgeting a cost. [Official pricing sources and bundled rates](https://github.com/baiq-bq/llmclient#text-model-pricing)
