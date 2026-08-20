import { readFileSync } from "node:fs";

const externalSolidPattern = /(?:from\s*|import\s*\()["'](?:solid-js|@solidjs\/web)["']/;
const privatePackagePattern = /@jhomra21\/mesurer-solid-(?:core|dom|renderer)/;

for (const name of ["index", "inject"]) {
  const source = readFileSync(new URL(`../dist/${name}.js`, import.meta.url), "utf8");
  if (externalSolidPattern.test(source)) {
    throw new Error(`${name}.js must contain Mesurer's private renderer runtime instead of importing the host app's Solid version.`);
  }
  if (privatePackagePattern.test(source)) {
    throw new Error(`${name}.js contains a private Mesurer workspace package specifier.`);
  }
  console.log(`${name}.js is self-contained with respect to renderer and private workspace imports.`);
}

const coreSource = readFileSync(new URL("../dist/core.js", import.meta.url), "utf8");
if (externalSolidPattern.test(coreSource)) {
  throw new Error("core.js must remain framework-neutral and cannot import Solid.");
}
if (privatePackagePattern.test(coreSource)) {
  throw new Error("core.js contains a private Mesurer workspace package specifier.");
}
console.log("core.js is framework-neutral and self-contained.");
