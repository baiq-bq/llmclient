import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const registry = 'https://europe-west1-npm.pkg.dev/baiq-459807/npm-private/';
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status ?? 'unavailable'}).`);
  return result.stdout;
}
/** The token is never printed, passed as a CLI argument, or stored in the checkout. */
export function withRegistry(callback) {
  const token = run('gcloud', ['auth', 'print-access-token', '--project=baiq-459807'], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim();
  if (!token || /\s/.test(token)) throw new Error('Invalid gcloud access token.');
  const directory = mkdtempSync(join(tmpdir(), 'baiq-npm-auth-'));
  const userconfig = join(directory, '.npmrc');
  writeFileSync(userconfig, `@baiq:registry=${registry}\n//europe-west1-npm.pkg.dev/baiq-459807/npm-private/:_authToken=${token}\n`, { mode: 0o600 });
  try { return callback({ ...process.env, NPM_CONFIG_USERCONFIG: userconfig }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
