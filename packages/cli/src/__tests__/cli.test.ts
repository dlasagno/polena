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
    expect(harness.stdout.join("\n")).toContain("polena compile <file> [options]");
  });

  test("prints version", async () => {
    const harness = createCliHarness();
    const exitCode = await runCli({ args: ["--version"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toEqual(["polena 0.1.0"]);
  });

  test("compiles a source file with the default command", async () => {
    const harness = createCliHarness(new Map([["example.plna", "const value = 42;"]]));
    const exitCode = await runCli({ args: ["example.plna"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("\n")).toContain("const value = 42;");
    expect(harness.stderr).toHaveLength(0);
  });

  test("writes output with --out", async () => {
    const harness = createCliHarness(new Map([["example.plna", "const value = 42;"]]));
    const exitCode = await runCli({
      args: ["compile", "example.plna", "--out", "example.js"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout).toHaveLength(0);
    expect(harness.writes.get("example.js")).toContain("const value = 42;");
  });

  test("rejects unsupported source extensions", async () => {
    const harness = createCliHarness();
    const exitCode = await runCli({ args: ["example.ts"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(1);
    expect(harness.stderr.join("\n")).toContain(
      "error: expected a Polena source file ending in .plna or .polena",
    );
  });

  test("prints rich diagnostics for compiler errors", async () => {
    const harness = createCliHarness(new Map([["example.plna", "const value = missing;"]]));
    const exitCode = await runCli({ args: ["example.plna"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(1);
    expect(harness.stderr.join("\n")).toContain("error[PLN102]: Unknown name 'missing'.");
    expect(harness.stderr.join("\n")).toContain("--> example.plna:1:15");
    expect(harness.stderr.join("\n")).toContain("help: declare it before using it");
  });

  test("reports read failures without claiming compilation succeeded", async () => {
    const harness = createCliHarness();
    const exitCode = await runCli({ args: ["missing.plna"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(1);
    expect(harness.stdout).toHaveLength(0);
    expect(harness.stderr).toEqual(["error: could not read 'missing.plna': file not found"]);
    expect(harness.writes.size).toBe(0);
  });

  test("reports write failures after successful compilation", async () => {
    const harness = createCliHarness(new Map([["example.plna", "const value = 42;"]]), {
      failWrites: true,
    });
    const exitCode = await runCli({
      args: ["compile", "example.plna", "--out", "example.js"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(1);
    expect(harness.stdout).toHaveLength(0);
    expect(harness.stderr).toEqual(["error: could not write 'example.js': disk full"]);
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
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
    writes,
  };
}
