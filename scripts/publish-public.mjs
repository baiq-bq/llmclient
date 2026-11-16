import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './registry.mjs';
import { checkPublicVersion, publicRegistry } from './public-release.mjs';

// Publish only the npm pack allowlist, with a registry specific to the public copy.
export async function publishPublic(token) {
  if (!token || /\s/.test(token)) throw new Error('Invalid Cloud Build token.');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.name !== '@baiq/llmclient') throw new Error('Unexpected package name.');
  const temp = mkdtempSync(join(tmpdir(), 'llmclient-public-'));
  try {
    const auth = join(temp, '.npmrc');
    writeFileSync(auth, `@baiq:registry=${publicRegistry}\n//europe-west1-npm.pkg.dev/baiq-459807/llmclient-public/:_authToken=${token}\n`, { mode: 0o600 });
    const env = { ...process.env, NPM_CONFIG_USERCONFIG: auth };
    run('npm', ['pack', '--ignore-scripts', '--pack-destination', temp], { env });
    const archive = join(temp, `baiq-llmclient-${pkg.version}.tgz`);
    run('tar', ['-xzf', archive, '-C', temp]);
    const packageDir = join(temp, 'package');
    const manifestPath = join(packageDir, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.publishConfig = { ...manifest.publishConfig, registry: publicRegistry };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await checkPublicVersion(pkg.version);
    run('npm', ['publish', packageDir, '--ignore-scripts', '--registry', publicRegistry, '--tag', 'latest'], { env, cwd: temp });
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
