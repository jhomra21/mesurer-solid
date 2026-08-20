import { readdirSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const privatePackagePattern = /@jhomra21\/(?:mesurer-core|mesurer-dom|mesurer-renderer|mesurer-solid)/;

if (packageJson.private === true) throw new Error("The public @jhomra21/mesurer package cannot be private.");
if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
  throw new Error("The public Mesurer beta must not publish runtime workspace dependencies.");
}
for (const requiredExport of [".", "./core", "./inject"]) {
  if (!packageJson.exports?.[requiredExport]) throw new Error(`Missing public export: ${requiredExport}`);
}
if (packageJson.publishConfig?.access !== "public") throw new Error("publishConfig.access must be public.");
if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org/") {
  throw new Error("publishConfig.registry must be the public npm registry.");
}

const dist = new URL("../dist/", import.meta.url);
for (const file of readdirSync(dist)) {
  if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
  const source = readFileSync(new URL(file, dist), "utf8");
  if (privatePackagePattern.test(source)) {
    throw new Error(`${file} leaks a private workspace package name into the published artifact.`);
  }
}

for (const file of ["index.js", "index.d.ts", "core.js", "core.d.ts", "inject.js", "inject.d.ts"]) {
  if (!readdirSync(dist).includes(file)) throw new Error(`Missing publish artifact: dist/${file}`);
}

console.log(`@jhomra21/mesurer@${packageJson.version} publish surface is self-contained.`);
