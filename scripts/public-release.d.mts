export const publicRegistry: string;
export function assertPublicVersion(version: string, status: number, metadata?: unknown): void;
export function checkPublicVersion(version: string): Promise<void>;
