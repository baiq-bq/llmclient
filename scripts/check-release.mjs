import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { registry, run, withRegistry, withRegistryToken } from './registry.mjs';
import { assertReleaseVersion } from './version-policy.mjs';

export function checkRelease(env, base) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  // Fail closed on auth, network, missing package or malformed metadata errors.
  // Compare ALL versions, not just the mutable latest dist-tag.
  const versions = JSON.parse(run('npm', ['view', '@baiq/llmclient', 'versions', '--json', '--registry', registry], { env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }));
  let baseVersion;
  if (base !== undefined) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(base)) throw new Error('Invalid Git base reference.');
    baseVersion = JSON.parse(run('git', ['show', `${base}:package.json`], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })).version;
  }
  const result = assertReleaseVersion(pkg, lock, typeof versions === 'string' ? [versions] : versions, baseVersion);
  console.log(`Release version verified: ${result.previous} -> ${result.version}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const base = args[0] === '--base' && args.length === 2 ? args[1] : undefined;
  if (args.length && !base) throw new Error('Usage: node scripts/check-release.mjs [--base origin/main]');
  const tokenPath = process.env.LLMCLIENT_TOKEN_FILE;
  if (tokenPath) withRegistryToken(readFileSync(tokenPath, 'utf8').trim(), env => checkRelease(env, base));
  else withRegistry(env => checkRelease(env, base));
}
