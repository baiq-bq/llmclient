import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { run } from './registry.mjs';
import { assertReleaseVersion } from './version-policy.mjs';

const registry = 'https://registry.npmjs.org/';
const packageName = '@baiq-bq/llmclient';

export function getNpmRelease(pkg, lock, versions, tag, prerelease) {
  const { version } = assertReleaseVersion(pkg, lock, versions);
  if (tag !== `v${version}` || version.includes('+')) {
    throw new Error('The release tag must be v followed by the exact package version, without build metadata.');
  }
  const isPrerelease = semver.prerelease(version) !== null;
  if (prerelease !== isPrerelease) throw new Error('The GitHub prerelease flag must match the SemVer version.');

  const manifest = { ...pkg, name: packageName, publishConfig: { registry, access: 'public' } };
  delete manifest.scripts;
  delete manifest.devDependencies;
  return { manifest, distTag: isPrerelease ? 'next' : 'latest' };
}

async function packRelease(tag, prerelease, destination) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const response = await fetch(`${registry}@baiq-bq%2fllmclient`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cannot verify npm registry versions (HTTP ${response.status}).`);
  const metadata = await response.json();
  if (metadata.name !== packageName || !metadata.versions || Array.isArray(metadata.versions) || typeof metadata.versions !== 'object') {
    throw new Error('Invalid metadata for the public npm package.');
  }
  const { manifest, distTag } = getNpmRelease(pkg, lock, Object.keys(metadata.versions), tag, prerelease);
  const directory = mkdtempSync(join(tmpdir(), 'llmclient-npm-'));
  try {
    const staging = join(directory, 'package');
    mkdirSync(staging);
    writeFileSync(join(staging, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    cpSync('dist', join(staging, 'dist'), { recursive: true });
    cpSync('README.md', join(staging, 'README.md'));
    const [result] = JSON.parse(run('npm', ['pack', './package', '--ignore-scripts', '--json'], {
      cwd: directory, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8',
    }));
    const output = resolve(destination);
    mkdirSync(output, { recursive: true });
    copyFileSync(join(directory, result.filename), join(output, 'llmclient.tgz'));
    writeFileSync(join(output, 'release.txt'), `${distTag}\n`);
    console.log(`Packed ${manifest.name}@${manifest.version} for ${distTag} (${result.entryCount} files).`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [tag, prerelease, destination] = process.argv.slice(2);
  if (!tag || !['true', 'false'].includes(prerelease) || !destination) {
    throw new Error('Usage: node scripts/npm-release.mjs <vX.Y.Z> <true|false> <output directory>');
  }
  await packRelease(tag, prerelease === 'true', destination);
}
