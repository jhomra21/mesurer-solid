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
const rendererCompatibilityPaths = new Set([
  "packages/renderer/src/Measurer.tsx",
  "packages/renderer/src/ComposableMeasurer.tsx",
  "packages/renderer/src/components/MeasurerOverlay.tsx",
  "packages/renderer/src/model/create-measurer-model.ts",
]);
const legacyPublicMountPattern = /\b(?:mountMeasurer|MountMeasurerOptions|MountedMeasurer|Measurer)\b/g;
const legacyRendererSymbolPattern = /\b[A-Za-z0-9_]*Measurer[A-Za-z0-9_]*\b/g;
const failures = [];
for (const path of files) {
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
  if (path.startsWith("packages/renderer/src/") && !rendererCompatibilityPaths.has(path)) {
    legacyRendererSymbolPattern.lastIndex = 0;
    for (const match of source.matchAll(legacyRendererSymbolPattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${path}:${line}: legacy internal Mesurer symbol spelling: ${match[0]}`);
    }
  }
}
if (failures.length) {
  console.error("Mesurer Solid identity check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Mesurer Solid package/repository identity and canonical public/internal API spelling are consistent.");
