import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const extensionDir = new URL("./", import.meta.url);

const distDir = new URL("./dist/", extensionDir);

const injectionSource = new URL("../packages/mesurer/dist/inject-script.js", extensionDir);

const mediaBunnyVendor = new URL("../packages/mesurer/dist/mediabunny-vendor.js", extensionDir);

if (!existsSync(injectionSource) || !existsSync(mediaBunnyVendor)) {
  throw new Error("Missing Mesurer injector assets. Run the Mesurer package build before building the extension.");
}

rmSync(distDir, { recursive: true, force: true });

mkdirSync(distDir, { recursive: true });

for (const file of ["manifest.json", "background.js", "active-tabs.js", "capture-bridge.js"]) {
  cpSync(new URL(file, extensionDir), new URL(file, distDir));
}

cpSync(mediaBunnyVendor, new URL("mediabunny-vendor.js", distDir));

cpSync(injectionSource, new URL("mesurer-main.js", distDir));

console.log(`Built unpacked Chrome extension at ${fileURLToPath(distDir)}`);
