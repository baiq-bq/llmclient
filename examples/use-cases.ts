// Compile-only examples. Credentials and paid calls are supplied by the consuming app.
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createLlmClient, ImageModel, LanguageModel, LlmError, tool } from '../src/index.js';
import { openaiAdapter } from '../src/providers/openai.js';
import { googleAdapter } from '../src/providers/google.js';
import { deepseekAdapter } from '../src/providers/deepseek.js';
export async function examples(keys: { openai: string; google: string }) {
  const client = createLlmClient({ providers: [openaiAdapter({ apiKey: keys.openai }), googleAdapter({ apiKey: keys.google })], defaults: { model: LanguageModel.GPT61Sol } });
  const messages = [{ role: 'user' as const, content: 'Resume el archivo.' }];
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
  const messages = [{ role: 'user' as const, content: 'Clasifica este libro.' }];
  const result = await client.generateObject({ model: LanguageModel.DeepSeekFlash, messages, reasoning: { effort: 'high' } }, { schema: z.object({ title: z.string() }) });
  const stream = client.stream({ model: LanguageModel.DeepSeekV4Pro, messages });
  for await (const event of stream.events) if (event.type === 'text-delta') process.stdout.write(event.text);
  return { result, final: await stream.result };
}
