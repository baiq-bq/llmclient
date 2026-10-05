import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/providers/openai.ts', 'src/providers/anthropic.ts', 'src/providers/google.ts', 'src/providers/xai.ts'],
  format: ['esm', 'cjs'], target: 'node24', dts: true, clean: true, sourcemap: true,
  external: ['ai', 'zod', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google', '@ai-sdk/xai'],
});
