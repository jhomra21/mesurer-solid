#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const check = process.argv.includes("--check");

const packageRoot = new URL("../packages/mesurer/", import.meta.url);

const pluginScripts = new URL("../plugins/mesurer-codex/scripts/", import.meta.url);

const files = ["codex-bridge.mjs", "codex-connect.mjs", "codex-lifecycle.mjs"];

mkdirSync(pluginScripts, { recursive: true });

let stale = false;

for (const file of files) {
  const source = new URL(`codex/${file}`, packageRoot);
  const target = new URL(file, pluginScripts);

  if (check) {
    let current = "";

    try {
      current = readFileSync(target, "utf8");
    } catch {}

    const canonical = readFileSync(source, "utf8");

    if (current !== canonical) {
      console.error(`Generated Codex plugin script is stale: plugins/mesurer-codex/scripts/${file}`);
      stale = true;
    }

    continue;
  }

  copyFileSync(source, target);
  console.log(`Synced plugins/mesurer-codex/scripts/${file}`);
}

if (stale) {
  console.error("Run `bun run sync:codex-plugin` and commit the generated distribution files.");
  process.exitCode = 1;
}
