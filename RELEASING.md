# Releasing Mesurer Solid

Mesurer Solid uses a release PR as the human approval boundary and npm Trusted Publishing/OIDC as the only normal publishing path.

## Normal development

Add user-facing release notes under `## Unreleased` in `CHANGELOG.md` as changes land. Internal-only work may omit a note; an empty release is recorded as `No user-facing changes.`

Do not manually edit the public package version, create release tags, or run `npm publish` for normal releases.

## Prepare a release

From GitHub Actions, run **prepare-release** from `main` and choose one version strategy:

- `beta-next`: `0.1.0-beta.2` -> `0.1.0-beta.3`; from a stable version such as `0.1.0`, starts `0.1.1-beta.0`.
- `promote-stable`: `0.1.0-beta.3` -> `0.1.0`.
- `patch`, `minor`, `major`: stable-version SemVer bumps.
- `explicit`: an exact supported SemVer version for exceptional cases such as an RC.

The workflow updates `packages/mesurer/package.json`, moves `Unreleased` changelog entries into the new version section, creates `release/v<version>`, and opens a `release: v<version>` PR.

Only one release PR may be open at a time. GitHub can suppress or gate normal workflow recursion for PRs created by `GITHUB_TOKEN`, so `prepare-release` explicitly dispatches `ci` and `package-smoke` against the generated release branch after opening the PR. No PAT is required.

If GitHub Actions is not allowed to create pull requests in the repository settings, PR creation fails closed and the workflow removes the remote release branch so it can be retried after the setting is enabled.

## Review the release PR

Review the version and changelog like any other code change. Merge only after `ci` and `package-smoke` are green.

`package-smoke` packs the sanitized npm candidate and exercises that exact tarball in clean TypeScript, React 19, Solid 1, and compiled Solid 2 consumers. The tarball and its `npm pack --json` metadata are uploaded as the `npm-package` workflow artifact.

## Automatic publish after merge

`publish.yml` listens for merged pull requests into `main`, but only activates publication when the merged head branch is exactly `release/v<package-version>`. An ordinary PR, a direct version edit, or a closed-but-unmerged release PR does not publish.

For an approved release, the workflow:

1. Verifies the release branch name matches the package version, the new version is greater than the pre-release base version, and `CHANGELOG.md` has the matching version section.
2. Runs the reusable packed-package smoke workflow again on the merged release commit.
3. Downloads the exact tarball that passed the smoke tests.
4. Verifies that the artifact is `@jhomra21/mesurer-solid` at the detected release version.
5. If the npm version does not exist, publishes that exact `.tgz` through Trusted Publishing/OIDC.
6. If the npm version already exists, verifies its registry integrity matches the tarball and continues recovery instead of republishing.
7. Verifies the expected npm dist-tag (`beta` for prereleases, `latest` for stable releases).
8. Creates `v<version>` only after npm succeeds, and refuses an existing tag that points at another commit.
9. Creates the GitHub Release from the matching changelog section; prerelease versions are marked as prereleases.

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

`publish.yml` also supports `workflow_dispatch` for recovery of the version currently on `main`. Manual recovery is rejected from any other ref. It verifies the already-published npm integrity before doing any post-publish work.

Never reuse or overwrite an npm version. If the existing registry integrity differs from the candidate, the workflow fails closed.

## Repository protection

After this release flow is proven, protect `main` with a GitHub ruleset that requires pull requests and the normal CI checks. The release workflow already refuses ordinary merged PRs as release triggers, but branch protection makes the human review boundary enforceable for all repository changes as well.
