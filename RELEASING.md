# Releasing Mesurer Solid

Mesurer Solid uses a release PR as the human approval boundary and npm Trusted Publishing/OIDC as the only normal publishing path.

## Normal development

Add user-facing release notes under `## Unreleased` in `CHANGELOG.md` as changes land. Internal-only work may omit a note; an empty release is recorded as `No user-facing changes.`

Do not manually edit the public package version, create release tags, or run `npm publish` for normal releases.

## Prepare a release

From GitHub Actions, run **prepare-release** and choose one version strategy:

- `beta-next`: `0.1.0-beta.2` -> `0.1.0-beta.3`; from a stable version such as `0.1.0`, starts `0.1.1-beta.0`.
- `promote-stable`: `0.1.0-beta.3` -> `0.1.0`.
- `patch`, `minor`, `major`: stable-version SemVer bumps.
- `explicit`: an exact SemVer version for exceptional cases such as an RC.

The workflow updates `packages/mesurer/package.json`, moves `Unreleased` changelog entries into the new version section, creates `release/v<version>`, and opens a `release: v<version>` PR.

Only one release PR may be open at a time. Because GitHub suppresses normal workflow recursion for branches/PRs created by `GITHUB_TOKEN`, `prepare-release` explicitly dispatches `ci` and `package-smoke` against the generated release branch after opening the PR. No PAT is required.

## Review the release PR

Review the version and changelog like any other code change. Merge only after normal CI and `package-smoke` are green.

`package-smoke` packs the sanitized npm candidate and exercises that exact tarball in clean TypeScript, React 19, Solid 1, and compiled Solid 2 consumers. The tarball and its `npm pack --json` metadata are uploaded as the `npm-package` workflow artifact.

## Automatic publish after merge

A version change on `main` activates `publish.yml`. A package manifest change without a version change is a no-op.

For a real release, the workflow:

1. Verifies the new version is greater than the previous version and has a matching changelog section.
2. Runs the reusable packed-package smoke workflow again on the merge commit.
3. Downloads the exact tarball that passed the smoke tests.
4. If the npm version does not exist, publishes that exact `.tgz` through Trusted Publishing/OIDC.
5. If the npm version already exists, verifies its registry integrity matches the tarball and continues recovery instead of republishing.
6. Verifies the expected npm dist-tag (`beta` for prereleases, `latest` for stable releases).
7. Creates `v<version>` only after npm succeeds, and refuses an existing tag that points at another commit.
8. Creates the GitHub Release from the matching changelog section; prerelease versions are marked as prereleases.

The npm publishing job is serialized with `cancel-in-progress: false`, so release jobs cannot race each other.

## Recovery

If npm publication succeeds but a later tag/GitHub Release step fails, first rerun the failed GitHub Actions job/run. That preserves the original release commit and is the safest recovery path.

`publish.yml` also supports `workflow_dispatch` for recovery of the version currently represented by the selected ref. It verifies the already-published npm integrity before doing any post-publish work. Do not use a newer source tree to recover an older npm version; the integrity/tag checks intentionally fail closed in that situation.

Never reuse or overwrite an npm version. If the existing registry integrity differs from the candidate, the workflow fails closed.

## Authentication and security

The npm package is configured to disallow token publishing. `.github/workflows/publish.yml` is the npm Trusted Publisher and receives only a short-lived GitHub OIDC credential. No `NPM_TOKEN` should be added to repository secrets or the workflow.
