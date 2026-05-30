import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  stdlibModuleSourcePaths,
  stdlibNonModuleSourcePaths,
  stdlibVirtualPath,
} from "../manifest";
import { stdlibSources } from "../index";

describe("stdlib manifest", () => {
  test("lists every standard-library module source file explicitly", async () => {
    const sourceRoot = resolve(import.meta.dir, "..");
    const actualSources = await listPolenaSources(sourceRoot);
    const expectedSources = [...stdlibModuleSourcePaths, ...stdlibNonModuleSourcePaths].sort();

    expect(actualSources).toEqual(expectedSources);
  });

  test("exposes bundled sources in manifest order with virtual std paths", () => {
    expect(stdlibSources.map((file) => file.path)).toEqual(
      stdlibModuleSourcePaths.map((path) => stdlibVirtualPath(path)),
    );
  });
});

async function listPolenaSources(root: string): Promise<readonly string[]> {
  const files: string[] = [];

  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && path.endsWith(".plna")) {
        files.push(relative(root, path).replaceAll("\\", "/"));
      }
    }
  }

  await visit(root);
  return files.sort();
}
