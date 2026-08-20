import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
const externalSolid = /(?:from\s*|import\s*\()["'](?:solid-js|@solidjs\/web)["']/.test(source);
if (externalSolid) {
  throw new Error("Universal Mesurer bundle must contain its private Solid runtime instead of importing the host app's Solid version.");
}
console.log("Universal bundle is self-contained with respect to Solid runtime imports.");
