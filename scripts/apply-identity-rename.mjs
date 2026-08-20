import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".lock", ".md", ".mjs", ".py", ".ts", ".tsx", ".yaml", ".yml",
]);
const exactTextFiles = new Set(["bun.lock"]);

const replaceIdentity = (source) => source
  .replace(/@jhomra21\/mesurer(?!-solid)/g, "@jhomra21/mesurer-solid")
  .replace(/https:\/\/github\.com\/jhomra21\/mesurer(?!-solid)/g, "https://github.com/jhomra21/mesurer-solid")
  .replace(/\bmesurer-workspace\b/g, "mesurer-solid-workspace")
  .replace(/\bmesurer-renderer-example\b/g, "mesurer-solid-renderer-example")
  .replace(/\bjhomra21-mesurer-(?!solid-)/g, "jhomra21-mesurer-solid-")
  .replace(/\bhope-ui-mesurer-3x\b/g, "hope-ui-mesurer-solid-3x");

for (const path of trackedFiles) {
  if (!exactTextFiles.has(path) && !textExtensions.has(extname(path))) continue;
  const before = readFileSync(path, "utf8");
  let after = replaceIdentity(before);

  if (path === "README.md") {
    after = after
      .replace(/^# Mesurer$/m, "# Mesurer Solid")
      .replace(
        "Framework-agnostic UI measurement and inspection tools for browser applications and coding agents.",
        "Solid-powered, framework-agnostic UI measurement and inspection tools for browser applications and coding agents.",
      )
      .replace(
        "Mesurer keeps the parity-proven UI renderer implemented in Solid 2",
        "Mesurer Solid keeps the parity-proven UI renderer implemented in Solid 2",
      );
  }

  if (path === "AGENTS.md") {
    after = after
      .replace(/^# Mesurer agent integration$/m, "# Mesurer Solid agent integration")
      .replace(
        "Mesurer is designed to be attached by coding agents",
        "Mesurer Solid is designed to be attached by coding agents",
      );
  }

  if (path === "ARCHITECTURE.md") {
    after = after.replace(
      "Mesurer is organized as private implementation workspaces",
      "Mesurer Solid is organized as private implementation workspaces",
    );
  }

  if (path === "packages/renderer/README.md") {
    after = after.replace(/^# Mesurer renderer \(internal\)$/m, "# Mesurer Solid renderer (internal)");
  }

  if (path === "packages/mesurer/scripts/check-bundle.mjs" || path === "packages/mesurer/scripts/check-package.mjs") {
    after = after.replace(
      /^const privatePackagePattern = .*;$/m,
      "const privatePackagePattern = /@jhomra21\\/mesurer-solid-(?:core|dom|renderer)/;",
    );
  }

  if (path === "packages/mesurer/scripts/stage-package.mjs") {
    after = after.replace(/\n  "@jhomra21\/mesurer-solid",(?=\n\])/g, "");
  }

  if (after !== before) writeFileSync(path, after, "utf8");
}

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
rootPackage.scripts["check:identity"] = "node scripts/check-identity.mjs";
if (!rootPackage.scripts.test.startsWith("bun run check:identity && ")) {
  rootPackage.scripts.test = `bun run check:identity && ${rootPackage.scripts.test}`;
}
writeFileSync("package.json", `${JSON.stringify(rootPackage, null, 2)}\n`, "utf8");

const identityCheck = `import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const ignored = new Set(["scripts/apply-identity-rename.mjs", ".github/workflows/rename-identity.yml"]);
const textExtensions = new Set([".css", ".html", ".js", ".json", ".lock", ".md", ".mjs", ".py", ".ts", ".tsx", ".yaml", ".yml"]);
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\\n").filter(Boolean);
const legacyWorkspace = "mesurer" + "-workspace";
const legacyRendererExample = "mesurer" + "-renderer-example";
const checks = [
  { label: "legacy npm identity", pattern: new RegExp("@jhomra21/" + "mesurer(?!-solid)", "g") },
  { label: "legacy repository identity", pattern: new RegExp("github\\\\.com/jhomra21/" + "mesurer(?!-solid)", "g") },
  { label: "legacy workspace name", pattern: new RegExp("\\\\b" + legacyWorkspace + "\\\\b", "g") },
  { label: "legacy renderer example name", pattern: new RegExp("\\\\b" + legacyRendererExample + "\\\\b", "g") },
  { label: "legacy package artifact name", pattern: new RegExp("\\\\bjhomra21-" + "mesurer-(?!solid-)", "g") },
];
const failures = [];
for (const path of files) {
  if (ignored.has(path)) continue;
  if (path !== "bun.lock" && !textExtensions.has(extname(path))) continue;
  const source = readFileSync(path, "utf8");
  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of source.matchAll(check.pattern)) {
      const line = source.slice(0, match.index).split("\\n").length;
      failures.push(\`\${path}:\${line}: \${check.label}: \${match[0]}\`);
    }
  }
}
if (failures.length) {
  console.error("Mesurer Solid identity check failed:\\n" + failures.map((failure) => \`- \${failure}\`).join("\\n"));
  process.exit(1);
}
console.log("Mesurer Solid package/repository identity is consistent.");
`;
writeFileSync("scripts/check-identity.mjs", identityCheck, "utf8");

console.log("Applied Mesurer Solid identity migration to tracked source files.");
