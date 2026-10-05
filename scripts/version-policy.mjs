import semver from 'semver';
import { registry } from './registry.mjs';

export function assertReleaseVersion(pkg, lock, publishedVersions, baseVersion) {
  if (pkg?.name !== '@baiq/llmclient' || pkg?.publishConfig?.registry !== registry) throw new Error('Unexpected package name or publication registry.');
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+]|$)/.test(pkg.version) || !semver.valid(pkg.version)) throw new Error('package.json must contain a canonical SemVer version.');
  if (lock?.name !== pkg.name || lock?.version !== pkg.version || lock?.packages?.['']?.name !== pkg.name || lock?.packages?.['']?.version !== pkg.version) throw new Error('package-lock.json must match the package name and version in package.json.');
  if (!Array.isArray(publishedVersions) || !publishedVersions.length || publishedVersions.some(version => typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+]|$)/.test(version) || !semver.valid(version))) throw new Error('Cannot verify published versions; publication is blocked.');
  const latest = [...publishedVersions].sort(semver.rcompare)[0];
  if (!semver.gt(pkg.version, latest)) throw new Error(`Version ${pkg.version} has not increased: it must be greater than published version ${latest}. Run npm version patch --no-git-tag-version (or minor/major as appropriate).`);
  if (baseVersion !== undefined && (!semver.valid(baseVersion) || !semver.gt(pkg.version, baseVersion))) throw new Error(`Version ${pkg.version} must be greater than the PR base version ${baseVersion}. Increment it before creating the PR.`);
  return { version: pkg.version, previous: latest };
}
