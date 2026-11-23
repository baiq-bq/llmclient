import type { ModelCapabilities, ModelDefinition, ModelId, PricingEntry, Rates, Reasoning } from './types.js';

const modelSource = 'https://www.alibabacloud.com/help/en/model-studio/text-generation-model';
const priceSource = 'https://www.alibabacloud.com/help/en/model-studio/model-pricing';
const qwen4Source = 'https://www.alibabacloud.com/help/en/model-studio/qwen4-max';
const previewSource = 'https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen4-max-preview';

const efforts = ['minimal', 'low', 'medium', 'high'] as const satisfies readonly Reasoning['effort'][];
const hybrid = ['none', ...efforts] as const;
const budget = (max: number, options?: Partial<NonNullable<ModelCapabilities['reasoning']>>): ModelCapabilities['reasoning'] => ({
  mode: 'budget', efforts: hybrid, budgetRange: [1, max], budgetSharesOutputLimit: false, ...options,
});
const fileLimits = {
  mediaTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxFileBytes: 4 * 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  maxFiles: 8,
} as const;
const vision = { images: true, files: fileLimits };
const noThinkingForObjects = { structuredOutputWithReasoning: false };
const modernVision = { ...vision, maxOutputTokens: 131_072, reasoning: budget(262_144) };
const qwen4 = { ...modernVision, reasoning: budget(262_143, { budgetSharesOutputLimit: true, maxCombinedOutputTokens: 262_144 }) };
const qwen4Preview = { ...modernVision, reasoning: budget(262_144, { budgetSharesOutputLimit: true, maxCombinedOutputTokens: 393_216 }) };
const legacyVision = { ...vision, ...noThinkingForObjects, maxOutputTokens: 32_768, reasoning: budget(81_920) };
const openWeightVision = { ...legacyVision, reasoning: budget(81_920, { streamOnly: true }) };

const standard = (input: number, output?: number, cachedInput?: number): Rates => ({
  input, ...(output === undefined ? {} : { output }), ...(cachedInput === undefined ? {} : { cachedInput }),
});
const tier = (minimumInputTokens: number, input: number, output?: number, cachedInput?: number) => ({
  minimumInputTokens, rates: standard(input, output, cachedInput),
});

export const qwenModelDefinitions: Record<ModelId, ModelDefinition> = {};
export const qwenPriceDefinitions: Record<ModelId, PricingEntry> = {};
function add(
  ids: readonly string[],
  capabilities: Partial<ModelCapabilities>,
  rates: Rates = {},
  options: {
    source?: string;
    pricingSource?: string;
    status?: ModelDefinition['status'];
    retirementDate?: string;
    tiers?: PricingEntry['contextTiers'];
  } = {},
) {
  const { source = modelSource, pricingSource = priceSource, status = 'stable', retirementDate, tiers } = options;
  for (const id of ids) {
    qwenModelDefinitions[`qwen:${id}`] = {
      capabilities: { images: false, streaming: true, tools: true, structuredOutput: true, maxOutputTokens: 32_768,
        temperature: { max: 2, withReasoning: true }, ...capabilities },
      source, status, ...(retirementDate ? { retirementDate } : {}),
    };
    qwenPriceDefinitions[`qwen:${id}`] = {
      rates, ...(tiers?.length === 1 ? { longContext: tiers[0] } : tiers ? { contextTiers: tiers } : {}),
      source: pricingSource, version: '2026-11-23', cachedInputFallback: false,
    };
  }
}

add(['qwen4-max'], qwen4, standard(1.5, 4.5), { source: qwen4Source, pricingSource: qwen4Source });
add(['qwen4-max-preview', 'qwen4.0-max-preview'], qwen4Preview, {}, {
  source: previewSource, pricingSource: previewSource, status: 'restricted', retirementDate: '2026-11-25',
});
add(['qwen3.8-max', 'qwen3.8-max-0902', 'qwen3.8-max-2026-09-02'], modernVision, standard(2, 6), {
  source: 'https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max',
});
add(['qwen3.8-flash'], modernVision, standard(0.15, 0.47));
add(['qwen3.8-2.4t-a95b'], { ...modernVision, reasoning: budget(262_144, { efforts }) }, standard(2, 6));
add(['qwen3.8-27b'], modernVision, standard(0.5, 3));
add(['qwen3.8-omni-flash'], { ...modernVision, maxOutputTokens: 32_768 }, {}, {
  source: 'https://www.alibabacloud.com/help/en/model-studio/qwen3-8-omni-flash',
});

const max37 = { maxOutputTokens: 131_072, reasoning: budget(81_920) };
const max37Source = 'https://www.alibabacloud.com/help/en/model-studio/qwen3-7-max';
add(['qwen3.7-max', 'qwen3.7-max-2026-05-20'], max37, standard(2.5, 7.5, 0.5), { source: max37Source });
add(['qwen3.7-max-2026-06-08'], { ...max37, ...vision }, standard(2.5, 7.5, 0.5), { source: max37Source });
add(['qwen3.7-max-preview', 'qwen3.7-max-2026-05-17'], { ...max37, reasoning: budget(81_920, { efforts }) },
  standard(2.5, 7.5), { source: max37Source, status: 'preview' });
add(['qwen3.7-plus', 'qwen3.7-plus-2026-05-26'], { ...max37, ...vision }, standard(0.4, 1.6, 0.08), {
  tiers: [tier(256_001, 1.2, 4.8, 0.24)],
});
add(['qwen3.7-flash', 'qwen3.7-flash-2026-07-15'], { ...max37, ...vision }, standard(0.03, 0.13, 0.006), {
  tiers: [tier(32_001, 0.1, 0.4, 0.02), tier(256_001, 0.2, 0.8, 0.04)],
});

add(['qwen3.6-plus', 'qwen3.6-plus-2026-04-02'], legacyVision, standard(0.5, 3), { tiers: [tier(256_001, 2, 6)] });
add(['qwen3.6-flash', 'qwen3.6-flash-2026-04-16'], legacyVision, standard(0.25, 1.5), { tiers: [tier(256_001, 1, 4)] });
add(['qwen3.6-35b-a3b'], openWeightVision, standard(0.375, 2.25));
add(['qwen3.6-27b'], openWeightVision, standard(0.6, 3.6));

const decommissioning = { status: 'deprecated', retirementDate: '2027-01-19' } as const;
add(['qwen3.5-plus', 'qwen3.5-plus-2026-04-20', 'qwen3.5-plus-2026-02-15'], legacyVision, standard(0.4, 2.4), {
  ...decommissioning, tiers: [tier(256_001, 0.5, 3)],
});
add(['qwen3.5-flash', 'qwen3.5-flash-2026-02-23'], legacyVision, standard(0.1, 0.4));
add(['qwen3.5-397b-a17b'], openWeightVision, standard(0.6, 3.6), decommissioning);
add(['qwen3.5-122b-a10b'], openWeightVision, standard(0.4, 3.2));
add(['qwen3.5-27b'], openWeightVision, standard(0.3, 2.4));
add(['qwen3.5-35b-a3b'], openWeightVision, standard(0.25, 2));
const omniSource = 'https://www.alibabacloud.com/help/en/model-studio/qwen-omni';
add(['qwen3.5-omni-plus', 'qwen3.5-omni-plus-2026-03-15'], {
  ...vision, maxOutputTokens: 8_192, reasoning: budget(32_768),
}, {}, { source: omniSource, status: 'legacy' });
add(['qwen3.5-omni-flash', 'qwen3.5-omni-flash-2026-03-15', 'qwen3-omni-flash', 'qwen3-omni-flash-2025-12-01'], {
  ...vision, maxOutputTokens: 8_192, tools: false, structuredOutput: false, reasoning: budget(32_768),
}, {}, { source: omniSource, status: 'legacy' });

add(['qwen3-vl-plus'], legacyVision, standard(0.2, 1.6), {
  tiers: [tier(32_001, 0.3, 2.4), tier(128_001, 0.6, 4.8)], status: 'legacy',
});
add(['qwen3-coder-flash', 'qwen3-coder-flash-2025-07-28'], { maxOutputTokens: 65_536 }, standard(0.3, 1.5), {
  tiers: [tier(32_001, 0.5, 2.5), tier(128_001, 0.8, 4), tier(256_001, 1.6, 9.6)], status: 'legacy',
});
add(['qwen-max'], { maxOutputTokens: 8_192 }, standard(1.6, 6.4), { status: 'legacy' });
// Output rates for these hybrid Plus IDs depend on whether reasoning was billed.
const plus = { ...noThinkingForObjects, reasoning: budget(81_920) };
add(['qwen-plus', 'qwen-plus-latest', 'qwen-plus-2025-12-01'], plus, standard(0.4), {
  tiers: [tier(256_001, 1.2)], status: 'legacy',
});
add(['qwen-plus-2025-07-14', 'qwen-plus-2025-04-28'], { ...plus, maxOutputTokens: 8_192 }, standard(0.4), { status: 'legacy' });
add(['qwen-plus-2025-01-25'], { maxOutputTokens: 8_192 }, standard(0.4, 1.2), { status: 'legacy' });
add(['qwen-flash', 'qwen-flash-2025-07-28'], { ...noThinkingForObjects, reasoning: budget(81_920) }, standard(0.05, 0.4), {
  tiers: [tier(256_001, 0.25, 2)], status: 'legacy',
});
