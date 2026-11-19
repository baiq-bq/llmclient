export function getNpmRelease(
  pkg: unknown, lock: unknown, versions: unknown, tag: string, prerelease: boolean,
): { manifest: { name: string; version: string; publishConfig: { registry: string; access: string } }; distTag: 'next' | 'latest' };
