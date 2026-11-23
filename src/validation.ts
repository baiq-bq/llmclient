import { modelMessageSchema } from 'ai';
import { z } from 'zod';
import { invalidConfiguration, LlmError } from './errors.js';
import type { FileCapabilities, ImageModelDefinition, InputFile, LlmRequest, ModelId, ModelCapabilities, ModelDefinition, Reasoning } from './types.js';

export const reasoningSchema = z.object({ effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']), budgetTokens: z.number().int().positive().optional() }).strict();
export const defaultsSchema = z.object({
  model: z.string().regex(/^(mock|[^:]+:.+)$/).optional(), system: z.string().optional(), maxOutputTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().max(2_147_483_647).optional(), maxSteps: z.number().int().min(1).max(100).optional(), temperature: z.number().finite().min(0).optional(), reasoning: reasoningSchema.optional(),
}).strict();
const filesSchema = z.object({ mediaTypes: z.array(z.string().regex(/^[\w.+-]+\/[\w.+-]+$/)).min(1), maxFileBytes: z.number().int().positive(), maxTotalBytes: z.number().int().positive(), maxFiles: z.number().int().positive() }).strict();
const capabilitiesSchema = z.object({
  images: z.boolean(), files: filesSchema.optional(), structuredOutput: z.boolean(), structuredOutputWithReasoning: z.boolean().optional(), tools: z.boolean(), streaming: z.boolean(),
  temperature: z.object({ max: z.number().finite().nonnegative(), withReasoning: z.boolean() }).strict().optional(),
  reasoning: z.object({ mode: z.enum(['effort', 'adaptive', 'budget', 'level']), efforts: z.array(reasoningSchema.shape.effort).min(1), budgetRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(), streamOnly: z.boolean().optional(), budgetSharesOutputLimit: z.boolean().optional(), maxCombinedOutputTokens: z.number().int().positive().optional() }).strict().optional(),
  maxOutputTokens: z.number().int().positive(),
}).strict();
export function validateModel(def: ModelDefinition) { if (!capabilitiesSchema.safeParse(def?.capabilities).success) invalidConfiguration(); }
export function validateImageModel(def: ImageModelDefinition) {
  if (!z.object({ files: filesSchema.optional(), maxImages: z.number().int().positive(), sizes: z.array(z.string()).optional(), aspectRatios: z.array(z.string()).optional(), seed: z.boolean().optional(), source: z.string().optional() }).strict().safeParse(def).success) invalidConfiguration();
}
export function validateRequest(input: LlmRequest<ModelId | 'mock'>) {
  const { messages, images, files, tools, signal, providerOptions, ...defaults } = input;
  if (!defaultsSchema.safeParse(defaults).success || !Array.isArray(messages) || !messages.length || messages.some(m => !modelMessageSchema.safeParse(m).success)) throw new LlmError('INVALID_REQUEST');
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new LlmError('INVALID_REQUEST');
  if (tools) for (const tool of Object.values(tools)) if (tool.type === 'provider' || typeof tool.execute !== 'function' || tool.needsApproval) throw new LlmError('INVALID_REQUEST');
}
export function inputFiles(input: LlmRequest<ModelId | 'mock'>): InputFile[] {
  const result: InputFile[] = [...input.files ?? [], ...input.images ?? []];
  for (const message of input.messages) {
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      if (part.type !== 'file' && part.type !== 'image') continue;
      const data = part.type === 'image' ? part.image : part.data;
      // Require local bytes or base64 so limits can be checked before any network I/O.
      let bytes: Uint8Array;
      if (data instanceof Uint8Array) bytes = data;
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (typeof data === 'string' && /^(?:data:[^;]+;base64,)?[A-Za-z0-9+/]*={0,2}$/.test(data)) bytes = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64');
      else throw new LlmError('INVALID_REQUEST');
      let mediaType = part.mediaType;
      if (!mediaType && part.type === 'image') {
        const header = Buffer.from(bytes.slice(0, 12));
        mediaType = header.subarray(0, 4).toString('hex') === '89504e47' ? 'image/png' : header[0] === 255 && header[1] === 216 ? 'image/jpeg' : header.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : undefined;
      }
      if (!mediaType) throw new LlmError('INVALID_REQUEST');
      result.push({ bytes, mediaType, ...(part.type === 'file' ? { filename: part.filename } : {}) });
    }
  }
  validateFiles(result);
  return result;
}
export function validateFiles(files: readonly InputFile[]) {
  if (!Array.isArray(files) || files.some(f => !(f.bytes instanceof Uint8Array) || !f.bytes.byteLength || !/^[\w.+-]+\/[\w.+-]+$/.test(f.mediaType) || (f.filename !== undefined && (typeof f.filename !== 'string' || !f.filename.trim())))) throw new LlmError('INVALID_REQUEST');
}
export function fileReasons(files: readonly InputFile[], caps: FileCapabilities | undefined): string[] {
  if (!files.length) return [];
  if (!caps) return ['files_not_supported'];
  const reasons: string[] = [];
  if (files.some(f => !caps.mediaTypes.includes(f.mediaType))) reasons.push('unsupported_media_type');
  if (files.some(f => f.bytes.byteLength > caps.maxFileBytes)) reasons.push('file_too_large');
  if (files.reduce((sum, f) => sum + f.bytes.byteLength, 0) > caps.maxTotalBytes) reasons.push('total_files_too_large');
  if (files.length > caps.maxFiles) reasons.push('too_many_files');
  return reasons;
}
export function reasoningBudget(reasoning: Reasoning): number {
  return reasoning.effort === 'none' ? 0 : reasoning.budgetTokens ?? ({ minimal: 1024, low: 1024, medium: 4096, high: 16_384, xhigh: 32_768, max: 32_768 }[reasoning.effort]);
}
export function withOutputLimit(
  input: LlmRequest<ModelId | 'mock'>, caps: ModelCapabilities | undefined, explicitLimit: number | undefined,
): LlmRequest<ModelId | 'mock'> {
  const combinedLimit = caps?.reasoning?.maxCombinedOutputTokens;
  const extra = combinedLimit && input.reasoning?.effort !== undefined && input.reasoning.effort !== 'none' ? reasoningBudget(input.reasoning) : 0;
  return { ...input, maxOutputTokens: explicitLimit ?? Math.min(combinedLimit ?? Infinity, 4096 + extra) };
}
export function capabilityReasons(input: LlmRequest<ModelId | 'mock'>, caps: ModelCapabilities, files: InputFile[], object: boolean, streaming: boolean): string[] {
  const reasons = fileReasons(files, caps.files);
  if (files.some(f => f.mediaType.startsWith('image/')) && !caps.images) reasons.push('images_not_supported');
  if (object && !caps.structuredOutput) reasons.push('structured_output_not_supported');
  if (streaming && !caps.streaming) reasons.push('streaming_not_supported');
  if (input.tools && Object.keys(input.tools).length && !caps.tools) reasons.push('tools_not_supported');
  const reasoningEnabled = input.reasoning && input.reasoning.effort !== 'none';
  const maxOutputTokens = (reasoningEnabled ? caps.reasoning?.maxCombinedOutputTokens : undefined) ?? caps.maxOutputTokens;
  if (input.maxOutputTokens! > maxOutputTokens) reasons.push('output_limit_exceeded');
  if (input.temperature !== undefined && (!caps.temperature || input.temperature > caps.temperature.max || (!!input.reasoning && input.reasoning.effort !== 'none' && !caps.temperature.withReasoning))) reasons.push('temperature_not_supported');
  if (input.reasoning) {
    const r = input.reasoning; const c = caps.reasoning;
    if (!c || !c.efforts.includes(r.effort)) reasons.push('reasoning_not_supported');
    if (r.effort !== 'none' && c?.streamOnly && !streaming) reasons.push('reasoning_requires_streaming');
    if (r.effort !== 'none' && object && caps.structuredOutputWithReasoning === false) reasons.push('structured_output_requires_no_reasoning');
    const budget = reasoningBudget(r);
    if (r.budgetTokens !== undefined && (c?.mode !== 'budget' || r.effort === 'none')) reasons.push('reasoning_budget_not_supported');
    if (c?.mode === 'budget' && r.effort !== 'none' && (!c.budgetRange || budget < c.budgetRange[0] || budget > c.budgetRange[1])) reasons.push('reasoning_budget_out_of_range');
    if (c?.mode === 'budget' && c.budgetSharesOutputLimit !== false && r.effort !== 'none' && (input.model?.startsWith('anthropic:') ? input.maxOutputTokens! + budget > caps.maxOutputTokens : budget >= input.maxOutputTokens!)) reasons.push('reasoning_output_limit_exceeded');
  }
  return reasons;
}
