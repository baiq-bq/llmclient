# @baiq-bq/llmclient

<a href="https://baiq.eu"><img src="https://baiq.eu/assets/baiq-logotipo-positivo-rgb.svg" alt="baiq" width="120"></a>

A TypeScript client for Node.js 24+ built on the AI SDK. It supports text, validated objects, streaming, tools, image generation and editing, and per-attempt usage and cost. It works with OpenAI, Anthropic, Google Gemini, xAI, DeepSeek and Kimi, and includes an offline mock provider.

Developed by BQ. [bq.land](https://bq.land) · [baiq.eu](https://baiq.eu)

## Install and run

| Package manager | Install the client | Add a provider SDK, for example OpenAI |
| --- | --- | --- |
| npm | `npm install @baiq-bq/llmclient` | `npm install @ai-sdk/openai` |
| pnpm | `pnpm add @baiq-bq/llmclient` | `pnpm add @ai-sdk/openai` |
| Yarn | `yarn add @baiq-bq/llmclient` | `yarn add @ai-sdk/openai zod` |
| Bun | `bun add @baiq-bq/llmclient` | `bun add @ai-sdk/openai` |

Use Node.js 24+ to run the examples, whichever package manager you use. Save this as `example.mjs` and run `node example.mjs` or `yarn node example.mjs` with Yarn Plug'n'Play. Mock mode works without a network connection or credentials.

```js
import { createLlmClient, LanguageModel } from '@baiq-bq/llmclient';

const client = createLlmClient({ providers: [], mock: { text: 'Hello from llmclient' } });
const result = await client.generate({
  model: LanguageModel.Mock,
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(result.text, result.cost);
```

For a live call, install the SDK for your provider and configure its credentials. SDKs are optional peer dependencies. With Yarn Plug'n'Play, declare the SDK's required peers in your application, such as `zod` for OpenAI. For the example below, set `OPENAI_API_KEY` in the application environment.

```js
import { createLlmClient, LanguageModel } from '@baiq-bq/llmclient';
import { openaiAdapter } from '@baiq-bq/llmclient/providers/openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Set OPENAI_API_KEY');
const client = createLlmClient({
  providers: [openaiAdapter({ apiKey })],
  defaults: { model: LanguageModel.GPT62Sol },
});
const result = await client.generate({
  messages: [{ role: 'user', content: 'Explain what an API is in one sentence.' }],
  reasoning: { effort: 'low' },
});
console.log(result.text, result.usage, result.cost);
```

If you are migrating from an earlier distribution, update your imports to `@baiq-bq/llmclient`.

The package includes ESM and CommonJS exports and TypeScript declarations. Each adapter is imported from its own subpath. Pass credentials explicitly from your application. The client does not read environment variables and does not log credentials, prompts or provider response bodies.

## Agent skill

The npm distribution includes a consumer skill at `node_modules/@baiq-bq/llmclient/skills/llmclient/SKILL.md`. An agent can read that file directly. For automatic discovery in a client that scans project skills, copy the entire skill directory, including references, to the location used by your agent. For Codex:

```bash
mkdir -p .agents/skills
cp -R node_modules/@baiq-bq/llmclient/skills/llmclient .agents/skills/
```

With Yarn Plug'n'Play, run `yarn unplug @baiq-bq/llmclient` and copy the skill from the package directory under `.yarn/unplugged`. Refresh a copied skill when you upgrade the package. The repository's maintainer rules are separate from this consumer skill. [View the skill on GitHub](https://github.com/baiq-bq/llmclient/tree/main/skills/llmclient)

## Providers and model selection

| Provider | Adapter import suffix | SDK to install | Representative text models |
| --- | --- | --- | --- |
| OpenAI | `providers/openai` | `@ai-sdk/openai` | GPT-6.2 Sol, GPT-6.2 Astra, GPT-6.1 Terra, GPT-6 Luna |
| Anthropic | `providers/anthropic` | `@ai-sdk/anthropic` | Claude Sonnet 5.5, Opus 5.5, Haiku 5.5, Fable 5.2 |
| Google | `providers/google` | `@ai-sdk/google` | Gemini 4 Hydrogen, Neon, Carbon and Argon |
| xAI | `providers/xai` | `@ai-sdk/xai` | Grok 4.7, 4.6 and Build 0.1 |
| DeepSeek | `providers/deepseek` | `@ai-sdk/deepseek` | DeepSeek Flash and V4 Pro |
| Kimi (Moonshot AI) | `providers/kimi` | `@ai-sdk/moonshotai` | Kimi K3.1 Pro, Highspeed and K3 |

Use the installed package's `LanguageModel` and `ImageModel` constants for exact IDs and TypeScript autocomplete. Use `client.listModels()` to inspect supported operations, reasoning levels, file constraints and which providers are configured. Catalog inclusion does not establish provider account access or regional availability. For example, Claude Mythos requires approval, and preview or older aliases can change upstream.

Gemini 4 supports up to 65,536 output tokens through the synchronous adapter. Neon and Hydrogen's `xhigh` is unavailable through the installed Google SDK. DeepSeek Flash supports vision and V4 Pro is text-only in this adapter. Kimi K3 models always reason and expose `low`, `high` and `max`. GPT-6.1 Terra's `none` is unavailable through the installed SDK. The package targets text and images. Live audio, video, embeddings and specialized endpoints require other integrations.

### Provider-specific notes

- **DeepSeek** uses native Chat Completions and preserves `reasoning_content` across conversation and tool steps. The supported efforts are `none`, `low`, `high` and `max`. The provider defaults to `high` when omitted. The output limit is 393,216 tokens including reasoning. Flash accepts common image formats including GIF, and the text adapter does not expose PDF or temperature. [DeepSeek model details](https://api-docs.deepseek.com/quick_start/pricing/)
- **Kimi** uses native Chat Completions, preserves reasoning across turns and sends strict JSON Schema for objects. The adapter caps output at 32,768 tokens and accepts PNG, JPEG, WebP and GIF references up to the catalog limits. PDF, DOCX and image generation are outside this adapter's scope. With `providerOptions.moonshotai.promptCacheOptions: { mode: 'implicit', ttl: '1h' }`, supply the appropriate hourly cache-write rate in `pricing`. Check the provider's retention behavior when refreshing existing cache entries. [Kimi cache documentation](https://platform.kimi.ai/docs/guide/context-caching)

## Structured output

Install Zod with `npm install zod`. Define the output as an object containing a Zod schema and pass it as the second argument to `generateObject` or `stream`.

```ts
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(1),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  tags: z.array(z.string()),
  followUp: z.string().nullable(),
});

type Review = z.infer<typeof schema>;

const output = {
  schema,
  name: 'review_classification',
  description: 'Classify the review and suggest a follow-up if needed.',
};
const request = {
  model: LanguageModel.GPT62Sol,
  messages: [{ role: 'user' as const, content: 'Classify: Delivery was fast and the box was intact.' }],
};
const result = await client.generateObject(request, output);
const review: Review = result.object;
```

| Output option | What it does |
| --- | --- |
| `schema` | Required Zod schema. It defines the response shape and the final validation rules and infers the TypeScript result type. |
| `name` | Optional name for the output schema. Use a short identifier such as `review_classification`. |
| `description` | Optional explanation of what the result should represent. Put shape constraints in the schema and task instructions in the request. |

Common choices are `z.object` for records, nested objects for grouped fields, `z.enum` for fixed vocabularies, and `z.array` for lists. Wrap a list in an object, such as `{ items: z.array(itemSchema) }`, for portability. Prefer required nullable fields when a provider's strict mode cannot express omitted fields. Keep schemas representable as JSON Schema and check provider support for optional fields, references, unions, maps and advanced constraints. You can apply transformations that a provider cannot represent separately in application code. This API accepts Zod output schemas. The exported `jsonSchema` helper is available for AI SDK tooling, including tool inputs.

With OpenAI, the package automatically uses strict mode for supported schema shapes and disables it for incompatible shapes or fine-tuned models. The explicit request option `providerOptions.openai.strictJsonSchema` overrides that choice. Anthropic, Google and Kimi use their SDK schema paths. DeepSeek uses JSON object mode and passes schema guidance through the SDK. The completed object must pass the caller's Zod schema in every case.

A failed object can return `STRUCTURED_OUTPUT_ERROR`, `TRUNCATED_OUTPUT` or `CONTENT_FILTERED`. Read `error.structuredOutput` when present and `error.accounting?.entries` for diagnostics and known usage from failed attempts. Diagnostics report a failure kind, safe codes and paths, and whether previous output was available as repair context. They exclude received values and raw provider bodies. [OpenAI structured output constraints](https://developers.openai.com/api/docs/guides/structured-outputs)

## Streaming and conversation

```ts
const stream = client.stream(request, output);
try {
  for await (const event of stream.events) {
    if (event.type === 'text-delta') process.stdout.write(event.text);
  }
  const final = await stream.result;
  console.log(final.object, final.cost);
} catch (error) {
  // The iterator and result can both report a failure.
  await stream.result.catch(() => {});
  throw error;
}
```

Omit `output` to stream text. Treat deltas and partial data as provisional. Consume the iterator while the request runs and await the final result. Call `stream.cancel()`, abort the request signal or exit iteration early to cancel. Continue a conversation by appending the result's complete `messages` to the original messages before adding the next user turn. This preserves tool results and provider-specific conversation metadata.

## Retries, timeouts and cancellation

Set the policy on `createLlmClient({ providers, retries })`. Omitted options inherit the defaults exported as `defaultRetryPolicy`.

| Retry option | Default | Accepted values and behavior |
| --- | ---: | --- |
| `maxRetries` | 2 | Integer from 0 to 5. Counts additional attempts, so 2 allows up to 3 attempts. Use 0 for a single attempt. |
| `baseDelayMs` | 500 | Non-negative integer. Initial exponential backoff delay. |
| `maxDelayMs` | 10,000 | Non-negative integer. Caps calculated backoff. A longer provider `Retry-After` can exceed this cap. |
| `repairFromAttempt` | 2 | Integer of at least 2, using one-based attempt numbering. Controls when a failed structured response gets repair instructions. Set it above the total number of attempts to disable repair while preserving retries. |
| `maxRepairCharacters` | 32,000 | Positive integer. Limits the size of the complete previous response added to repair context. Oversized or truncated output is omitted in full. Safe diagnostics can still be sent. |

```ts
const client = createLlmClient({
  providers: [openaiAdapter({ apiKey })],
  defaults: { model: LanguageModel.GPT62Sol, timeoutMs: 30_000 },
  retries: {
    maxRetries: 2,
    baseDelayMs: 250,
    maxDelayMs: 3_000,
    repairFromAttempt: 2,
    maxRepairCharacters: 8_000,
  },
});

const controller = new AbortController();
const result = await client.generate({
  messages: [{ role: 'user', content: 'Summarize this report.' }],
  timeoutMs: 15_000,
  signal: controller.signal,
});
```

The SDK's retries are disabled. The client retries failures marked retryable by the provider SDK and eligible structured output failures. It uses the greater of the exponential backoff and a valid `Retry-After` value (seconds or an HTTP date). Repair uses the same model and the original task along with safe diagnostics. Invalid requests and content filtering do not trigger a retry. The client stops retrying once a tool has run, a stream event has been emitted or an image has been generated. Errors retain known usage from earlier attempts and images.

A single `timeoutMs` covers calls, waits, tools and repairs. Text and structured requests use 60,000 ms by default, overridable on the client or request. Image generation uses its own request `timeoutMs` and the same 60,000 ms default. An abort stops pending waits as well. Pass the tool's `abortSignal` to dependencies that support it, and use idempotency for external effects. Stable `LlmError` codes include `TIMEOUT`, `ABORTED`, `PROVIDER_ERROR` and `TOOL_ERROR`. When available, `upstreamStatus`, `retryAfterMs` and `accounting` help diagnose a failure. Read `accounting` explicitly, as it is not enumerable.

Other text defaults include `model`, `system`, `maxOutputTokens` (4,096), `maxSteps` (5), `temperature` and `reasoning`. Request values override client defaults. Model capabilities determine whether a temperature or reasoning control is accepted. Use `providerOptions` only for documented adapter-specific options.

## Files, images and tools

Send bytes with a MIME type. The client validates the request before calling a provider. For example, Gemini can summarize a PDF and OpenAI Responses can receive a DOCX directly.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import { ImageModel, tool } from '@baiq-bq/llmclient';

const pdf = await client.generate({
  model: LanguageModel.Gemini4Hydrogen,
  messages: [{ role: 'user', content: 'Summarize the PDF.' }],
  files: [{ bytes: await readFile('report.pdf'), mediaType: 'application/pdf' }],
});

const image = await client.generateImage({
  model: ImageModel.GPTImage26Flare,
  prompt: 'An illustrated library',
  size: '1024x1024',
});
await writeFile('library.png', image.images[0]!.bytes);

const answer = await client.generate({
  model: LanguageModel.GPT62Sol,
  messages: [{ role: 'user', content: 'What does product P-42 cost?' }],
  tools: {
    getPrice: tool({
      description: 'Look up the current price by product ID.',
      inputSchema: z.object({ productId: z.string() }),
      execute: async ({ productId }) => ({ productId, amount: 29.9, currency: 'EUR' }),
    }),
  },
});
console.log(answer.toolResults);
```

Configure the providers used by these examples. PDF is supported by qualifying OpenAI, Anthropic and Gemini text models. Other document types, such as DOCX and XLSX, require a matching OpenAI Responses capability. The package does not convert files, fetch URLs or resolve remote IDs. If validation returns `UNSUPPORTED_CAPABILITY`, inspect `details.reasons` and `details.validModels`. The alternatives satisfy the entire request and flag whether their provider is configured.

For image editing, pass references as `files` with an image MIME type. Image models are a separate catalog. Use supported pixel dimensions with OpenAI or an `aspectRatio` with Google and xAI. The client sends each requested image in a separate call within a shared deadline. `maxSteps` limits model steps for tools, including the final answer. Multiple tools can run in one step.

## Usage and pricing

Results expose `usage`, `usageComplete`, `cost` and `entries`. Cache reads and reported writes are charged separately from uncached input. Reasoning included in output is not charged twice. The estimate can be `known`, `partial` or `unknown`. `estimatedUsd: null` means there is no known subtotal.

Override prices per client. Rates merge by model and individual field, and zero is valid. `longContext: null` removes a built-in long-context tier. Token prices use USD per million tokens, and flat image rates use USD per image.

```ts
const pricedClient = createLlmClient({
  providers: [openaiAdapter({ apiKey })],
  pricing: {
    [LanguageModel.GPT62Sol]: {
      rates: { input: 1.8, cachedInput: 0 },
      longContext: { rates: { input: 3.6, cachedInput: 0 } },
      source: 'Our provider agreement',
    },
    [ImageModel.GPTImage26Flare]: { rates: { image: 0.08, inputImage: 0.002 } },
  },
});
```

A flat rate covers the corresponding image charge without adding token rates. Match the override to the provider, quality, resolution and region. Review `entries[].cost.appliedPricing` for rate provenance and `entries[].cost.missing` for missing cost components.

## Text model pricing

Standard on-demand rates in USD per million tokens. Snapshot reviewed on **2026-11-19**. A dash means that the package does not apply a rate for that field. Regional premiums, hosted tools, storage and nonstandard service tiers are excluded.

| Provider and models | Input | Output | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: |
| OpenAI GPT-6.2 Astra | 8 | 40 | 0.4 | 10 |
| OpenAI GPT-6.2 Sol | 2 | 10 | 0.1 | 2.5 |
| OpenAI GPT-6 Astra | 10 | 50 | 1 | 12.5 |
| OpenAI GPT-6.1 Sol | 2 | 10 | 0.1 | 2.5 |
| OpenAI GPT-6.1 Terra | 1 | 5 | 0.05 | 1.25 |
| OpenAI GPT-6 Luna | 0.1 | 0.5 | 0.01 | 0.125 |
| Anthropic Claude Fable 5.2, Mythos 5.2 | 8 | 40 | 0.2 | 10 |
| Anthropic Claude Fable 5.1, Mythos 5.1 | 10 | 50 | 0.25 | 12.5 |
| Anthropic Claude Opus 5.5 | 4 | 20 | 0.2 | 5 |
| Anthropic Claude Opus 5 | 5 | 25 | 0.5 | 6.25 |
| Anthropic Claude Sonnet 5.5 | 2 | 10 | 0.1 | 2.5 |
| Anthropic Claude Sonnet 5 | 2 | 10 | 0.2 | 2.5 |
| Anthropic Claude Haiku 5.5 | 0.1 | 0.5 | 0.01 | 0.125 |
| Anthropic Claude Haiku 4.5 | 1 | 5 | 0.1 | 1.25 |
| Google Gemini 4 Carbon, 4 Argon | 2 | 10 | 0.1 | — |
| Google Gemini 4 Neon | 3 | 15 | 0.15 | — |
| Google Gemini 4 Hydrogen | 1.5 | 7.5 | 0.075 | — |
| Google Gemini 3.8, 3.7, 3.6 Flash | 0.75 | 3.75 | 0.075 | — |
| Google Gemini 3.5 Flash | 1.5 | 9 | 0.15 | — |
| Google Gemini 3.5 Flash Lite | 0.3 | 2.5 | 0.03 | — |
| Google Gemini 3.1 Flash Lite | 0.25 | 1.5 | 0.025 | — |
| Google Gemini 3.1 Pro Preview | 2 | 12 | 0.2 | — |
| Google Gemini 3 Flash Preview | 0.5 | 3 | 0.05 | — |
| xAI Grok 4.7, 4.6 | 2 | 6 | 0.5 | — |
| xAI Grok 4.5 | 2 | 6 | 0.3 | — |
| xAI Grok 4.3, 4.20 Reasoning and Non-Reasoning | 1.25 | 2.5 | 0.2 | — |
| xAI Grok Build 0.1 | 1 | 2 | 0.2 | — |
| Kimi K3.1 Pro | 2 | 10 | 0.2 | 2 |
| Kimi K3.1 Pro Highspeed | 4 | 20 | 0.2 | 4 |
| Kimi K3 | 3 | 15 | 0.3 | 3 |
| DeepSeek Flash and V4 Pro | Variable | Variable | Variable | — |
| Mock | 0 | 0 | 0 | 0 |

Long-context tiers apply per request for applicable OpenAI, Anthropic Haiku 5.5, Gemini 3.1 Pro Preview and xAI models. Inspect `defaultPricing` for exact thresholds and rates. Anthropic and Kimi cache writes use the five-minute rate in the table. OpenAI uses the 30-minute rate. Override the write rate if you use a different retention period. Gemini 4 Argon and Carbon have introductory rates through November 30, 2026, then change to $4 input, $20 output and $0.20 cached input. For Gemini 3.8, 3.7 and 3.6 Flash, check rates again for usage after December 31, 2026.

DeepSeek requires an explicit price override. Flash costs $0.15 / $0.60 / $0.003 per million input / output / cache-read tokens off-peak and $0.30 / $1.20 / $0.006 at peak. V4 Pro costs $0.66 / $1.98 / $0.022 off-peak and $1.32 / $3.96 / $0.044 at peak. Peak hours are 01:00–04:00 and 06:00–10:00 UTC on weekdays, excluding Chinese public holidays.

Official pricing: [OpenAI](https://developers.openai.com/api/docs/pricing), [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing), [Google](https://aistudio.google.com/docs/pricing), [xAI](https://docs.x.ai/developers/pricing), [DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/) and [Kimi](https://platform.kimi.ai/docs/pricing/chat).

## Image pricing

| Models | Built-in pricing |
| --- | --- |
| Grok Imagine Image | $0.02 per generated image and $0.002 per input image |
| Grok Imagine Image 2.0 and Quality alias | $0.04 per generated image and $0.01 per input image for the default 1K/low configuration |
| OpenAI GPT Image and Google Nano Banana / Gemini image models | No flat rate is inferred from token, quality or resolution tiers. Use an explicit override where applicable. |
| Mock | $0 |

For xAI Image 2.0, changing quality or resolution can make the generated image cost unknown while retaining the known input image subtotal. The retired `grok-imagine-image-quality` alias is retained for compatibility. [xAI migration notice](https://docs.x.ai/developers/migration/imagine-image-quality-nov-2)

## Extend or test the client

```ts
import { createLlmClient, defineProvider } from '@baiq-bq/llmclient';
import type { LanguageModel as SdkLanguageModel } from 'ai';

declare const model: SdkLanguageModel;
const customProvider = defineProvider({
  id: 'acme',
  models: {
    chat: {
      capabilities: {
        images: false, structuredOutput: true, streaming: true, tools: true,
        maxOutputTokens: 8192,
      },
    },
  },
  resolveModel: () => model,
});
const extended = createLlmClient({
  providers: [customProvider],
  pricing: { 'acme:chat': { rates: { input: 1, output: 2 } } },
});
const result = await extended.generate({
  model: 'acme:chat',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

`defineProvider` registers an external AI SDK V4 model or an adapter with its own image models, reasoning options and accounting. Literal model IDs receive TypeScript autocomplete. Verify capability declarations before accepting files or enabling tools. `options.models` and `options.imageModels` can add models to a configured adapter.

Use `mock.text`, `mock.object`, or `mock.generateObject(schema)` for offline tests. Mock output is validated against the same Zod schema and incurs zero cost. Mock image generation returns a fixed 1×1 PNG. The mock does not execute tools, so test real provider contracts with a simulated transport. [Compile-only examples](https://github.com/baiq-bq/llmclient/blob/main/examples/use-cases.ts)

## Development and license

Run `npm ci` and `npm run check` for type checking, simulated transport tests, builds and ESM/CommonJS verification. See the [release guide](https://github.com/baiq-bq/llmclient/blob/main/docs/releases.md) and [maintainer agent instructions](https://github.com/baiq-bq/llmclient/blob/main/AGENTS.md).

[MIT License](https://github.com/baiq-bq/llmclient/blob/main/LICENSE).
