import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const privatePackagePattern = /@jhomra21\/mesurer-solid-(?:core|dom|renderer)/;
const removedDeliveryPattern = /\b(?:sendContext|toAcpContentBlocks|MesurerContextSender|MesurerContextDelivery|MesurerEvidenceProvider|MesurerEvidenceImage|MesurerAcpContentBlock|AcpTextContentBlock|AcpImageContentBlock)\b/;
const skillBinPath = "scripts/install-skill.mjs";

if (packageJson.name !== "@jhomra21/mesurer-solid") {
  throw new Error(`Expected internal workspace package name @jhomra21/mesurer-solid, got ${packageJson.name}.`);
}
if (packageJson.bin?.["mesurer-skill"] !== skillBinPath) {
  throw new Error(`Expected mesurer-skill bin path ${skillBinPath}, got ${packageJson.bin?.["mesurer-skill"] ?? "<missing>"}.`);
}
if (packageJson.private === true) throw new Error("The public Mesurer package workspace cannot be private.");
if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
  throw new Error("The public Mesurer beta must not publish runtime workspace dependencies.");
}
for (const requiredExport of [".", "./core", "./inject", "./inject-script"]) {
  if (!packageJson.exports?.[requiredExport]) throw new Error(`Missing public export: ${requiredExport}`);
}
if (packageJson.publishConfig?.access !== "public") throw new Error("publishConfig.access must be public.");
if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org/") {
  throw new Error("publishConfig.registry must be the public npm registry.");
}

const dist = new URL("../dist/", import.meta.url);
const distFiles = readdirSync(dist);
for (const file of distFiles) {
  if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
  const source = readFileSync(new URL(file, dist), "utf8");
  if (privatePackagePattern.test(source)) {
    throw new Error(`${file} leaks a private workspace package name into the published artifact.`);
  }
  if (removedDeliveryPattern.test(source)) {
    throw new Error(`${file} exposes a removed Mesurer agent-delivery API. Agents must read window.__MESURER__ directly.`);
  }
}

for (const file of ["index.js", "index.d.ts", "core.js", "core.d.ts", "inject.js", "inject.d.ts", "inject-script.js"]) {
  if (!distFiles.includes(file)) throw new Error(`Missing publish artifact: dist/${file}`);
}

const skillSource = new URL("../skills/mesurer-ui/SKILL.md", import.meta.url);
if (!existsSync(skillSource)) throw new Error("Missing packaged Agent Skill: skills/mesurer-ui/SKILL.md");

const stageScript = fileURLToPath(new URL("./stage-package.mjs", import.meta.url));
execFileSync(process.execPath, [stageScript], { stdio: "pipe" });
const stagedPackageJson = JSON.parse(readFileSync(new URL("../.publish/package.json", import.meta.url), "utf8"));
if (stagedPackageJson.name !== "mesurer-solid") {
  throw new Error(`Expected staged npm package name mesurer-solid, got ${stagedPackageJson.name}.`);
}
if (stagedPackageJson.bin?.["mesurer-skill"] !== skillBinPath) {
  throw new Error(`Expected staged mesurer-skill bin path ${skillBinPath}, got ${stagedPackageJson.bin?.["mesurer-skill"] ?? "<missing>"}.`);
}
for (const privateName of ["@jhomra21/mesurer-solid-core", "@jhomra21/mesurer-solid-dom", "@jhomra21/mesurer-solid-renderer"]) {
  if (JSON.stringify(stagedPackageJson).includes(privateName)) {
    throw new Error(`Staged package metadata leaked private package name: ${privateName}`);
  }
}

const installRoot = mkdtempSync(join(tmpdir(), "mesurer-skill-smoke-"));
try {
  execFileSync(process.execPath, [fileURLToPath(new URL("./install-skill.mjs", import.meta.url)), "install"], {
    cwd: installRoot,
    stdio: "pipe",
  });
  const installedSkill = join(installRoot, ".agents/skills/mesurer-ui/SKILL.md");
  const installedInjector = join(installRoot, ".agents/skills/mesurer-ui/assets/inject-script.js");
  if (!existsSync(installedSkill)) throw new Error("mesurer-skill install did not create SKILL.md.");
  if (!existsSync(installedInjector)) throw new Error("mesurer-skill install did not create assets/inject-script.js.");
  const sourceSkill = readFileSync(skillSource, "utf8");
  const copiedSkill = readFileSync(installedSkill, "utf8");
  if (copiedSkill !== sourceSkill) {
    throw new Error("Installed Agent Skill does not match the packaged canonical SKILL.md.");
  }
  const sourceInjector = readFileSync(new URL("../dist/inject-script.js", import.meta.url), "utf8");
  const copiedInjector = readFileSync(installedInjector, "utf8");
  if (!sourceInjector || copiedInjector !== sourceInjector) {
    throw new Error("Installed Agent Skill injector does not match the packaged inject-script artifact.");
  }
} finally {
  rmSync(installRoot, { recursive: true, force: true });
}

console.log(`mesurer-solid@${packageJson.version} staged direct-agent surface and Agent Skill installer are self-contained.`);
