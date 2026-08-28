import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  nextVersion,
  parseVersion,
  releaseNotes,
  updateChangelog,
  updatePackageVersion,
} from "./release.mjs";

test("orders prereleases before their stable version", () => {
  assert.equal(compareVersions("0.1.0-beta.2", "0.1.0"), -1);
  assert.equal(compareVersions("0.1.0-beta.3", "0.1.0-beta.2"), 1);
  assert.equal(compareVersions("0.1.0-beta.11", "0.1.0-beta.2"), 1);
  assert.equal(compareVersions("0.1.0-beta.9007199254740993", "0.1.0-beta.9007199254740992"), 1);
  assert.equal(compareVersions("0.1.0-beta", "0.1.0-rc"), -1);
  assert.equal(compareVersions("0.1.0-1", "0.1.0-beta"), -1);
});

test("enforces strict release SemVer prerelease identifiers", () => {
  assert.deepEqual(parseVersion("1.2.3-rc.0").prerelease, ["rc", "0"]);
  assert.throws(() => parseVersion("1.2.3-rc.01"));
  assert.throws(() => parseVersion("01.2.3"));
  assert.throws(() => parseVersion("1.2.3+build.1"));
});

test("computes release versions", () => {
  assert.equal(nextVersion("0.1.0-beta.2", "beta-next"), "0.1.0-beta.3");
  assert.equal(nextVersion("0.1.0-beta.2", "promote-stable"), "0.1.0");
  assert.equal(nextVersion("0.1.0", "beta-next"), "0.1.1-beta.0");
  assert.equal(nextVersion("0.1.0", "patch"), "0.1.1");
  assert.equal(nextVersion("0.1.0", "minor"), "0.2.0");
  assert.equal(nextVersion("0.1.0", "major"), "1.0.0");
  assert.equal(nextVersion("0.1.0-beta.2", "explicit", "0.1.0-rc.0"), "0.1.0-rc.0");
});

test("rejects backwards and ambiguous releases", () => {
  assert.throws(() => nextVersion("0.1.0-beta.2", "patch"));
  assert.throws(() => nextVersion("0.1.0", "explicit", "0.0.9"));
});

test("updates only the package version and preserves manifest formatting", () => {
  const input = `{
  "name": "@jhomra21/mesurer-solid",
  "version": "0.1.0-beta.2",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./core": { "types": "./dist/core.d.ts", "import": "./dist/core.js" }
  }
}
`;
  const expected = input.replace('"version": "0.1.0-beta.2"', '"version": "0.1.0-beta.3"');
  assert.equal(updatePackageVersion(input, "0.1.0-beta.2", "0.1.0-beta.3"), expected);
  assert.throws(() => updatePackageVersion(input, "0.1.0-beta.1", "0.1.0-beta.3"));
});

test("moves Unreleased entries into a versioned section", () => {
  const input = `# Changelog\n\n## Unreleased\n\n<!-- Add user-facing changes here before preparing a release. -->\n\n- Added release automation.\n\n## 0.1.0-beta.2 - 2026-08-20\n\n- Previous.\n`;
  const output = updateChangelog(input, "0.1.0-beta.3", "2026-08-21");
  const expected = `# Changelog\n\n## Unreleased\n\n<!-- Add user-facing changes here before preparing a release. -->\n\n## 0.1.0-beta.3 - 2026-08-21\n\n- Added release automation.\n\n## 0.1.0-beta.2 - 2026-08-20\n\n- Previous.\n`;
  assert.equal(output, expected);
  assert.equal(releaseNotes(output, "0.1.0-beta.3"), "- Added release automation.");
});

test("promotes the prerelease train notes into the stable release", () => {
  const input = `# Changelog\n\n## Unreleased\n\n<!-- Add user-facing changes here before preparing a release. -->\n\n## 0.1.1-beta.1 - 2026-08-28\n\n- No user-facing changes.\n\n## 0.1.1-beta.0 - 2026-08-28\n\n- Add screenshot capture.\n\n## 0.1.0 - 2026-08-28\n\n- Previous stable.\n`;
  const output = updateChangelog(input, "0.1.1", "2026-08-29", {
    includePrereleaseNotes: true,
  });
  assert.equal(releaseNotes(output, "0.1.1"), "- Add screenshot capture.");
  assert.equal(releaseNotes(output, "0.1.1-beta.1"), "- No user-facing changes.");
  assert.equal(releaseNotes(output, "0.1.1-beta.0"), "- Add screenshot capture.");
});

test("combines new Unreleased notes with prerelease train notes on stable promotion", () => {
  const input = `# Changelog\n\n## Unreleased\n\n<!-- Add user-facing changes here before preparing a release. -->\n\n- Polish screenshot docs.\n\n## 0.1.1-rc.0 - 2026-08-29\n\n- Add release hardening.\n\n## 0.1.1-beta.0 - 2026-08-28\n\n- Add screenshot capture.\n\n## 0.1.0 - 2026-08-28\n\n- Previous stable.\n`;
  const output = updateChangelog(input, "0.1.1", "2026-08-30", {
    includePrereleaseNotes: true,
  });
  assert.equal(
    releaseNotes(output, "0.1.1"),
    "- Polish screenshot docs.\n- Add release hardening.\n- Add screenshot capture.",
  );
});

test("does not duplicate an exact Unreleased note block during stable promotion", () => {
  const input = `# Changelog\n\n## Unreleased\n\n- Add screenshot capture.\n\n## 0.1.1-beta.0 - 2026-08-28\n\n- Add screenshot capture.\n`;
  const output = updateChangelog(input, "0.1.1", "2026-08-29", {
    includePrereleaseNotes: true,
  });
  assert.equal(releaseNotes(output, "0.1.1"), "- Add screenshot capture.");
});

test("release notes require an exact version heading", () => {
  const content = `# Changelog\n\n## 0.1.0-beta.3 - 2026-08-21\n\n- Beta only.\n`;
  assert.equal(releaseNotes(content, "0.1.0-beta.3"), "- Beta only.");
  assert.throws(() => releaseNotes(content, "0.1.0"));
});

test("uses explicit no-user-facing-changes notes when Unreleased is empty", () => {
  const output = updateChangelog(
    `# Changelog\n\n## Unreleased\n\n<!-- Add user-facing changes here before preparing a release. -->\n`,
    "0.1.0-beta.3",
    "2026-08-21",
  );
  assert.equal(releaseNotes(output, "0.1.0-beta.3"), "- No user-facing changes.");
});