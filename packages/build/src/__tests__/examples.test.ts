import { describe, expect, test } from "bun:test";
import { buildPackage, type BuildIo } from "../index";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

describe("checked-in examples", () => {
  test("build all example packages", async () => {
    const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
    const examplesDir = join(repoRoot, "examples");
    const io = createNodeIo();
    const entries = (await readdir(examplesDir)).sort();
    const packages: string[] = [];

    for (const entry of entries) {
      const packageRoot = join(examplesDir, entry);
      if ((await io.stat(join(packageRoot, "polena.toml"))) !== "file") {
        continue;
      }
      packages.push(entry);
    }

    expect(packages.length).toBeGreaterThan(0);

    for (const entry of packages) {
      const result = await buildPackage({
        packageRoot: join(examplesDir, entry),
        noEmit: true,
        io,
      });
      expect(result.ok).toBe(true);
    }
  });
});

function createNodeIo(): BuildIo {
  return {
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
}
