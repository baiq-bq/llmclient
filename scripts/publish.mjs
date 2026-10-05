import { readFileSync } from 'node:fs';
import { registry, run, withRegistry } from './registry.mjs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
if (pkg.name !== '@baiq/llmclient' || pkg.publishConfig?.registry !== registry) throw new Error('Unexpected publication target.');
run('npm', ['run', 'check']);
withRegistry(env => run('npm', ['publish', '--registry', registry, '--tag', 'latest'], { env }));
