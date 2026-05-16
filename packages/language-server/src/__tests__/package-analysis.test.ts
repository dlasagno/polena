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

    const indexDiagnostics = result?.diagnosticsByUri.get(
      pathToFileURL("/app/src/index.plna").href,
    );
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
          "import @/users.{greeting};\nexport fn main(): void { println(greeting()); }",
        ],
        ["/app/src/users.plna", "export const name = 1;"],
      ]),
    );

    const result = await analyzePackageForDocument({
      documentPath: "/app/src/index.plna",
      openDocuments: [
        {
          uri: pathToFileURL("/app/src/users.plna").href,
          path: "/app/src/users.plna",
          text: 'export fn greeting(): string { "Hello" }',
        },
      ],
      io,
    });

    expect(result?.diagnosticsByUri.get(pathToFileURL("/app/src/index.plna").href)).toEqual([]);
    expect(result?.diagnosticsByUri.get(pathToFileURL("/app/src/users.plna").href)).toEqual([]);
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
          uri: pathToFileURL("/app/polena.toml").href,
          path: "/app/polena.toml",
          text: 'name = "app"\nversion = "0.1.0"\ntarget = "invalid"\n',
        },
      ],
      io,
    });

    const diagnostics = result?.diagnosticsByUri.get(pathToFileURL("/app/polena.toml").href);
    expect(diagnostics?.map((diagnostic) => diagnostic.message)).toContain(
      "Invalid package target 'invalid'.",
    );
  });
});

function createIo(files: ReadonlyMap<string, string>): LanguageServerIo {
  const normalizedFiles = new Map(
    [...files.entries()].map(([path, source]) => [normalize(path), source]),
  );

  return {
    readTextFile: async (path) => {
      const source = normalizedFiles.get(normalize(path));
      if (source === undefined) {
        throw new Error(`missing file: ${path}`);
      }
      return source;
    },
    readDir: async (path) => {
      const dir = normalize(path);
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
      const normalizedPath = normalize(path);
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
