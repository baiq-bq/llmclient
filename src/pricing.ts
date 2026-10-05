import type { AppliedPricing, Cost, ModelId, PricingEntry, PricingTable, Rates, RateKey, Usage } from './types.js';
import { invalidConfiguration } from './errors.js';

const keys: RateKey[] = ['input', 'output', 'cachedInput', 'cacheWrite', 'image', 'inputImage'];
export interface ResolvedPricing { entry: PricingEntry; standardOrigins: AppliedPricing['origins']; longOrigins: AppliedPricing['origins']; internalSource?: string; internalVersion?: string }
function validateRates(rates: Rates) {
  if (!rates || typeof rates !== 'object' || Object.keys(rates).some(k => !keys.includes(k as RateKey))) invalidConfiguration();
  for (const value of Object.values(rates)) if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) invalidConfiguration();
}
function mergeRates(base: Rates = {}, override: Rates = {}) {
  return Object.fromEntries(keys.flatMap(k => override[k] !== undefined ? [[k, override[k]]] : base[k] !== undefined ? [[k, base[k]]] : [])) as Rates;
}
function origins(base: Rates, custom: Rates): AppliedPricing['origins'] {
  return Object.fromEntries(keys.flatMap<[RateKey, 'custom' | 'internal']>(k => custom[k] !== undefined ? [[k, 'custom']] : base[k] !== undefined ? [[k, 'internal']] : []));
}
export function resolvePricing(internal: Partial<Record<ModelId, PricingEntry>>, custom: PricingTable = {}): Map<ModelId, ResolvedPricing> {
  const result = new Map<ModelId, ResolvedPricing>();
  for (const id of new Set([...Object.keys(internal), ...Object.keys(custom)])) {
    if (!/^[^:]+:.+$/.test(id)) invalidConfiguration();
    const base = internal[id as ModelId]; const over = custom[id as ModelId];
    if (over && Object.keys(over).some(k => !['rates', 'longContext', 'source', 'version'].includes(k))) invalidConfiguration();
    const baseRates = base?.rates ?? {}; const overRates = over?.rates ?? {};
    validateRates(baseRates); validateRates(overRates);
    let longContext: PricingEntry['longContext'];
    if (over?.longContext !== null && (base?.longContext || over?.longContext)) {
      const minimumInputTokens = over?.longContext?.minimumInputTokens ?? base?.longContext?.minimumInputTokens;
      if (!minimumInputTokens || !Number.isSafeInteger(minimumInputTokens)) invalidConfiguration();
      const rates = mergeRates(base?.longContext?.rates, over?.longContext?.rates);
      validateRates(rates); longContext = { minimumInputTokens, rates };
    }
    result.set(id as ModelId, {
      entry: { rates: mergeRates(baseRates, overRates), longContext, source: over?.source ?? base?.source, version: over?.version ?? base?.version },
      standardOrigins: origins(baseRates, overRates), longOrigins: origins(base?.longContext?.rates ?? {}, over?.longContext?.rates ?? {}),
      internalSource: base?.source, internalVersion: base?.version,
    });
  }
  return result;
}
export function calculateCost(pricing: ResolvedPricing | undefined, usage: Usage): Cost {
  const long = pricing?.entry.longContext;
  const contextUnknown = !!long && usage.inputTokens === undefined;
  const useLong = !!long && usage.inputTokens !== undefined && usage.inputTokens >= long.minimumInputTokens;
  // Each tier inherits unspecified rates from the standard tier, but overrides do not cross tier boundaries.
  const rates = useLong ? mergeRates(pricing?.entry.rates, long?.rates) : { ...pricing?.entry.rates };
  const appliedPricing: AppliedPricing = {
    rates, origins: useLong ? { ...pricing?.standardOrigins, ...pricing?.longOrigins } : { ...pricing?.standardOrigins },
    context: useLong ? 'long' : 'standard', source: pricing?.entry.source, version: pricing?.entry.version,
    internalSource: pricing?.internalSource, internalVersion: pricing?.internalVersion,
  };
  const missing: string[] = [];
  let sum = 0; let known = 0;
  const add = (name: string, tokens: number | undefined, rate: number | undefined) => {
    if (tokens === 0) return;
    if (tokens === undefined || rate === undefined || contextUnknown) { missing.push(name); return; }
    sum += tokens * rate / (name === 'image' || name === 'inputImage' ? 1 : 1_000_000); known++;
  };
  const uncached = usage.uncachedInputTokens ?? (usage.inputTokens !== undefined && usage.cachedInputTokens !== undefined && usage.cacheWriteTokens !== undefined
    ? Math.max(0, usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens) : undefined);
  if (usage.images !== undefined) {
    add('image', usage.images, rates.image);
    add('inputImage', usage.inputImages, rates.inputImage);
    return { currency: 'USD', status: missing.length ? (known ? 'partial' : 'unknown') : 'known', estimatedUsd: missing.length === 0 || known ? sum : null, missing, appliedPricing };
  }
  add('input', uncached, rates.input);
  add('cachedInput', usage.cachedInputTokens, rates.cachedInput ?? rates.input);
  add('cacheWrite', usage.cacheWriteTokens, rates.cacheWrite);
  add('output', usage.outputTokens, rates.output);
  // Reasoning is part of outputTokens and must not be charged twice.
  return { currency: 'USD', status: missing.length === 0 ? 'known' : known > 0 ? 'partial' : 'unknown', estimatedUsd: missing.length === 0 || known > 0 ? sum : null, missing, appliedPricing };
}
