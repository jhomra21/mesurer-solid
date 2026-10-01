import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mediaBunnyEntry = fileURLToPath(import.meta.resolve("mediabunny"));

let directory = dirname(mediaBunnyEntry);

let packageRoot = null;

for (let depth = 0; depth < 8; depth += 1) {
  const packageJsonPath = join(directory, "package.json");

  if (existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    if (packageJson.name === "mediabunny") {
      packageRoot = directory;
      break;
    }
  }

  const parent = dirname(directory);

  if (parent === directory) break;
  directory = parent;
}

if (!packageRoot) {
  throw new Error(`Could not locate MediaBunny package root from ${mediaBunnyEntry}.`);
}

const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

if (packageJson.version !== "1.59.0" || packageJson.license !== "MPL-2.0") {
  throw new Error(
    `Expected mediabunny@1.59.0 under MPL-2.0, got ${packageJson.version ?? "<missing>"} / ${packageJson.license ?? "<missing>"}.`,
  );
}

const licensePath = join(packageRoot, "LICENSE");

if (!existsSync(licensePath)) throw new Error("Installed MediaBunny package is missing LICENSE.");

const license = readFileSync(licensePath, "utf8");

if (!/Mozilla Public License(?: Version)? 2\.0/i.test(license)) {
  throw new Error("Installed MediaBunny LICENSE is not MPL-2.0.");
}

writeFileSync(
  new URL("../dist/mediabunny-LICENSE.txt", import.meta.url),
  license,
  "utf8",
);

console.log("Copied MediaBunny MPL-2.0 license beside the vendor bundle.");
