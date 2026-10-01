#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const defaultPath = path.resolve(here, "../../packages/mesurer/dist/inject-script.js");

const sourcePath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultPath;

const vendorPath = path.join(path.dirname(sourcePath), "mediabunny-vendor.js");

try {
  const [vendor, injector] = await Promise.all([
    readFile(vendorPath, "utf8"),
    readFile(sourcePath, "utf8"),
  ]);

  process.stdout.write(`${vendor}\n${injector}`);
} catch {
  console.error(`Mesurer injector assets not found beside ${sourcePath}. Run \`bun run build\` first or pass a built inject-script.js path whose directory also contains mediabunny-vendor.js.`);
  process.exitCode = 1;
}
