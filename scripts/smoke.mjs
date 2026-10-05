import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../dist/index.js';
const cjs = createRequire(import.meta.url)('../dist/index.cjs');
for (const mod of [esm, cjs]) {
  const result = await mod.createLlmClient({ providers: [] }).generate({ model: mod.LanguageModel.Mock, messages: [{ role: 'user', content: 'test' }] });
  assert.equal(result.provider, 'mock'); assert.equal(result.cost.estimatedUsd, 0);
}
for (const name of ['openai', 'anthropic', 'google', 'xai']) {
  await import(`../dist/providers/${name}.js`);
  createRequire(import.meta.url)(`../dist/providers/${name}.cjs`);
}
console.log('ESM and CommonJS package smoke checks passed.');
