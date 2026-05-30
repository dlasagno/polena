import { describe, expect, test } from "bun:test";
import { normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzePackageForDocument, type LanguageServerIo } from "../package-analysis";

describe("LSP package analysis", () => {
  test("reports current-package import diagnostics for the importing file", async () => {
    const io = createIo(
      new Map([
        ["/app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        ["/app/src/index.plna", "import @/users.{greeting};\nexport fn main(): void {}"],
        ["/app/src/users.plna", "export const name = 1;"],
      ]),
    );

    const result = await analyzePackageForDocument({
      documentPath: "/app/src/index.plna",
      openDocuments: [],
      io,
    });

    const indexDiagnostics = result?.diagnosticsByUri.get(testUri("/app/src/index.plna"));
    expect(indexDiagnostics?.map((diagnostic) => diagnostic.message)).toContain(
      "Module '@/users' does not export value 'greeting'.",
    );
  });

  test("overlays open documents before analyzing package diagnostics", async () => {
    const io = createIo(
      new Map([
        ["/app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        [
          "/app/src/index.plna",
          "import @/users.{greeting};\nexport fn main(): void { const message = greeting(); }",
        ],
        ["/app/src/users.plna", "export const name = 1;"],
      ]),
    );

    const result = await analyzePackageForDocument({
      documentPath: "/app/src/index.plna",
      openDocuments: [
        {
          uri: testUri("/app/src/users.plna"),
          path: "/app/src/users.plna",
          text: 'export fn greeting(): string { "Hello" }',
        },
      ],
      io,
    });

    expect(result?.diagnosticsByUri.get(testUri("/app/src/index.plna"))).toEqual([]);
    expect(result?.diagnosticsByUri.get(testUri("/app/src/users.plna"))).toEqual([]);
  });

  test("overlays open package manifests before analyzing diagnostics", async () => {
    const io = createIo(
      new Map([
        ["/app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        ["/app/src/index.plna", "export fn main(): void {}"],
      ]),
    );

    const result = await analyzePackageForDocument({
      documentPath: "/app/polena.toml",
      openDocuments: [
        {
          uri: testUri("/app/polena.toml"),
          path: "/app/polena.toml",
          text: 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\nruntime = "invalid"\n',
        },
      ],
      io,
    });

    const diagnostics = result?.diagnosticsByUri.get(testUri("/app/polena.toml"));
    expect(diagnostics?.map((diagnostic) => diagnostic.message)).toContain(
      "Invalid package runtime 'invalid'.",
    );
  });

  test("includes source files created on disk after earlier analysis", async () => {
    const io = createIo(
      new Map([
        ["/app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        [
          "/app/src/index.plna",
          "import @/users.{greeting};\nexport fn main(): void { const message = greeting(); }",
        ],
        ["/app/src/users.plna", 'export fn greeting(): string { "Hello" }'],
      ]),
    );

    const result = await analyzePackageForDocument({
      documentPath: "/app/src/index.plna",
      openDocuments: [],
      io,
    });

    expect(result?.diagnosticsByUri.get(testUri("/app/src/index.plna"))).toEqual([]);
    expect(result?.diagnosticsByUri.has(testUri("/app/src/users.plna"))).toBe(true);
    expect(result?.analysesByUri.has(testUri("/app/src/users.plna"))).toBe(true);
  });

  test("drops diagnostics and analyses for source files deleted from disk", async () => {
    const io = createIo(
      new Map([
        ["/app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        [
          "/app/src/index.plna",
          "import @/users.{greeting};\nexport fn main(): void { const message = greeting(); }",
        ],
      ]),
    );

    const result = await analyzePackageForDocument({
      documentPath: "/app/src/index.plna",
      openDocuments: [],
      io,
    });

    expect(result?.diagnosticsByUri.has(testUri("/app/src/users.plna"))).toBe(false);
    expect(result?.analysesByUri.has(testUri("/app/src/users.plna"))).toBe(false);
    expect(
      result?.diagnosticsByUri
        .get(testUri("/app/src/index.plna"))
        ?.map((diagnostic) => diagnostic.message),
    ).toContain("Missing module '@/users'.");
  });
});

function createIo(files: ReadonlyMap<string, string>): LanguageServerIo {
  const normalizedFiles = new Map(
    [...files.entries()].map(([path, source]) => [testPath(path), source]),
  );

  return {
    readTextFile: async (path) => {
      const source = normalizedFiles.get(testPath(path));
      if (source === undefined) {
        throw new Error(`missing file: ${path}`);
      }
      return source;
    },
    readDir: async (path) => {
      const dir = testPath(path);
      const prefix = `${dir}/`;
      const entries = new Set<string>();
      for (const filePath of normalizedFiles.keys()) {
        if (filePath.startsWith(prefix)) {
          entries.add(filePath.slice(prefix.length).split("/")[0] ?? "");
        }
      }
      return [...entries].filter((entry) => entry.length > 0).sort();
    },
    stat: async (path) => {
      const normalizedPath = testPath(path);
      if (normalizedFiles.has(normalizedPath)) {
        return "file";
      }
      const prefix = `${normalizedPath}/`;
      for (const filePath of normalizedFiles.keys()) {
        if (filePath.startsWith(prefix)) {
          return "directory";
        }
      }
      return "missing";
    },
  };
}

function testPath(path: string): string {
  return normalize(path).replaceAll("\\", "/");
}

function testUri(path: string): string {
  return pathToFileURL(normalize(path)).href;
}
