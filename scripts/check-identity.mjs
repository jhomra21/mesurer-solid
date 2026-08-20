import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const ignored = new Set(["scripts/apply-identity-rename.mjs", ".github/workflows/rename-identity.yml"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".lock", ".md", ".mjs", ".py", ".ts", ".tsx", ".yaml", ".yml"]);
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const legacyWorkspace = "mesurer" + "-workspace";
const legacyRendererExample = "mesurer" + "-renderer-example";
const checks = [
  { label: "legacy npm identity", pattern: new RegExp("@jhomra21/" + "mesurer(?!-solid)", "g") },
  { label: "legacy repository identity", pattern: new RegExp("github\\.com/jhomra21/" + "mesurer(?!-solid)", "g") },
  { label: "legacy workspace name", pattern: new RegExp("\\b" + legacyWorkspace + "\\b", "g") },
  { label: "legacy renderer example name", pattern: new RegExp("\\b" + legacyRendererExample + "\\b", "g") },
  { label: "legacy package artifact name", pattern: new RegExp("\\bjhomra21-" + "mesurer-(?!solid-)", "g") },
];
const failures = [];
for (const path of files) {
  if (ignored.has(path)) continue;
  if (path !== "bun.lock" && !textExtensions.has(extname(path))) continue;
  const source = readFileSync(path, "utf8");
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(`${path}:${line}: ${check.label}: ${match[0]}`);
    }
  }
}
if (failures.length) {
  console.error("Mesurer Solid identity check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Mesurer Solid package/repository identity is consistent.");
