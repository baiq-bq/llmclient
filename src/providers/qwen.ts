import { createAlibaba } from '@ai-sdk/alibaba';
import type { ProviderAdapter } from '../types.js';
import { providerModels, reasoningBudget, settings, type ProviderSettings } from './shared.js';

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
      const preserveThinking = /^(qwen4(?:\.0)?-max|qwen3\.8-omni-flash)$/.test(id)
        || id === 'qwen4-max-preview' || id === 'qwen4.0-max-preview' || id === 'qwen3.8-max-2026-09-02';
      const alibaba = {
        ...(reasoningDisabled ? { enableThinking: false, thinkingBudget: undefined }
          : reasoning ? { enableThinking: caps.reasoning?.efforts.includes('none') ? true : undefined, thinkingBudget: reasoningBudget(reasoning) } : {}),
        ...(preserveThinking ? { preserveThinking: true } : {}),
      };
      return { alibaba };
    },
  };
}
export type { ProviderSettings } from './shared.js';
