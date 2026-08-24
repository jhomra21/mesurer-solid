#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("-")) ?? "install";
const force = args.includes("--force");

if (command !== "install") {
  console.error("Usage: mesurer-skill install [--force]");
  process.exitCode = 1;
} else {
  const source = new URL("../skills/mesurer-ui/", import.meta.url);
  const injector = new URL("../dist/inject-script.js", import.meta.url);
  const destination = resolve(process.cwd(), ".agents/skills/mesurer-ui");
  const assets = resolve(destination, "assets");
  if (existsSync(destination) && !force) {
    console.error(`Mesurer skill already exists at ${destination}. Use --force to replace it.`);
    process.exitCode = 1;
  } else if (!existsSync(injector)) {
    console.error("Mesurer inject-script asset is missing. Reinstall mesurer-solid and retry.");
    process.exitCode = 1;
  } else {
    if (force) rmSync(destination, { recursive: true, force: true });
    mkdirSync(resolve(destination, ".."), { recursive: true });
    cpSync(source, destination, { recursive: true });
    mkdirSync(assets, { recursive: true });
    cpSync(injector, resolve(assets, "inject-script.js"));
    console.log(`Installed Mesurer Agent Skill and injector at ${destination}`);
  }
}
