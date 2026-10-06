import type { Accounting, CompatibilityDetails, StructuredOutputDiagnostics } from './types.js';
export type LlmErrorCode = 'INVALID_CONFIGURATION' | 'INVALID_REQUEST' | 'PROVIDER_NOT_CONFIGURED' | 'UNSUPPORTED_CAPABILITY' | 'PROVIDER_ERROR' | 'STRUCTURED_OUTPUT_ERROR' | 'TRUNCATED_OUTPUT' | 'CONTENT_FILTERED' | 'TOOL_ERROR' | 'TIMEOUT' | 'ABORTED';
const messages: Record<LlmErrorCode, string> = {
  INVALID_CONFIGURATION: 'Invalid LLM client configuration.', INVALID_REQUEST: 'Invalid LLM request.',
  PROVIDER_NOT_CONFIGURED: 'The provider is not configured.', UNSUPPORTED_CAPABILITY: 'The selected model does not support these settings.',
  PROVIDER_ERROR: 'The LLM provider call failed.', STRUCTURED_OUTPUT_ERROR: 'The structured output is invalid.',
  TRUNCATED_OUTPUT: 'The model output was truncated.', CONTENT_FILTERED: 'The provider filtered the output.',
  TOOL_ERROR: 'A tool failed.', TIMEOUT: 'The LLM operation exceeded its deadline.', ABORTED: 'The LLM operation was cancelled.',
};
/** Contains safe codes and numeric status only; never retains provider causes or bodies. */
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly upstreamStatus?: number;
  readonly details?: CompatibilityDetails;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly structuredOutput?: StructuredOutputDiagnostics;
  declare readonly accounting?: Accounting;
  constructor(code: LlmErrorCode, options: { upstreamStatus?: number; retryable?: boolean; retryAfterMs?: number; accounting?: Accounting; details?: CompatibilityDetails; structuredOutput?: StructuredOutputDiagnostics } = {}) {
    super(messages[code]); this.details = options.details; this.name = 'LlmError'; this.code = code;
    this.upstreamStatus = options.upstreamStatus; this.retryable = options.retryable ?? false; this.retryAfterMs = options.retryAfterMs;
    if (options.structuredOutput) this.structuredOutput = structuredClone(options.structuredOutput);
    if (options.accounting) Object.defineProperty(this, 'accounting', { value: options.accounting, enumerable: false });
  }
}
export function invalidConfiguration(): never { throw new LlmError('INVALID_CONFIGURATION'); }
