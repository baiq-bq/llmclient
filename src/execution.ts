import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError } from 'ai';
import { LlmError } from './errors.js';
import type { RetryPolicy } from './types.js';
export const defaultRetryPolicy: Readonly<RetryPolicy> = Object.freeze({ maxRetries: 2, repairFromAttempt: 2, maxRepairCharacters: 32_000, baseDelayMs: 500, maxDelayMs: 10_000 });
export class Budget {
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout>;
  private timedOut = false;
  private onAbort = () => this.controller.abort();
  readonly deadline: number;
  constructor(timeoutMs: number, private parent?: AbortSignal) {
    this.deadline = Date.now() + timeoutMs;
    this.timer = setTimeout(() => { this.timedOut = true; this.controller.abort(); }, timeoutMs);
    parent?.addEventListener('abort', this.onAbort, { once: true });
    if (parent?.aborted) this.controller.abort();
  }
  get signal() { return this.controller.signal; }
  cancel() { this.controller.abort(); }
  check() {
    if (this.timedOut || Date.now() >= this.deadline) throw new LlmError('TIMEOUT');
    if (this.signal.aborted) throw new LlmError('ABORTED');
  }
  async race<T>(promise: PromiseLike<T>): Promise<T> {
    this.check();
    let rejectAbort: () => void = () => {};
    const abort = new Promise<never>((_, reject) => { rejectAbort = () => { try { this.check(); } catch (e) { reject(e); } }; this.signal.addEventListener('abort', rejectAbort, { once: true }); });
    try { return await Promise.race([promise, abort]); } finally { this.signal.removeEventListener('abort', rejectAbort); }
  }
  async wait(ms: number) {
    this.check();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await this.race(new Promise<void>(resolve => { timer = setTimeout(resolve, ms); })); } finally { clearTimeout(timer); }
  }
  close() { clearTimeout(this.timer); this.parent?.removeEventListener('abort', this.onAbort); }
}
export function classify(error: unknown, budget: Budget): LlmError {
  try { budget.check(); } catch (e) { return e as LlmError; }
  if (error instanceof LlmError) return error;
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) return new LlmError('STRUCTURED_OUTPUT_ERROR', { retryable: true });
  if (APICallError.isInstance(error)) {
    const value = error.responseHeaders?.['retry-after'];
    const retryAfterMs = value === undefined ? undefined : /^\d+(\.\d+)?$/.test(value) ? Number(value) * 1000 : Math.max(0, Date.parse(value) - Date.now());
    return new LlmError('PROVIDER_ERROR', { retryable: error.isRetryable, upstreamStatus: error.statusCode, retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined });
  }
  return new LlmError('PROVIDER_ERROR');
}
/** Bounded queue. Backpressure is included in the operation deadline. */
export class EventQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private readers: (() => void)[] = [];
  private writers: (() => void)[] = [];
  private done = false;
  private error?: unknown;
  private consumed = false;
  constructor(private budget: Budget) {}
  async push(value: T) {
    while (this.buffer.length >= 32 && !this.done) await this.budget.race(new Promise<void>(resolve => this.writers.push(resolve)));
    this.budget.check(); if (this.done) return;
    this.buffer.push(value); this.readers.splice(0).forEach(fn => fn());
  }
  close(error?: unknown) { this.error = error; this.done = true; this.readers.splice(0).forEach(fn => fn()); this.writers.splice(0).forEach(fn => fn()); }
  async *[Symbol.asyncIterator]() {
    if (this.consumed) throw new LlmError('INVALID_REQUEST');
    this.consumed = true;
    try {
      while (true) {
        if (this.buffer.length) { const value = this.buffer.shift()!; this.writers.splice(0).forEach(fn => fn()); yield value; }
        else if (this.done) { if (this.error) throw this.error; return; }
        else await new Promise<void>(resolve => this.readers.push(resolve));
      }
    } finally { if (!this.done) this.budget.cancel(); }
  }
}
