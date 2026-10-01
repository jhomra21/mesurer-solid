import { readFileSync } from "node:fs";

const externalSolidPattern = /(?:from\s*|import\s*\()["'](?:solid-js|@solidjs\/web)["']/;

const privatePackagePattern = /@jhomra21\/mesurer-solid-(?:core|dom|renderer)/;

const mediaBunnyImportPattern = /(?:from\s*|import\s*\()[\"']mediabunny[\"']/;

for (const name of ["index", "plugins", "inject", "inject-script"]) {
  const source = readFileSync(new URL(`../dist/${name}.js`, import.meta.url), "utf8");

  if (externalSolidPattern.test(source)) {
    throw new Error(`${name}.js must contain Mesurer's private renderer runtime instead of importing the host app's Solid version.`);
  }

  if (privatePackagePattern.test(source)) {
    throw new Error(`${name}.js contains a private Mesurer workspace package specifier.`);
  }

  if (name !== "inject-script" && !mediaBunnyImportPattern.test(source)) {
    throw new Error(`${name}.js must keep MediaBunny external instead of bundling MPL-covered code into Mesurer output.`);
  }

  console.log(`${name}.js keeps the private renderer bundled and MediaBunny on its separate package boundary.`);
}

const injectScriptSource = readFileSync(new URL("../dist/inject-script.js", import.meta.url), "utf8");

const mediaBunnyVendorSource = readFileSync(new URL("../dist/mediabunny-vendor.js", import.meta.url), "utf8");

const mediaBunnyLicenseSource = readFileSync(
  new URL("../../../node_modules/mediabunny/LICENSE", import.meta.url),
  "utf8",
);

if (!injectScriptSource.includes("__MESURER_MEDIABUNNY__")) {
  throw new Error("inject-script.js must consume the separate MediaBunny vendor global.");
}

if (!/Mozilla Public License(?: Version)? 2\.0/i.test(mediaBunnyLicenseSource)) {
  throw new Error("Installed MediaBunny dependency must retain its MPL-2.0 license file.");
}

if (!mediaBunnyVendorSource.includes("__MESURER_MEDIABUNNY__")) {
  throw new Error("mediabunny-vendor.js must expose the dedicated MediaBunny global.");
}

try {
  // A classic browser-evaluation payload must parse without ESM syntax or
  // top-level await. Construction does not execute DOM-dependent code.
  new Function(injectScriptSource);
} catch (error) {
  throw new Error(`inject-script.js must be directly executable as classic JavaScript: ${error}`);
}

console.log("inject-script.js parses as a transport-neutral classic script.");

try {
  new Function(mediaBunnyVendorSource);
} catch (error) {
  throw new Error(`mediabunny-vendor.js must be directly executable as classic JavaScript: ${error}`);
}

console.log("mediabunny-vendor.js parses independently; the installed MediaBunny package retains its MPL-2.0 license boundary.");

const coreSource = readFileSync(new URL("../dist/core.js", import.meta.url), "utf8");

if (externalSolidPattern.test(coreSource)) {
  throw new Error("core.js must remain framework-neutral and cannot import Solid.");
}

if (privatePackagePattern.test(coreSource)) {
  throw new Error("core.js contains a private Mesurer workspace package specifier.");
}

console.log("core.js is framework-neutral and self-contained.");