import { describe, expect, test } from "bun:test";
import { isSupportedSourceFile, runCli } from "../index";
import type { CliIo } from "../cli";

describe("CLI source files", () => {
  test("accepts the standard .plna extension", () => {
    expect(isSupportedSourceFile("example.plna")).toBe(true);
  });

  test("keeps accepting the longer .polena extension", () => {
    expect(isSupportedSourceFile("example.polena")).toBe(true);
  });

  test("rejects unrelated extensions", () => {
    expect(isSupportedSourceFile("example.ts")).toBe(false);
  });
});

describe("CLI commands", () => {
  test("prints help", async () => {
    const harness = createCliHarness();
    const exitCode = await runCli({ args: ["help"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("\n")).toContain("Usage:");
    expect(harness.stdout.join("\n")).toContain("polena compile <package-dir> --out-dir <dir>");
  });

  test("prints version", async () => {
    const harness = createCliHarness();
    const exitCode = await runCli({ args: ["--version"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(["polena 0.1.0"]);
  });

  test("compiles a package to an output directory", async () => {
    const harness = createCliHarness(
      new Map([
        ["app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        ["app/src/index.plna", 'export fn main(): void { println("Hello"); }'],
      ]),
    );
    const exitCode = await runCli({
      args: ["compile", "app", "--out-dir", "dist"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.writes.get("dist/index.js")).toContain("main();");
  });

  test("rejects missing out dir", async () => {
    const harness = createCliHarness();
    const exitCode = await runCli({ args: ["compile", "app"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(1);
    expect(harness.stderr.join("\n")).toContain("error: expected --out-dir");
  });

  test("prints rich diagnostics for compiler errors", async () => {
    const harness = createCliHarness(
      new Map([
        ["app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        ["app/src/index.plna", "export fn main(): void { missing; }"],
      ]),
    );
    const exitCode = await runCli({
      args: ["compile", "app", "--out-dir", "dist"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stderr.join("\n")).toContain("error[PLN102]: Unknown name 'missing'.");
    expect(harness.stderr.join("\n")).toContain("--> app/src/index.plna:1:26");
    expect(harness.stderr.join("\n")).toContain("help: declare it before using it");
  });

  test("reports missing manifests", async () => {
    const harness = createCliHarness();
    const exitCode = await runCli({
      args: ["compile", "missing", "--out-dir", "dist"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stderr).toEqual(["error: package is missing 'missing/polena.toml'"]);
  });

  test("reports write failures after successful compilation", async () => {
    const harness = createCliHarness(
      new Map([
        ["app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        ["app/src/index.plna", "export fn main(): void {}"],
      ]),
      { failWrites: true },
    );
    const exitCode = await runCli({
      args: ["compile", "app", "--out-dir", "dist"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout).toHaveLength(0);
    expect(harness.stderr).toEqual(["error: could not write output: disk full"]);
    expect(harness.writes.size).toBe(0);
  });
});

function createCliHarness(
  files: ReadonlyMap<string, string> = new Map(),
  options: { readonly failWrites?: boolean } = {},
): {
  readonly io: CliIo;
  readonly stdout: string[];
  readonly stderr: string[];
  readonly writes: Map<string, string>;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writes = new Map<string, string>();

  return {
    io: {
      readTextFile: async (path) => {
        const source = files.get(path);
        if (source === undefined) {
          throw new Error("file not found");
        }
        return source;
      },
      writeTextFile: async (path, contents) => {
        if (options.failWrites === true) {
          throw new Error("disk full");
        }
        writes.set(path, contents);
      },
      readDir: async (path) => {
        const prefix = `${path.replace(/\/$/, "")}/`;
        const entries = new Set<string>();
        for (const file of files.keys()) {
          if (!file.startsWith(prefix)) {
            continue;
          }
          const rest = file.slice(prefix.length);
          const first = rest.split("/")[0];
          if (first !== undefined && first !== "") {
            entries.add(first);
          }
        }
        return [...entries].sort();
      },
      stat: async (path) => {
        if (files.has(path)) {
          return "file";
        }
        const prefix = `${path.replace(/\/$/, "")}/`;
        return [...files.keys()].some((file) => file.startsWith(prefix)) ? "directory" : "missing";
      },
      mkdirp: async () => {},
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
    writes,
  };
}
