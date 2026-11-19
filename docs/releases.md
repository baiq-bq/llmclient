# Publish a release

The public package is [`@baiq-bq/llmclient`](https://www.npmjs.com/package/@baiq-bq/llmclient). Each distribution includes its README, MIT license and consumer skill. Review [AGENTS.md](../AGENTS.md) before preparing a release.

1. Review the official model catalogs and prices for OpenAI, Anthropic, Google, xAI, DeepSeek and Kimi, even for documentation-only changes. Update the catalog, pricing, tests, README, examples and skills as needed. Check preview, restricted and retired models, scheduled pricing changes, cache tiers and thresholds. Record sources, review date and findings in the release notes. Complete this check before publishing.
2. Increment the version in `package.json` and `package-lock.json` to a SemVer version greater than the base and all published versions. For a patch, run `npm version patch --no-git-tag-version`.
3. After the last change, run `npm ci`, `npm run check` and `npm pack --dry-run --ignore-scripts`. The internal registry gate runs with `npm run check:release -- --base origin/main` and requires Google Cloud read access. To inspect the public archive after a build, run `node scripts/npm-release.mjs v0.5.3 false /tmp/llmclient-release` with the actual version and prerelease flag. Check that it includes the README, license, `skills/llmclient/SKILL.md` and its references.
4. Merge the changes to `main` and create a [GitHub release](https://github.com/baiq-bq/llmclient/releases/new) at that commit. Use the exact manifest version prefixed with `v`. Set the GitHub prerelease flag for a version such as `v0.6.0-rc.1`.
5. Publish the release and watch [Publish to npm](https://github.com/baiq-bq/llmclient/actions/workflows/publish-npm.yml). Stable versions publish to `latest` and prereleases to `next`. Verify installation from npm without credentials before starting another release.

A draft or tag alone does not trigger npm publication. The workflow validates the commit, version, tag, lockfile and registry versions, then builds and publishes using OIDC. npm may take several minutes to make a version downloadable. If npm has accepted the upload, check the registry before retrying. Published versions are immutable.

The [npm package settings](https://www.npmjs.com/package/@baiq-bq/llmclient?activeTab=admin) authorize the `publish-npm.yml` workflow in `baiq-bq/llmclient` as a GitHub Actions Trusted Publisher with **Allow npm publish** enabled. GitHub-hosted runners obtain short-lived credentials without a stored npm token. [Trusted Publishing documentation](https://docs.npmjs.com/trusted-publishers/)

## Internal distribution

The `llmclient-main-publish` Cloud Build trigger publishes `@baiq/llmclient` to the private `npm-private` repository on pushes to `main`. The public package is distributed solely through npmjs.org.

Inspect the internal trigger with `gcloud builds triggers describe llmclient-main-publish --region=europe-west1 --project=baiq-459807`. Unit tests run locally. The `npm run publish:private` command is reserved for explicitly requested manual Google releases.
