import { readFileSync } from "node:fs";

const externalSolidPattern = /(?:from\s*|import\s*\()["'](?:solid-js|@solidjs\/web)["']/;

for (const name of ["index", "inject"]) {
  const source = readFileSync(new URL(`../dist/${name}.js`, import.meta.url), "utf8");
  if (externalSolidPattern.test(source)) {
    throw new Error(`${name}.js must contain Mesurer's private Solid runtime instead of importing the host app's Solid version.`);
  }
  console.log(`${name}.js is self-contained with respect to Solid runtime imports.`);
}
