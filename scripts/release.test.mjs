import assert from "node:assert/strict";
import test from "node:test";
import { compareVersions, nextVersion, releaseNotes, updateChangelog } from "./release.mjs";

test("orders prereleases before their stable version", () => {
  assert.equal(compareVersions("0.1.0-beta.2", "0.1.0"), -1);
  assert.equal(compareVersions("0.1.0-beta.3", "0.1.0-beta.2"), 1);
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

test("moves Unreleased entries into a versioned section", () => {
  const input = `# Changelog\n\n## Unreleased\n\n<!-- Add user-facing changes here before preparing a release. -->\n\n- Added release automation.\n\n## 0.1.0-beta.2 - 2026-08-20\n\n- Previous.\n`;
  const output = updateChangelog(input, "0.1.0-beta.3", "2026-08-21");
  assert.match(output, /## Unreleased\n\n<!-- Add user-facing changes here before preparing a release\. -->/);
  assert.match(output, /## 0\.1\.0-beta\.3 - 2026-08-21\n\n- Added release automation\./);
  assert.equal(releaseNotes(output, "0.1.0-beta.3"), "- Added release automation.");
});

test("uses explicit no-user-facing-changes notes when Unreleased is empty", () => {
  const output = updateChangelog(
    `# Changelog\n\n## Unreleased\n\n<!-- Add user-facing changes here before preparing a release. -->\n`,
    "0.1.0-beta.3",
    "2026-08-21",
  );
  assert.equal(releaseNotes(output, "0.1.0-beta.3"), "- No user-facing changes.");
});
