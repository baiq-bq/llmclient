import { describe, expect, it } from 'vitest';
import { calculateCost, defaultPricing, resolvePricing, LanguageModel } from '../src/index.js';
import type { Usage } from '../src/index.js';
const usage: Usage = { inputTokens: 1_000_000, uncachedInputTokens: 700_000, cachedInputTokens: 200_000, cacheWriteTokens: 100_000, outputTokens: 100_000, reasoningTokens: 50_000 };
const id = LanguageModel.ClaudeSonnet5;
describe('pricing', () => {
  it.each([
    [LanguageModel.GPT62Astra, 272_000, 8, 40, 0.4, 10],
    [LanguageModel.GPT62Astra, 272_001, 16, 60, 0.8, 20],
    [LanguageModel.GPT62Sol, 272_000, 2, 10, 0.1, 2.5],
    [LanguageModel.GPT62Sol, 272_001, 4, 15, 0.2, 5],
    [LanguageModel.Gemini4Neon, 500_000, 3, 15, 0.15, undefined],
    [LanguageModel.GPT61Terra, 272_000, 1, 5, 0.05, 1.25],
    [LanguageModel.GPT61Terra, 272_001, 2, 7.5, 0.1, 2.5],
    [LanguageModel.ClaudeHaiku55, 100_000, 0.1, 0.5, 0.01, 0.125],
    [LanguageModel.ClaudeHaiku55, 100_001, 0.5, 2.5, 0.05, 0.625],
    [LanguageModel.Gemini4Argon, 500_000, 2, 10, 0.1, undefined],
  ] as const)('uses documented rates for %s at %i input tokens', (model, inputTokens, input, output, cachedInput, cacheWrite) => {
    const cost = calculateCost(resolvePricing(defaultPricing).get(model), { ...usage, inputTokens });
    expect(cost.appliedPricing.rates).toEqual({ input, output, cachedInput, ...(cacheWrite !== undefined ? { cacheWrite } : {}) });
  });
  it('separates normal input, read/write cache and output without charging reasoning twice', () => {
    const result = calculateCost(resolvePricing(defaultPricing).get(id), usage);
    expect(result.estimatedUsd).toBeCloseTo(2.69); expect(result.status).toBe('known');
  });
  it('merges per field, preserves zero, and records provenance', () => {
    const resolved = resolvePricing(defaultPricing, { [id]: { rates: { output: 0 }, version: 'contract-1' } }).get(id);
    expect(calculateCost(resolved, usage)).toMatchObject({ estimatedUsd: 1.69, appliedPricing: { rates: { input: 2, output: 0 }, origins: { input: 'internal', output: 'custom' }, version: 'contract-1' } });
    expect(defaultPricing[id]!.rates.output).toBe(10);
  });
  it('copies custom fields and isolates resolutions', () => {
    const custom = { [id]: { rates: { input: 0 } } };
    const first = resolvePricing(defaultPricing, custom); custom[id].rates.input = 99;
    expect(first.get(id)!.entry.rates.input).toBe(0); expect(resolvePricing(defaultPricing).get(id)!.entry.rates.input).toBe(2);
  });
  it.each([-1, NaN, Infinity])('rejects invalid rate %s', rate => {
    expect(() => resolvePricing(defaultPricing, { [id]: { rates: { input: rate } } })).toThrow();
  });
  it('uses context thresholds per call and merges tier fields independently', () => {
    const resolved = resolvePricing(defaultPricing, { 'xai:grok-4.6': { longContext: { rates: { output: 0 } } } }).get('xai:grok-4.6');
    const short = calculateCost(resolved, { ...usage, inputTokens: 199_999 });
    const long = calculateCost(resolved, { ...usage, inputTokens: 200_000 });
    expect(short.appliedPricing.rates.output).toBe(6); expect(long.appliedPricing.rates).toMatchObject({ input: 4, output: 0 });
  });
  it('can explicitly remove the long-context tier', () => {
    const resolved = resolvePricing(defaultPricing, { 'xai:grok-4.6': { longContext: null } }).get('xai:grok-4.6');
    expect(calculateCost(resolved, usage).appliedPricing.context).toBe('standard');
  });
  it('keeps an unknown price unknown and incomplete usage partial', () => {
    expect(calculateCost(undefined, {})).toMatchObject({ status: 'unknown', estimatedUsd: null });
    const result = calculateCost(resolvePricing(defaultPricing).get(id), { outputTokens: 100 });
    expect(result).toMatchObject({ status: 'partial', estimatedUsd: 0.001 });
    expect(result.missing).toContain('input');
  });
  it('does not select a context tier when input usage is missing', () => {
    expect(calculateCost(resolvePricing(defaultPricing).get('xai:grok-4.6'), { outputTokens: 100 })).toMatchObject({ status: 'unknown', estimatedUsd: null });
  });
  it('calculates image rates in dollars per image', () => {
    expect(calculateCost(resolvePricing(defaultPricing).get('xai:grok-imagine-image-2.0'), { images: 2, inputImages: 3 })).toMatchObject({ status: 'known', estimatedUsd: 0.11 });
  });
});
