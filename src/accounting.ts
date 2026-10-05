import type { LanguageModelUsage } from 'ai';
import type { Accounting, AccountingEntry, ModelId, Usage } from './types.js';
import { calculateCost, type ResolvedPricing } from './pricing.js';

function count(n: number | undefined) { return n !== undefined && Number.isSafeInteger(n) && n >= 0 ? n : undefined; }
export function normalizeUsage(usage: LanguageModelUsage): Usage {
  return {
    inputTokens: count(usage.inputTokens), outputTokens: count(usage.outputTokens), totalTokens: count(usage.totalTokens),
    reasoningTokens: count(usage.outputTokenDetails?.reasoningTokens), cachedInputTokens: count(usage.inputTokenDetails?.cacheReadTokens),
    cacheWriteTokens: count(usage.inputTokenDetails?.cacheWriteTokens), uncachedInputTokens: count(usage.inputTokenDetails?.noCacheTokens),
  };
}
export class Ledger {
  readonly entries: AccountingEntry[] = [];
  attemptCount = 0;
  private active?: AccountingEntry;
  constructor(private readonly pricing: ResolvedPricing | undefined) {}
  begin(step: number) {
    this.attemptCount++;
    this.active = { attempt: this.attemptCount, step, usage: {}, cost: calculateCost(this.pricing, {}) };
    this.entries.push(this.active);
  }
  record(usage: Usage) {
    if (!this.active) return;
    this.active.usage = Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, count(v)]));
    this.active.cost = calculateCost(this.pricing, this.active.usage);
  }
  snapshot(): Accounting {
    const usage: Usage = {};
    const fields: (keyof Usage)[] = ['inputTokens', 'outputTokens', 'totalTokens', 'reasoningTokens', 'cachedInputTokens', 'cacheWriteTokens', 'uncachedInputTokens', 'images', 'inputImages'];
    for (const key of fields) {
      const reported = this.entries.flatMap(e => e.usage[key] === undefined ? [] : [e.usage[key]!]);
      if (reported.length) usage[key] = reported.reduce((a, b) => a + b, 0);
    }
    const costs = this.entries.map(e => e.cost);
    const known = costs.flatMap(c => c.estimatedUsd === null ? [] : [c.estimatedUsd]);
    const status = costs.length && costs.every(c => c.status === 'known') ? 'known' : costs.some(c => c.status !== 'unknown') ? 'partial' : 'unknown';
    return {
      attemptCount: this.attemptCount, usage,
      usageComplete: this.entries.length > 0 && this.entries.every(e => (e.usage.images !== undefined || (e.usage.inputTokens !== undefined && e.usage.outputTokens !== undefined))),
      cost: { currency: 'USD', status, estimatedUsd: known.length ? known.reduce((a, b) => a + b, 0) : null },
      entries: structuredClone(this.entries),
    };
  }
}
