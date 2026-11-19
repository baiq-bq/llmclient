---
name: llmclient-pr-review
description: Prepare or review a llmclient pull request or release. Check model and pricing sources, provider contracts, SemVer, local tests and package contents.
---

# Prepare or review a llmclient change

1. Read [AGENTS.md](../../../AGENTS.md) and the full diff against the current base. Confirm the commit under review and identify changes to contracts, model capabilities, prices, packaging or release automation.
2. For every update, including documentation and CI, review the official model catalogs and rate tables for all integrated providers. Capture URLs, date and findings, make verified updates before release, and refresh the review against the final commit. Keep the English README, release guide, examples, consumer skill and this skill aligned. Flag an incomplete review as a release blocker.
3. Require a consistent version in the manifest and both lockfile roots, greater than the base and all published versions by SemVer precedence. Run `git fetch origin main` and `npm run check:release -- --base origin/main` with registry access. Recheck after a rebase or a concurrent release. Report actual verification results.
4. After the last change, run `npm ci`, `npm run check` and `npm pack --dry-run --ignore-scripts`. Require meaningful tests for behavior changes using simulated HTTP, the mock or SDK doubles. Check the public npm archive for the README, license, consumer skill and its references. CI uses `check:ci` only. A green CI run does not establish that the unit tests passed locally.
5. Check provider contract changes against request validation, literal model IDs, optional peer dependencies, direct file handling, final Zod validation, no repeated tool effects, abort propagation, the shared deadline, retry behavior and accounting across attempts. Confirm incomplete usage or rates produce a partial or unknown cost and preserve the known subtotal.
6. For release changes, verify registry destinations, the version/tag gates, temporary credentials, restricted permissions, and ESM/CommonJS package contents. Confirm the consumer skill loads from the packaged directory. Never publish from a PR or report an unverified check as passed.

Report actionable findings with file, line, scenario and impact. List the actual version, sources reviewed, test and packaging results, and unresolved blockers. Send review comments externally only when authorized.
