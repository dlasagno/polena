#!/usr/bin/env bun

import { buildPackage, type BuildIo } from "@polena/build";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const examplesDir = join(repoRoot, "examples");

const io: BuildIo = {
  readTextFile: async (path) => Bun.file(path).text(),
  writeTextFile: async (path, contents) => {
    await Bun.write(path, contents);
  },
  readDir: async (path) => readdir(path),
  stat: async (path) => {
    try {
      const result = await stat(path);
      return result.isDirectory() ? "directory" : result.isFile() ? "file" : "missing";
    } catch {
      return "missing";
    }
  },
  mkdirp: async (path) => {
    await mkdir(path, { recursive: true });
  },
  which: async () => undefined,
  spawn: async () => 0,
};

const entries = (await readdir(examplesDir)).sort();
let built = 0;

for (const entry of entries) {
  const packageRoot = join(examplesDir, entry);
  if ((await io.stat(join(packageRoot, "polena.toml"))) !== "file") {
    continue;
  }

  console.log(`Building ${entry}...`);
  const result = await buildPackage({ packageRoot, noEmit: true, io });
  if (!result.ok) {
    console.error(`Failed to build ${entry}:`);
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.kind === "message") {
        console.error(diagnostic.message);
        continue;
      }
      console.error(`${diagnostic.path}: ${diagnostic.diagnostic.message}`);
    }
    process.exit(1);
  }

  built += 1;
}

console.log(`Built ${built} example package${built === 1 ? "" : "s"}.`);
