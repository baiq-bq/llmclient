// Compile-only examples. Credentials and paid calls are supplied by the consuming app.
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createLlmClient, ImageModel, LanguageModel, LlmError, tool } from '../src/index.js';
import { openaiAdapter } from '../src/providers/openai.js';
import { googleAdapter } from '../src/providers/google.js';
import { deepseekAdapter } from '../src/providers/deepseek.js';
import { kimiAdapter } from '../src/providers/kimi.js';
export async function examples(keys: { openai: string; google: string }) {
  const client = createLlmClient({ providers: [openaiAdapter({ apiKey: keys.openai }), googleAdapter({ apiKey: keys.google })], defaults: { model: LanguageModel.GPT62Sol } });
  const messages = [{ role: 'user' as const, content: 'Summarize the file.' }];
  const pdf = await client.generate({ messages, model: LanguageModel.Gemini38Flash, files: [{ bytes: await readFile('report.pdf'), mediaType: 'application/pdf', filename: 'report.pdf' }] });
  const docx = await client.generate({ messages, files: [{ bytes: await readFile('contract.docx'), mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'contract.docx' }] });
  const object = await client.generateObject({ messages }, { schema: z.object({ title: z.string() }) });
  const image = await client.generateImage({ model: ImageModel.Gemini31FlashImage, prompt: 'A sunny library', aspectRatio: '16:9', providerOptions: { google: { imageConfig: { imageSize: '1K' } } } });
  await writeFile('output.png', image.images[0]!.bytes);
  const stream = client.stream({ messages });
  for await (const event of stream.events) if (event.type === 'text-delta') process.stdout.write(event.text);
  const final = await stream.result;
  const withTools = await client.generate({ messages, tools: { getPrice: tool({ description: 'Get price', inputSchema: z.object({ productId: z.string() }), execute: async ({ productId }, { abortSignal }) => ({ productId, amount: 29.9 }) }) } });
  return { pdf, docx, object, final, withTools };
}
export async function localExample() {
  const client = createLlmClient({ providers: [], mock: { object: { title: 'mock' } } });
  return client.generateObject({ model: LanguageModel.Mock, messages: [{ role: 'user', content: 'Test' }] }, { schema: z.object({ title: z.string() }) });
}

export async function deepseekExample(apiKey: string) {
  const client = createLlmClient({ providers: [deepseekAdapter({ apiKey })] });
  const messages = [{ role: 'user' as const, content: 'Classify this book.' }];
  const result = await client.generateObject({ model: LanguageModel.DeepSeekFlash, messages, reasoning: { effort: 'high' } }, { schema: z.object({ title: z.string() }) });
  const stream = client.stream({ model: LanguageModel.DeepSeekV4Pro, messages });
  for await (const event of stream.events) if (event.type === 'text-delta') process.stdout.write(event.text);
  return { result, final: await stream.result };
}

export async function kimiExample(apiKey: string) {
  const client = createLlmClient({ providers: [kimiAdapter({ apiKey })] });
  const messages = [{ role: 'user' as const, content: 'Classify this book.' }];
  const result = await client.generateObject({ model: LanguageModel.KimiK31Pro, messages, reasoning: { effort: 'high' } }, { schema: z.object({ title: z.string() }) });
  const stream = client.stream({ model: LanguageModel.KimiK31ProHighspeed, messages, reasoning: { effort: 'low' } });
  for await (const event of stream.events) if (event.type === 'text-delta') process.stdout.write(event.text);
  return { result, final: await stream.result };
}

export async function structuredOutputExample(apiKey: string, signal?: AbortSignal) {
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
  const schema = z.object({
    title: z.string().min(1),
    sentiment: z.enum(['positive', 'neutral', 'negative']),
    tags: z.array(z.string()),
    followUp: z.string().nullable(),
  });
  const output = { schema, name: 'review_classification', description: 'Classify a user review.' };
  const result = await client.generateObject({
    messages: [{ role: 'user', content: 'Classify: Delivery was fast.' }],
    timeoutMs: 15_000,
    signal,
  }, output);
  const review: z.infer<typeof schema> = result.object;
  return { review, cost: result.cost };
}
