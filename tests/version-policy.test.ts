import { describe, expect, it } from 'vitest';
import { getNpmRelease } from '../scripts/npm-release.mjs';
import { assertReleaseVersion } from '../scripts/version-policy.mjs';
const registry = 'https://europe-west1-npm.pkg.dev/baiq-459807/npm-private/';
function fixture(version = '0.1.1') {
  return { pkg: { name: '@baiq/llmclient', version, publishConfig: { registry } }, lock: { name: '@baiq/llmclient', version, packages: { '': { name: '@baiq/llmclient', version } } } };
}
function release(version: string, published: unknown, base?: string) { const { pkg, lock } = fixture(version); return assertReleaseVersion(pkg, lock, published, base); }
describe('release version policy (local unit tests)', () => {
  it.each(['0.1.1', '0.2.0', '1.0.0'])('allows a SemVer increment to %s', version => expect(release(version, ['0.1.0'])).toEqual({ version, previous: '0.1.0' }));
  it.each(['0.1.0', '0.0.9', '0.1.0+build.2'])('blocks unchanged/decreased precedence %s', version => expect(() => release(version, ['0.1.0'])).toThrow('has not increased'));
  it('compares numerically, not lexically', () => expect(release('0.1.11', ['0.1.9', '0.1.10'])).toHaveProperty('previous', '0.1.10'));
  it('checks every published version even when latest points to an older version', () => expect(() => release('0.1.2', ['0.1.0', '0.2.0', '0.1.1'])).toThrow('0.2.0'));
  it('requires an increment above the PR base as well as the registry', () => expect(() => release('0.1.2', ['0.1.0'], '0.1.2')).toThrow('PR base'));
  it('allows stable versions after prereleases', () => expect(release('1.0.0', ['1.0.0-rc.1'])).toHaveProperty('version', '1.0.0'));
  it('orders prereleases correctly', () => expect(release('1.0.0-rc.10', ['1.0.0-rc.9'])).toHaveProperty('previous', '1.0.0-rc.9'));
  it.each(['1.2', 'latest', '01.2.3', 'v1.2.3', '1.2.3-01', '1.2.3\n'])('rejects noncanonical versions %s', version => expect(() => release(version, ['0.1.0'])).toThrow('SemVer'));
  it.each([[], null, {}, ['bad'], ['0.1.0', 'bad']])('fails closed when registry metadata cannot be verified (%j)', published => expect(() => release('0.1.1', published)).toThrow('publication is blocked'));
  it('rejects a different registry before publishing', () => { const { pkg, lock } = fixture(); pkg.publishConfig.registry = 'https://registry.npmjs.org/'; expect(() => assertReleaseVersion(pkg, lock, ['0.1.0'])).toThrow('registry'); });
  it('rejects a renamed package', () => { const { pkg, lock } = fixture(); pkg.name = '@other/llmclient'; expect(() => assertReleaseVersion(pkg, lock, ['0.1.0'])).toThrow('package name'); });
  it('requires lockfile root and package entry to match', () => {
    const { pkg, lock } = fixture(); lock.packages[''].version = '0.1.0'; expect(() => assertReleaseVersion(pkg, lock, ['0.1.0'])).toThrow('package-lock.json');
    const other = fixture(); other.lock.version = '0.1.0'; expect(() => assertReleaseVersion(other.pkg, other.lock, ['0.1.0'])).toThrow('package-lock.json');
  });
});

describe('public npm release', () => {
  it('prepares the npm variant while preserving the original manifest', () => {
    const { pkg, lock } = fixture('0.5.1');
    expect(getNpmRelease(pkg, lock, ['0.5.0', '0.0.0-stage'], 'v0.5.1', false)).toMatchObject({
      distTag: 'latest',
      manifest: { name: '@baiq-bq/llmclient', version: '0.5.1', publishConfig: { registry: 'https://registry.npmjs.org/', access: 'public' } },
    });
    expect(pkg).toMatchObject({ name: '@baiq/llmclient', publishConfig: { registry } });
  });

  it('publishes a matching prerelease on next and rejects the stable flag', () => {
    const { pkg, lock } = fixture('0.6.0-rc.1');
    expect(getNpmRelease(pkg, lock, ['0.5.0'], 'v0.6.0-rc.1', true).distTag).toBe('next');
    expect(() => getNpmRelease(pkg, lock, ['0.5.0'], 'v0.6.0-rc.1', false)).toThrow('prerelease flag');
  });

  it('blocks mismatched tags and releases below any published version', () => {
    const { pkg, lock } = fixture('0.5.1');
    expect(() => getNpmRelease(pkg, lock, ['0.5.0'], 'v0.5.2', false)).toThrow('exact package version');
    expect(() => getNpmRelease(pkg, lock, ['0.5.0', '0.6.0-rc.1'], 'v0.5.1', false)).toThrow('has not increased');
  });
});
