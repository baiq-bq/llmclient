import { readFileSync, rmSync } from 'node:fs';
import { registry, run, withRegistryToken } from './registry.mjs';
import { checkRelease } from './check-release.mjs';
const tokenPath = process.env.LLMCLIENT_TOKEN_FILE;
if (!tokenPath) throw new Error('Cloud Build token file is required.');
try {
  withRegistryToken(readFileSync(tokenPath, 'utf8').trim(), env => {
    // Recheck immediately before publishing: a concurrent build may have released first.
    checkRelease(env);
    run('npm', ['publish', '--ignore-scripts', '--registry', registry, '--tag', 'latest'], { env });
  });
} finally { rmSync(tokenPath, { force: true }); }
