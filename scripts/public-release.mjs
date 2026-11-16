import semver from 'semver';

export const publicRegistry = 'https://europe-west1-npm.pkg.dev/baiq-459807/llmclient-public/';

// An empty registry is valid only when its package endpoint explicitly returns 404.
export function assertPublicVersion(version, status, metadata) {
  if (!semver.valid(version)) throw new Error('Invalid release version.');
  if (status === 404) return;
  if (status !== 200 || !metadata || typeof metadata !== 'object' || Array.isArray(metadata) || !metadata.versions || typeof metadata.versions !== 'object' || Array.isArray(metadata.versions)) throw new Error('Cannot verify public registry metadata; publication is blocked.');
  const versions = Object.keys(metadata.versions);
  if (!versions.length || versions.some(v => !semver.valid(v))) throw new Error('Invalid public registry versions; publication is blocked.');
  const latest = versions.sort(semver.rcompare)[0];
  if (!semver.gt(version, latest)) throw new Error(`Public version ${version} must exceed ${latest}.`);
}

export async function checkPublicVersion(version) {
  const response = await fetch(`${publicRegistry}@baiq%2fllmclient`, { signal: AbortSignal.timeout(30_000) });
  const metadata = response.status === 200 ? await response.json() : undefined;
  assertPublicVersion(version, response.status, metadata);
}
