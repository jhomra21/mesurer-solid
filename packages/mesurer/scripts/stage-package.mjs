import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const packageDir = new URL("../", import.meta.url);
const stageDir = new URL("../.publish/", import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL("package.json", packageDir), "utf8"));

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const path of [
  "dist",
  "README.md",
  "AGENT_INTEGRATION.md",
  "LICENSE",
  "THIRD_PARTY_LICENSES.md",
]) {
  cpSync(new URL(path, packageDir), new URL(path, stageDir), { recursive: true });
}

const published = {
  ...packageJson,
};
delete published.scripts;
delete published.devDependencies;
delete published.dependencies;

writeFileSync(
  new URL("package.json", stageDir),
  `${JSON.stringify(published, null, 2)}\n`,
  "utf8",
);

const serialized = JSON.stringify(published);
for (const privateName of [
  "@jhomra21/mesurer-solid-core",
  "@jhomra21/mesurer-solid-dom",
  "@jhomra21/mesurer-solid-renderer",
]) {
  if (serialized.includes(privateName)) {
    throw new Error(`Staged package metadata leaked private package name: ${privateName}`);
  }
}

console.log(`Staged ${published.name}@${published.version} in packages/mesurer/.publish`);
