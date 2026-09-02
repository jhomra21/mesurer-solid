# Releasing Mesurer Solid

Mesurer Solid uses a release PR as the human approval boundary and npm Trusted Publishing/OIDC as the only normal publishing path.

## Normal development

Add user-facing release notes under `## Unreleased` in `CHANGELOG.md` as changes land. Internal-only work may omit a note; an empty release is recorded as `No user-facing changes.`

Do not manually edit the public package version, create release tags, or run `npm publish` for normal releases.

When a user-facing feature changes the public package, keep its documentation current as part of the source PR. At minimum audit the root/package READMEs, feature-specific docs, `packages/mesurer/AGENT_INTEGRATION.md`, the repository and packaged `mesurer-ui` Agent Skill copies, and distribution-specific docs such as `extension/README.md` when the feature changes those surfaces.

## Stable documentation and upstream audit gate

Before preparing a stable release, perform a final documentation sweep against the actual public artifact and feature set **and re-audit current upstream Mesurer**.

For a stable release:

- canonical install examples must use `mesurer-solid` / the `latest` dist-tag, not `mesurer-solid@beta`;
- `@beta` may appear only where the text explicitly describes intentional prerelease testing;
- every public package subpath introduced since the prior stable release must be documented and package-guarded;
- the npm-facing `packages/mesurer/README.md` must describe only behavior actually present in the stable candidate;
- `packages/mesurer/AGENT_INTEGRATION.md` and the Agent Skill must reflect the current agent contract;
- `.agents/skills/mesurer-ui/SKILL.md` and `packages/mesurer/skills/mesurer-ui/SKILL.md` must remain byte-identical;
- extension-specific behavior must be reflected in `extension/README.md`;
- feature-specific guides and architecture docs must not contradict the public README;
- [`docs/UPSTREAM_PARITY.md`](./docs/UPSTREAM_PARITY.md) must pin an audit of upstream `ibelick/mesurer` current `main` from the final stable-readiness sweep;
- each meaningful upstream delta must be classified as **adopted**, **intentional divergence**, or **not applicable** before stable promotion;
- adopted upstream contracts must be implemented and regression-tested; intentional divergences must be documented clearly enough that the public package never implies those features are present or required for Mesurer Solid's workflow.

A newer upstream feature is not automatically a stable-release blocker. Mesurer Solid started as a source-first port, but it has its own plugin and agent-first product direction. The upstream audit exists to prevent accidental drift in behavior we adopt and to make deliberate differences explicit.

For screenshot releases specifically, keep [`docs/SCREENSHOTS.md`](./docs/SCREENSHOTS.md), the public README, Agent Integration guide, Agent Skill, extension guide, architecture docs, and the screenshot browser contract aligned.

This check is intentionally done before version-only release preparation. The generated release PR is metadata-only and is not the place to fix stale feature documentation or unresolved adopted-contract regressions.

## Prepare a release

There are two supported entry points into the same **prepare-release** workflow:

1. From GitHub Actions, run **prepare-release** from `main` and choose a version strategy.
2. Post an owner-only release command on the repository's **Release Control** issue (#32):
   - `/release beta-next`
   - `/release promote-stable`
   - `/release patch`
   - `/release minor`
   - `/release major`
   - `/release explicit X.Y.Z`

The Release Control path is deliberately narrow: only new comments on issue #32 from the repository owner are accepted, and it only prepares a release. It cannot publish directly.

Supported version strategies are:

- `beta-next`: `0.1.0-beta.2` -> `0.1.0-beta.3`; from a stable version such as `0.1.0`, starts `0.1.1-beta.0`.
- `promote-stable`: `0.1.0-beta.3` -> `0.1.0`. Stable promotion combines current `Unreleased` notes with the non-placeholder user-facing notes from the matching prerelease train (`beta`, `rc`, or another prerelease of the same `X.Y.Z`) so the stable release describes what actually shipped during prerelease validation.
- `patch`, `minor`, `major`: stable-version SemVer bumps.
- `explicit`: an exact supported SemVer version for exceptional cases such as an RC.

For ordinary release strategies, the workflow moves `Unreleased` changelog entries into the new version section. For `promote-stable`, it additionally carries forward matching prerelease-train notes, skips `No user-facing changes.` placeholders, and avoids duplicating an identical note block already present in `Unreleased`. Existing prerelease sections remain intact as historical records.

The workflow updates `packages/mesurer/package.json`, creates `release/v<version>`, and opens a `release: v<version>` PR.

Only one release PR may be open at a time. The generated release commit contains GitHub's native `[skip ci]` marker because the release PR is metadata-only and runtime/source compatibility was already validated before release preparation. That prevents normal `push` and `pull_request` workflows from being instantiated for the bot-created release PR, avoiding the separate maintainer approval prompt for those checks.

`prepare-release` explicitly dispatches `release-check.yml` against the generated release branch after opening the PR. `workflow_dispatch` is not suppressed by the release commit's skip marker, so **release-check is the single expected release-PR validation gate**. No PAT or long-lived publishing token is required.

If GitHub Actions is not allowed to create pull requests in the repository settings, PR creation fails closed and the workflow removes the remote release branch so it can be retried after the setting is enabled.

## Review the release PR

Review the version and changelog like any other code change. Merge only after **release-check** is green.

Use a normal **merge commit** for the generated release PR. Do **not** squash the generated release commit into `main`: the release commit deliberately contains `[skip ci]`, and a squash merge can preserve that marker in the new `main` commit, suppressing the push-trigger that normally dispatches publication. A normal merge commit keeps the metadata commit intact while producing a new `main` merge commit without the skip marker.

`release-check` is intentionally lightweight because the generated release PR may change only `packages/mesurer/package.json` and `CHANGELOG.md`. It verifies the `release/v<version>` branch matches the package version, the version increases correctly, the matching changelog section exists, exactly those two files changed, `package.json` changed only its version field, and the release identity/tooling tests pass. Runtime, framework-host, browser, and package compatibility belong to the already-reviewed source changes and are not repeated on the metadata-only release PR.

## Automatic publish after merge

`publish-trigger.yml` listens for pushes to `main`. It reads the package version currently on `main` and exits immediately when `v<version>` already exists. If the current version is untagged, it locates the first-parent release commit that introduced that version and dispatches `publish.yml` only when no package-affecting files (`packages`, root `package.json`, or `bun.lock`) changed after that release commit.

This push-trigger bridge is intentionally separate from the generated release PR's `pull_request` event. The release commit uses `[skip ci]`, which suppresses normal `push`/`pull_request` workflow creation for that commit, while the human merge creates a new `main` merge commit without the skip marker. The bridge then uses GitHub's `workflow_dispatch` exception to start the hardened publisher with the repository `GITHUB_TOKEN`; no PAT is needed.

`publish.yml` remains the only workflow that can publish to npm. Its `workflow_dispatch` recovery path resolves the approved release commit from `main`, verifies the current package source still matches it, and then performs the full release pipeline:

1. Verifies the current version maps to a valid main-branch release commit and `CHANGELOG.md` has the matching version section.
2. Builds the workspace and publishable package from the approved package source.
3. Stages and packs the exact sanitized npm candidate, verifies its package name/version and SHA-512 integrity metadata, performs an npm publish dry-run, and imports that exact tarball from a clean consumer.
4. Uploads that exact tarball and its `npm pack --json` metadata as the `npm-package` artifact.
5. Downloads the same artifact in the publish job and recomputes SHA-512 over the downloaded bytes before any registry action.
6. If the npm version does not exist, publishes that exact `.tgz` through Trusted Publishing/OIDC.
7. If the npm version already exists, verifies its registry integrity matches the tarball and continues recovery instead of republishing.
8. Verifies the expected npm dist-tag (`beta` for prereleases, `latest` for stable releases).
9. Creates `v<version>` only after npm succeeds, and refuses an existing tag that points at another commit.
10. Creates the GitHub Release from the matching changelog section; prerelease versions are marked as prereleases.

The npm publishing job is serialized with `cancel-in-progress: false`, so release jobs cannot race each other. Release-sensitive third-party Actions and the npm CLI used to pack/publish are pinned to immutable versions/revisions.

## Trusted Publisher configuration

The npm package is configured to disallow traditional token publishing. The trusted publisher remains:

- repository: `jhomra21/mesurer-solid`
- workflow filename: `publish.yml`
- environment: none
- allowed action: `npm publish`

Do not add `NPM_TOKEN` to repository secrets or the workflow. The publish job receives `id-token: write` only where npm publication occurs, and npm exchanges the GitHub OIDC identity for a short-lived publish credential.

A GitHub deployment Environment can be added later as an additional approval boundary, but if one is added to the publish job the npm Trusted Publisher must be updated to use the exact same Environment name. Do not add an Environment to only one side of that trust relationship.

## Recovery

If npm publication succeeds but a later tag/GitHub Release step fails, first rerun the failed GitHub Actions job/run. That preserves the original release commit and is the safest recovery path.

`publish.yml` also supports direct `workflow_dispatch` for recovery of the version currently on `main`. Manual recovery is rejected from any other ref. It verifies the package source has not changed since the release commit and verifies any already-published npm integrity before doing post-publish work.

Never reuse or overwrite an npm version. If the existing registry integrity differs from the candidate, the workflow fails closed.

If a release PR was accidentally squash-merged with `[skip ci]` and the normal `main` push workflows were therefore suppressed, do not republish manually and do not create/reuse a tag. Use the supported `publish.yml` recovery path from current `main` only after confirming the package source still matches the release commit. The publisher will verify artifact integrity and any existing registry state before continuing.

## Repository protection

After this release flow is proven, protect `main` with a GitHub ruleset that requires pull requests and the normal CI checks. The release workflow already refuses package-source drift after a release, but branch protection makes the human review boundary enforceable for all repository changes as well.
