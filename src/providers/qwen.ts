import { createAlibaba } from '@ai-sdk/alibaba';
import type { ProviderAdapter } from '../types.js';
import { reasoningBudget } from '../validation.js';
import { providerModels, settings, type ProviderSettings } from './shared.js';

const preserveThinkingModels = new Set([
  'qwen4-max', 'qwen4-max-preview', 'qwen4.0-max-preview',
  'qwen3.8-max', 'qwen3.8-max-0902', 'qwen3.8-max-2026-09-02', 'qwen3.8-flash', 'qwen3.8-omni-flash',
]);

/** Alibaba Cloud Model Studio Chat Completions using DashScope credentials. */
export function qwenAdapter(input: ProviderSettings): ProviderAdapter {
  const config = settings(input);
  return {
    id: 'qwen',
    models: providerModels('qwen'),
    resolveModel: (id, context) => createAlibaba({ ...config, fetch: config.fetch ?? context.fetch })(id),
    resolveOptions: (id, reasoning, caps, operation) => {
      const reasoningDisabled = reasoning?.effort === 'none'
        || (operation.structuredOutput && caps.structuredOutputWithReasoning === false)
        || (!operation.streaming && caps.reasoning?.streamOnly);
      const alibaba = {
        ...(reasoningDisabled ? { enableThinking: false, thinkingBudget: undefined }
          : reasoning ? { enableThinking: caps.reasoning?.efforts.includes('none') ? true : undefined, thinkingBudget: reasoningBudget(reasoning) } : {}),
        ...(preserveThinkingModels.has(id) ? { preserveThinking: true } : {}),
      };
      return { alibaba };
    },
  };
}
export type { ProviderSettings } from './shared.js';
