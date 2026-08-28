import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const extensionDir = new URL("./", import.meta.url);
const distDir = new URL("./dist/", extensionDir);
const injectionSource = new URL("../packages/mesurer/dist/inject-script.js", extensionDir);

if (!existsSync(injectionSource)) {
  throw new Error("Missing packages/mesurer/dist/inject-script.js. Run the Mesurer package build before building the extension.");
}

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
for (const file of ["manifest.json", "background.js", "capture-bridge.js"]) {
  cpSync(new URL(file, extensionDir), new URL(file, distDir));
}
cpSync(injectionSource, new URL("mesurer-main.js", distDir));

console.log(`Built unpacked Chrome extension at ${fileURLToPath(distDir)}`);
