import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../dist/index.js';
const cjs = createRequire(import.meta.url)('../dist/index.cjs');
for (const mod of [esm, cjs]) {
  const client = mod.createLlmClient({ providers: [] });
  const result = await client.generate({ model: mod.LanguageModel.Mock, messages: [{ role: 'user', content: 'test' }] });
  assert.equal(result.provider, 'mock'); assert.equal(result.cost.estimatedUsd, 0);
  const embedding = await client.embed({ model: mod.EmbeddingModel.Mock, value: 'test' });
  assert.equal(embedding.embedding.length, 8);
  assert.equal(embedding.cost.estimatedUsd, 0);
  const many = await client.embedMany({ model: mod.EmbeddingModel.Mock, values: ['test'] });
  assert.deepEqual(many.embeddings, [embedding.embedding]);
}
for (const name of ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'kimi', 'voyage', 'deepinfra', 'qwen']) {
  await import(`../dist/providers/${name}.js`);
  createRequire(import.meta.url)(`../dist/providers/${name}.cjs`);
}
console.log('ESM and CommonJS package smoke checks passed.');
