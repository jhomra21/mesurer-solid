import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const textExtensions = new Set([".css", ".html", ".js", ".json", ".lock", ".md", ".mjs", ".py", ".ts", ".tsx", ".yaml", ".yml"]);
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const legacyWorkspace = "mesurer" + "-workspace";
const legacyRendererExample = "mesurer" + "-renderer-example";
const checks = [
  { label: "legacy npm identity", pattern: new RegExp("@jhomra21/" + "mesurer(?!-solid)", "g") },
  { label: "legacy escaped npm identity", pattern: new RegExp("jhomra21\\\\/" + "mesurer(?!-solid)", "g") },
  { label: "legacy repository identity", pattern: new RegExp("github\\.com/jhomra21/" + "mesurer(?!-solid)", "g") },
  { label: "legacy workspace name", pattern: new RegExp("\\b" + legacyWorkspace + "\\b", "g") },
  { label: "legacy renderer example name", pattern: new RegExp("\\b" + legacyRendererExample + "\\b", "g") },
  { label: "legacy package artifact name", pattern: new RegExp("\\bjhomra21-" + "mesurer-(?!solid-)", "g") },
];
const canonicalMountPaths = new Set([
  "README.md",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "packages/mesurer/README.md",
  "packages/mesurer/AGENT_INTEGRATION.md",
  "docs/SCREENSHOTS.md",
  "docs/CONTEXT_WORKFLOW.md",
  "docs/HOST_ISOLATION.md",
  "examples/basic/src/main.tsx",
  "examples/basic/src/multi-spacing.ts",
  "examples/basic/src/plugin-settings.ts",
  "examples/basic/src/screenshot-contract.ts",
  "examples/basic/src/screenshot.ts",
  "examples/basic/src/self-hosting.ts",
  "visual-parity/solid-fixture.tsx",
]);

// These are the only places where the pre-0.1.2 spelling is intentional:
// published 0.1.1 compatibility aliases/tests, the changelog entry that names
// the migration, and the upstream React parity fixture/documentation.
const intentionalLegacyProductTokens = new Map([
  [".github/workflows/package-smoke.yml", new Set(["mountMeasurer", "MountMeasurerOptions", "MountedMeasurer"])],
  [".github/workflows/publish.yml", new Set(["mountMeasurer"])],
  ["CHANGELOG.md", new Set(["Measurer"])],
  ["docs/UPSTREAM_PARITY.md", new Set(["Measurer"])],
  ["packages/mesurer/scripts/check-package.mjs", new Set(["mountMeasurer", "MountMeasurerOptions", "MountedMeasurer"])],
  ["packages/mesurer/src/index.tsx", new Set(["mountMeasurer", "MountMeasurerOptions", "MountedMeasurer"])],
  ["visual-parity/react-fixture.tsx", new Set(["Measurer"])],
]);

const legacyPublicMountPattern = /\b(?:mountMeasurer|MountMeasurerOptions|MountedMeasurer|Measurer)\b/g;
const legacyProductSymbolPattern = /(?<!\\)\b[A-Za-z0-9_]*Measurer[A-Za-z0-9_]*\b/g;
const legacyUpperProductSymbolPattern = /(?<!\\)\b[A-Z0-9_]*MEASURER[A-Z0-9_]*\b/g;
const legacyLowerProductTokenPattern = /(?<!\\)\b[a-z0-9_-]*measurer[a-z0-9_-]*\b/g;
const failures = [];

const isIntentionalLegacyToken = (path, token) => intentionalLegacyProductTokens.get(path)?.has(token) === true;
const reportLegacyToken = (path, source, match, label) => {
  if (isIntentionalLegacyToken(path, match[0])) return;
  const line = source.slice(0, match.index).split("\n").length;
  failures.push(`${path}:${line}: ${label}: ${match[0]}`);
};

for (const path of files) {
  if (path.includes("Measurer") || path.includes("measurer")) {
    failures.push(`${path}: legacy Mesurer spelling in tracked path`);
  }
  if (path !== "bun.lock" && !textExtensions.has(extname(path))) continue;
  const source = readFileSync(path, "utf8");
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${path}:${line}: ${check.label}: ${match[0]}`);
    }
  }
  if (canonicalMountPaths.has(path)) {
    legacyPublicMountPattern.lastIndex = 0;
    for (const match of source.matchAll(legacyPublicMountPattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${path}:${line}: legacy public Mesurer API spelling: ${match[0]}`);
    }
  }
  if (path === "scripts/check-identity.mjs") continue;
  legacyProductSymbolPattern.lastIndex = 0;
  for (const match of source.matchAll(legacyProductSymbolPattern)) {
    reportLegacyToken(path, source, match, "legacy Mesurer product spelling");
  }
  legacyUpperProductSymbolPattern.lastIndex = 0;
  for (const match of source.matchAll(legacyUpperProductSymbolPattern)) {
    reportLegacyToken(path, source, match, "legacy uppercase Mesurer product spelling");
  }
  legacyLowerProductTokenPattern.lastIndex = 0;
  for (const match of source.matchAll(legacyLowerProductTokenPattern)) {
    reportLegacyToken(path, source, match, "legacy lowercase Mesurer product spelling");
  }
}
if (failures.length) {
  console.error("Mesurer Solid identity check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Mesurer Solid package/repository identity and canonical product/API spelling are consistent; only explicit 0.1.1 compatibility and upstream reference spellings remain.");
