import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const privatePackagePattern = /@jhomra21\/mesurer-solid-(?:core|dom|renderer)/;

if (packageJson.private === true) throw new Error("The public @jhomra21/mesurer-solid package cannot be private.");
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
}

for (const file of ["index.js", "index.d.ts", "core.js", "core.d.ts", "inject.js", "inject.d.ts", "inject-script.js"]) {
  if (!distFiles.includes(file)) throw new Error(`Missing publish artifact: dist/${file}`);
}

const skillSource = new URL("../skills/mesurer-ui/SKILL.md", import.meta.url);
if (!existsSync(skillSource)) throw new Error("Missing packaged Agent Skill: skills/mesurer-ui/SKILL.md");

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
  const sourceInjector = readFileSync(new URL("../dist/inject-script.js", import.meta.url), "utf8");
  const copiedInjector = readFileSync(installedInjector, "utf8");
  if (!sourceInjector || copiedInjector !== sourceInjector) {
    throw new Error("Installed Agent Skill injector does not match the packaged inject-script artifact.");
  }
} finally {
  rmSync(installRoot, { recursive: true, force: true });
}

console.log(`@jhomra21/mesurer-solid@${packageJson.version} publish surface and Agent Skill installer are self-contained.`);
