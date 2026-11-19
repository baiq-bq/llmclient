---
name: llmclient
description: Integrate or troubleshoot @baiq-bq/llmclient in a Node.js backend. Use when choosing an adapter or model, generating text, structured data or images, streaming, or tracking usage and cost.
---

# Use llmclient

- Use Node.js 24 or newer. Install only the SDK for each provider the application imports. See [models and adapters](references/models.md).
- Select a `LanguageModel` for text, structured output and streaming, or an `ImageModel` for image generation and editing. Check `client.listModels()` for capabilities and configuration. Provider access still depends on the account.
- Pass provider credentials explicitly from the application's secret configuration. Use `mock` for examples and tests that do not require a live provider.
- Preserve `usage`, `cost` and `entries` separately from visible output. A partial amount is a subtotal, and an unknown amount is not zero.

## Start offline

```js
import { createLlmClient, LanguageModel } from '@baiq-bq/llmclient';

const client = createLlmClient({ providers: [], mock: { text: 'Ready' } });
const result = await client.generate({
  model: LanguageModel.Mock,
  messages: [{ role: 'user', content: 'Hello' }],
});
console.log(result.text, result.cost);
```

## Validate a real provider response

Run `npm install @ai-sdk/openai zod` and supply `OPENAI_API_KEY`.

```js
import { createLlmClient, LanguageModel } from '@baiq-bq/llmclient';
import { openaiAdapter } from '@baiq-bq/llmclient/providers/openai';
import { z } from 'zod';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('Set OPENAI_API_KEY');
const client = createLlmClient({ providers: [openaiAdapter({ apiKey })] });
const result = await client.generateObject({
  model: LanguageModel.GPT62Sol,
  messages: [{ role: 'user', content: 'Classify this review: The delivery was fast.' }],
}, {
  schema: z.object({ sentiment: z.enum(['positive', 'neutral', 'negative']) }),
  name: 'review_sentiment',
  description: 'Sentiment expressed in the review',
});
console.log(result.object, result.cost);
```

## Handle failures and choose alternatives

- For structured streaming, pass the same output definition to `client.stream(request, output)`. Consume `events` and await `result`. Partial objects are provisional.
- Pass file bytes and their MIME types. On `UNSUPPORTED_CAPABILITY`, read `error.details.reasons` and `validModels`, then choose a compatible model only if the requested model is flexible.
- Use `generateImage` with an image model and write its returned bytes. Check the provider's supported size or aspect ratio and supply pricing overrides where needed.
- Configure retries on client construction. Use `maxRetries: 0` for a single attempt. Pass a request `timeoutMs` and an `AbortSignal` as needed. Before retrying in application code, consider any tool effects or output that callers have already received.
- Consult the package README for advanced usage, configuration limits and pricing. [GitHub documentation](https://github.com/baiq-bq/llmclient#readme)

Developed by BQ. [bq.land](https://bq.land) · [baiq.eu](https://baiq.eu)
