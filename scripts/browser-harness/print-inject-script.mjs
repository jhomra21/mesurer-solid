#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(here, "../../packages/mesurer/dist/inject-script.js");
const sourcePath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultPath;

try {
  process.stdout.write(await readFile(sourcePath, "utf8"));
} catch {
  console.error(`Mesurer injection script not found at ${sourcePath}. Run \`bun run build\` first or pass a built inject-script.js path.`);
  process.exitCode = 1;
}
