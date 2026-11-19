# llmclient maintainer instructions

These instructions apply to the entire repository. When preparing or reviewing a pull request, follow the [llmclient PR review skill](.agents/skills/llmclient-pr-review/SKILL.md). The [consumer skill](skills/llmclient/SKILL.md) ships with the package and is maintained separately from these instructions.

## Architecture and behavior

- Maintain Node.js 24+, ESM and CommonJS entry points, and declarations for both. The supported providers are OpenAI, Anthropic, Google, xAI, DeepSeek and Kimi. Keep each SDK an optional peer dependency and let callers choose which adapters to install.
- `src/client.ts` orchestrates requests, `types.ts` defines contracts, `models.ts` and `catalog.ts` define the catalog, `pricing.ts` and `accounting.ts` handle costs, `execution.ts` handles deadlines and retries, `images.ts` handles image generation, and `providers/` contains the optional adapters.
- Keep image and text model types separate. Infer literal IDs for registered external models without accepting arbitrary misspellings. Accept explicit configuration and keep the package independent of Editavia and environment variables.
- Validate operations, reasoning, tools, MIME type and file limits before I/O. Return stable `LlmError` codes and structured alternatives with provider configuration status. Send files directly, without conversion, extraction or silent model substitution.
- Validate completed objects with Zod. Stream fragments are provisional. Tools require a description, schema and execute function. Default to five steps and propagate `AbortSignal`. Never restart after tools have run or stream events have been emitted.
- Keep one deadline across calls, backoff and tools. Disable SDK retries and keep the client policy of two retries by default, with object repair from the second attempt. Preserve known usage across failed attempts and steps. Never log secrets, prompts, responses or private provider bodies automatically.
- Keep `mock` local, free and available for text, objects, streaming and images. Validate mock objects and never execute real tools.

## Required model, pricing and documentation review

- **For every update, including documentation and CI changes, review each provider's official model catalog and pricing. Repeat or refresh that check against the final commit before every release.** Check for new model IDs, capabilities, deprecations and new or scheduled rates, including context thresholds, cache reads and writes, and image pricing. Record the source URLs, review date and outcome in the release or PR notes. If sources are unavailable, report the limitation and complete the review before publishing.
- Apply verified changes in `src/models.ts`, `src/catalog.ts` and the relevant adapters. Keep exported constants, the catalogs and simulated SDK payload tests in sync. Differentiate stable, preview, restricted and retired models. Document conservative package limits and scheduled price changes. Preserve existing IDs when possible and never silently redirect a request to a different model.
- Keep the English README and pricing tables, compiled examples, release guide, consumer skill and maintainer skill aligned with behavior and available models. Review the consumer skill's example imports, recommendations and packaged references on every release, even when it needs no changes.
- Use USD per million tokens or USD per image. Allow per-model, per-field and per-tier overrides, including zero, and isolate client configuration. Deduct cached input from ordinary input, account for reported cache writes and avoid double-charging reasoning already in output. When pricing or usage is missing, preserve the known subtotal and report partial or unknown cost. Nonstandard region, retention, tier, quality and resolution can require overrides.

## Tests and versioning

- Maintain `tests/*.test.ts` for changes in behavior, including release tooling. Test with simulated HTTP or SDKs. Before a PR or release, after the final change run `npm ci`, `npm run check` and `npm pack --dry-run --ignore-scripts`. Verify the public archive also contains the license, README, skill and references. Report real outcomes and any checks you could not run.
- Unit tests run locally. CI uses `npm run check:ci` for types, builds and ESM/CommonJS imports. Keep paid provider calls out of routine tests.
- Increment the version in `package.json` and both root entries in `package-lock.json` before opening a PR, including documentation or CI changes. Use a SemVer increment greater than the base and all published versions. Build metadata is not a version increment. Never overwrite a published version or bypass the gates.
- Run `git fetch origin main` and `npm run check:release -- --base origin/main` with access to the internal registry. Recheck after rebases and concurrent releases. Use `codex/<name>` for PR branches by default. Block PRs without an increment or documented local checks.

## Publication

- The public package is `@baiq-bq/llmclient` on npmjs.org. A GitHub release from `main` with a tag matching `v<version>` triggers `.github/workflows/publish-npm.yml` via npm Trusted Publishing. Stable versions go to `latest` and prereleases to `next`. Follow the [release guide](docs/releases.md).
- The private Google registry is `https://europe-west1-npm.pkg.dev/baiq-459807/npm-private/`, with scope `@baiq`. The dedicated `llmclient-main-publish` trigger runs `cloudbuild.yaml` on pushes to `main`. It installs dependencies, gets a temporary token, validates SemVer and the lockfile against all registry versions, checks types/build/imports, and repeats the gate before publishing. Duplicates, older versions and registry failures are errors.
- Keep the Cloud Build service account `llmclient-publisher@baiq-459807.iam.gserviceaccount.com` limited to writing to `npm-private` and project logs. The dedicated GitHub connection is `llmclient`, using the existing `baiq-bq` installation and Secret Manager. Do not edit the shared `baiq` connection, modify unrelated triggers, or grant publishing access to PR jobs. Never store secrets in Git or the tarball. Use explicit gcloud project and region settings.
- Do not publish manually if automation will publish the same commit. The manual `publish:private` command is reserved for explicitly requested operations, runs local checks and uses temporary gcloud credentials. Cloud Build does not run tests or gcloud from the Node container. Its trigger processes the commit from the push event, and a single push may contain multiple commits.
