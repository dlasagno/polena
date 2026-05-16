import { describe, expect, test } from "bun:test";
import { isSupportedSourceFile, runCli } from "../index";
import type { CliIo } from "../cli";

describe("CLI source files", () => {
  test("accepts Polena source extensions", () => {
    expect(isSupportedSourceFile("example.plna")).toBe(true);
    expect(isSupportedSourceFile("example.polena")).toBe(true);
    expect(isSupportedSourceFile("example.ts")).toBe(false);
  });
});

describe("CLI commands", () => {
  test("prints top-level help and version", async () => {
    const help = createCliHarness();
    const version = createCliHarness();

    expect(await runCli({ args: ["help"], version: "0.1.0", io: help.io })).toBe(0);
    expect(await runCli({ args: ["--version"], version: "0.1.0", io: version.io })).toBe(0);

    expect(help.stdout.join("\n")).toContain("polena build [path] [--out-dir <dir>]");
    expect(version.stdout).toEqual(["polena 0.1.0"]);
  });

  test("prints command help", async () => {
    const harness = createCliHarness();

    const exitCode = await runCli({
      args: ["build", "--help"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.stdout.join("\n")).toContain("polena build [path] [--out-dir <dir>]");
  });

  test("builds a package with default path and output directory", async () => {
    const harness = createCliHarness(
      new Map([
        ["polena.toml", packageManifest()],
        ["src/index.plna", 'export fn main(): void { println("Hello"); }'],
      ]),
    );

    const exitCode = await runCli({ args: ["build"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(0);
    expect(harness.writes.get("dist/index.js")).toContain("main();");
  });

  test("builds a package with an output override", async () => {
    const harness = createCliHarness(
      new Map([
        ["app/polena.toml", packageManifest()],
        ["app/src/index.plna", "export fn main(): void {}"],
      ]),
    );

    const exitCode = await runCli({
      args: ["build", "app", "--out-dir", "dist"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.writes.get("app/dist/index.js")).toContain("main();");
  });

  test("initializes a package with an explicit name", async () => {
    const harness = createCliHarness();

    const exitCode = await runCli({
      args: ["init", "app", "--name", "my_app"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.writes.get("app/polena.toml")).toContain('name = "my_app"');
    expect(harness.writes.get("app/src/index.plna")).toContain("Hello, Polena!");
  });

  test("runs a package", async () => {
    const harness = createCliHarness(
      new Map([
        ["app/polena.toml", packageManifest('runtime = "node"\n')],
        ["app/src/index.plna", "export fn main(): void {}"],
      ]),
      { binaries: new Map([["node", "/bin/node"]]), spawnExitCode: 5 },
    );

    const exitCode = await runCli({ args: ["run", "app"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(5);
    expect(harness.commands).toEqual([["/bin/node", "app/dist/index.js"]]);
  });

  test("passes arguments after -- to run", async () => {
    const harness = createCliHarness(
      new Map([
        ["app/polena.toml", packageManifest('runtime = "node"\n')],
        ["app/src/index.plna", "export fn main(args: []string): void {}"],
      ]),
      { binaries: new Map([["node", "/bin/node"]]) },
    );

    const exitCode = await runCli({
      args: ["run", "app", "--", "--name", "Ada"],
      version: "0.1.0",
      io: harness.io,
    });

    expect(exitCode).toBe(0);
    expect(harness.commands).toEqual([["/bin/node", "app/dist/index.js", "--name", "Ada"]]);
  });

  test("prints rich diagnostics for compiler errors", async () => {
    const harness = createCliHarness(
      new Map([
        ["app/polena.toml", packageManifest()],
        ["app/src/index.plna", "export fn main(): void { missing; }"],
      ]),
    );

    const exitCode = await runCli({ args: ["build", "app"], version: "0.1.0", io: harness.io });

    expect(exitCode).toBe(1);
    expect(harness.stderr.join("\n")).toContain("error[PLN102]: Unknown name 'missing'.");
    expect(harness.stderr.join("\n")).toContain("--> app/src/index.plna:1:26");
  });

  test("reports missing manifests and write failures", async () => {
    const missing = createCliHarness();
    const failing = createCliHarness(
      new Map([
        ["app/polena.toml", packageManifest()],
        ["app/src/index.plna", "export fn main(): void {}"],
      ]),
      { failWrites: true },
    );

    expect(await runCli({ args: ["build", "missing"], version: "0.1.0", io: missing.io })).toBe(1);
    expect(await runCli({ args: ["build", "app"], version: "0.1.0", io: failing.io })).toBe(1);

    expect(missing.stderr).toEqual(["error: package is missing 'missing/polena.toml'"]);
    expect(failing.stderr).toEqual(["error: could not write output: disk full"]);
  });

  test("rejects usage errors", async () => {
    const cases = [
      ["build", "--out-dir=dist"],
      ["build", "-Vh"],
      ["build", "one", "two"],
      ["build", "--unknown"],
      ["compile", "app"],
    ] as const;

    for (const args of cases) {
      const harness = createCliHarness();
      const exitCode = await runCli({ args, version: "0.1.0", io: harness.io });

      expect(exitCode).toBe(1);
      expect(harness.stderr[0]).toContain("error:");
    }
  });
});

function packageManifest(extra = ""): string {
  return `name = "app"\nversion = "0.1.0"\ntarget = "executable"\n${extra}`;
}

function createCliHarness(
  files: ReadonlyMap<string, string> = new Map(),
  options: {
    readonly failWrites?: boolean;
    readonly binaries?: ReadonlyMap<string, string>;
    readonly spawnExitCode?: number;
  } = {},
): {
  readonly io: CliIo;
  readonly stdout: string[];
  readonly stderr: string[];
  readonly writes: Map<string, string>;
  readonly commands: string[][];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writes = new Map<string, string>();
  const commands: string[][] = [];

  return {
    io: {
      readTextFile: async (path) => {
        const source = files.get(path) ?? writes.get(path);
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
        for (const file of [...files.keys(), ...writes.keys()]) {
          if (!file.startsWith(prefix)) {
            continue;
          }
          const first = file.slice(prefix.length).split("/")[0];
          if (first !== undefined && first !== "") {
            entries.add(first);
          }
        }
        return [...entries].sort();
      },
      stat: async (path) => {
        if (files.has(path) || writes.has(path)) {
          return "file";
        }
        const prefix = `${path.replace(/\/$/, "")}/`;
        return [...files.keys(), ...writes.keys()].some((file) => file.startsWith(prefix))
          ? "directory"
          : "missing";
      },
      mkdirp: async () => {},
      which: async (binary) => options.binaries?.get(binary),
      spawn: async (command) => {
        commands.push([...command]);
        return options.spawnExitCode ?? 0;
      },
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
    stdout,
    stderr,
    writes,
    commands,
  };
}
