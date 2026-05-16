import { describe, expect, test } from "bun:test";
import {
  buildPackage,
  initPackage,
  isSupportedSourceFile,
  parseBuildManifest,
  readPackageSources,
  runPackage,
  sanitizePackageName,
  type BuildIo,
} from "../index";

describe("manifest parsing", () => {
  test("accepts required fields", () => {
    const result = parseBuildManifest('name = "app"\nversion = "0.1.0"\ntarget = "library"\n');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest).toEqual({
        name: "app",
        version: "0.1.0",
        target: "library",
        build: {},
      });
    }
  });

  test("accepts runtime and build out dir", () => {
    const result = parseBuildManifest(
      'name = "app"\nversion = "0.1.0"\ntarget = "executable"\nruntime = "node"\n\n[build]\nout-dir = "build"\n',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.runtime).toBe("node");
      expect(result.manifest.build.outDir).toBe("build");
    }
  });

  test("rejects missing required fields", () => {
    const result = parseBuildManifest('name = "app"\n');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing required manifest field 'version'.",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing required manifest field 'target'.",
    );
  });

  test("rejects invalid target, runtime, and name", () => {
    const result = parseBuildManifest(
      'name = "not-valid"\nversion = "0.1.0"\ntarget = "program"\nruntime = "browser"\n',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "Invalid package name 'not-valid'.",
        "Invalid package target 'program'.",
        "Invalid package runtime 'browser'.",
      ]),
    );
  });

  test("rejects unknown fields and sections", () => {
    const result = parseBuildManifest(
      'name = "app"\nversion = "0.1.0"\ntarget = "library"\nunknown = "x"\n\n[other]\nvalue = "x"\n',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "Unknown manifest field or section 'unknown'.",
        "Unknown manifest field or section 'other'.",
      ]),
    );
  });

  test("rejects unknown and non-string build fields", () => {
    const result = parseBuildManifest(
      'name = "app"\nversion = "0.1.0"\ntarget = "library"\n\n[build]\nout-dir = 1\nother = "x"\n',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining(["Invalid build field 'out-dir'.", "Unknown build field 'other'."]),
    );
  });

  test("rejects non-string manifest values and TOML syntax errors", () => {
    const typed = parseBuildManifest('name = 1\nversion = "0.1.0"\ntarget = "library"\n');
    const syntax = parseBuildManifest("name = =\n");

    expect(typed.ok).toBe(false);
    expect(typed.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Invalid manifest field 'name'.",
    );
    expect(syntax.ok).toBe(false);
    expect(syntax.diagnostics[0]?.message).toContain("Invalid TOML:");
    expect(syntax.diagnostics[0]?.span?.start.line).toBe(1);
  });
});

describe("package operations", () => {
  test("recognizes supported source files", () => {
    expect(isSupportedSourceFile("index.plna")).toBe(true);
    expect(isSupportedSourceFile("index.polena")).toBe(true);
    expect(isSupportedSourceFile("index.ts")).toBe(false);
  });

  test("builds with the default output directory", async () => {
    const harness = createHarness(
      new Map([
        ["/app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        ["/app/src/index.plna", 'export fn main(): void { println("Hello"); }'],
      ]),
    );

    const result = await buildPackage({ packageRoot: "/app", io: harness.io });

    expect(result.ok).toBe(true);
    expect(harness.writes.get("/app/dist/index.js")).toContain("main();");
  });

  test("uses manifest out dir and lets override win", async () => {
    const files = new Map([
      [
        "/app/polena.toml",
        'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n\n[build]\nout-dir = "build"\n',
      ],
      ["/app/src/index.plna", "export fn main(): void {}"],
    ]);
    const manifestHarness = createHarness(files);
    const overrideHarness = createHarness(files);

    await buildPackage({ packageRoot: "/app", io: manifestHarness.io });
    await buildPackage({ packageRoot: "/app", outDirOverride: "custom", io: overrideHarness.io });

    expect(manifestHarness.writes.has("/app/build/index.js")).toBe(true);
    expect(overrideHarness.writes.has("/app/custom/index.js")).toBe(true);
  });

  test("accepts .polena modules and ignores files outside src", async () => {
    const harness = createHarness(
      new Map([
        ["/app/polena.toml", 'name = "app"\nversion = "0.1.0"\ntarget = "executable"\n'],
        ["/app/src/index.plna", "import @/users;\nexport fn main(): void { users.run(); }"],
        ["/app/src/users.polena", 'export fn run(): void { println("ok"); }'],
        ["/app/ignored.plna", "this is not read"],
      ]),
    );

    const sources = await readPackageSources("/app", harness.io);
    const result = await buildPackage({ packageRoot: "/app", io: harness.io });

    expect(sources.map((source) => source.path)).toEqual([
      "/app/src/index.plna",
      "/app/src/users.polena",
    ]);
    expect(result.ok).toBe(true);
    expect(harness.writes.has("/app/dist/users.js")).toBe(true);
  });

  test("fails on missing manifest and entry file", async () => {
    const missingManifest = await buildPackage({ packageRoot: "/missing", io: createHarness().io });
    const missingEntry = await buildPackage({
      packageRoot: "/app",
      io: createHarness(new Map([["/app/polena.toml", packageManifest()]])).io,
    });

    expect(missingManifest.ok).toBe(false);
    expect(missingManifest.diagnostics[0]?.kind).toBe("message");
    expect(missingEntry.ok).toBe(false);
    expect(missingEntry.diagnostics[0]?.kind).toBe("message");
  });

  test("reports compiler diagnostics with source paths", async () => {
    const harness = createHarness(
      new Map([
        ["/app/polena.toml", packageManifest()],
        ["/app/src/index.plna", "export fn main(): void { missing; }"],
      ]),
    );

    const result = await buildPackage({ packageRoot: "/app", io: harness.io });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: "source",
        path: "/app/src/index.plna",
        diagnostic: expect.objectContaining({ message: "Unknown name 'missing'." }),
      }),
    );
  });

  test("reports write failures", async () => {
    const harness = createHarness(
      new Map([
        ["/app/polena.toml", packageManifest()],
        ["/app/src/index.plna", "export fn main(): void {}"],
      ]),
      { failWrites: true },
    );

    const result = await buildPackage({ packageRoot: "/app", io: harness.io });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      { kind: "message", message: "error: could not write output: disk full" },
    ]);
  });
});

describe("init operation", () => {
  test("creates manifest and entry module", async () => {
    const harness = createHarness();
    const result = await initPackage({ targetDir: "/tmp/my-app", io: harness.io });

    expect(result.ok).toBe(true);
    expect(harness.writes.get("/tmp/my-app/polena.toml")).toContain('name = "my_app"');
    expect(harness.writes.get("/tmp/my-app/src/index.plna")).toContain("Hello, Polena!");
  });

  test("honors explicit names and rejects existing manifests", async () => {
    const named = createHarness();
    const existing = createHarness(new Map([["/app/polena.toml", packageManifest()]]));

    const namedResult = await initPackage({
      targetDir: "/tmp/ignored",
      name: "custom",
      io: named.io,
    });
    const existingResult = await initPackage({ targetDir: "/app", io: existing.io });

    expect(namedResult.ok).toBe(true);
    expect(named.writes.get("/tmp/ignored/polena.toml")).toContain('name = "custom"');
    expect(existingResult.ok).toBe(false);
    expect(existing.writes.size).toBe(0);
  });

  test("fails if a name cannot be inferred", async () => {
    expect(sanitizePackageName("!!!")).toBeUndefined();
    const result = await initPackage({ targetDir: "/", io: createHarness().io });

    expect(result.ok).toBe(false);
  });
});

describe("run operation", () => {
  test("builds before running and returns runtime exit code", async () => {
    const harness = createHarness(
      new Map([
        ["/app/polena.toml", packageManifest('runtime = "node"\n')],
        ["/app/src/index.plna", "export fn main(): void {}"],
      ]),
      { binaries: new Map([["node", "/bin/node"]]), spawnExitCode: 7 },
    );

    const result = await runPackage({ packageRoot: "/app", io: harness.io });

    expect(result).toEqual({ ok: true, exitCode: 7 });
    expect(harness.commands).toEqual([["/bin/node", "/app/dist/index.js"]]);
  });

  test("refuses libraries, missing runtimes, and missing runtime binaries", async () => {
    const library = createHarness(
      new Map([
        [
          "/app/polena.toml",
          'name = "app"\nversion = "0.1.0"\ntarget = "library"\nruntime = "node"\n',
        ],
        ["/app/src/index.plna", "export fn helper(): void {}"],
      ]),
      { binaries: new Map([["node", "/bin/node"]]) },
    );
    const missingRuntime = createHarness(
      new Map([
        ["/app/polena.toml", packageManifest()],
        ["/app/src/index.plna", "export fn main(): void {}"],
      ]),
    );
    const missingBinary = createHarness(
      new Map([
        ["/app/polena.toml", packageManifest('runtime = "deno"\n')],
        ["/app/src/index.plna", "export fn main(): void {}"],
      ]),
    );

    expect((await runPackage({ packageRoot: "/app", io: library.io })).ok).toBe(false);
    expect((await runPackage({ packageRoot: "/app", io: missingRuntime.io })).ok).toBe(false);
    expect((await runPackage({ packageRoot: "/app", io: missingBinary.io })).ok).toBe(false);
  });

  test("invokes bun and deno runtimes", async () => {
    const bunHarness = createHarness(
      new Map([
        ["/app/polena.toml", packageManifest('runtime = "bun"\n')],
        ["/app/src/index.plna", "export fn main(): void {}"],
      ]),
      { binaries: new Map([["bun", "/bin/bun"]]) },
    );
    const denoHarness = createHarness(
      new Map([
        ["/app/polena.toml", packageManifest('runtime = "deno"\n')],
        ["/app/src/index.plna", "export fn main(): void {}"],
      ]),
      { binaries: new Map([["deno", "/bin/deno"]]) },
    );

    await runPackage({ packageRoot: "/app", io: bunHarness.io });
    await runPackage({ packageRoot: "/app", io: denoHarness.io });

    expect(bunHarness.commands).toEqual([["/bin/bun", "/app/dist/index.js"]]);
    expect(denoHarness.commands).toEqual([["/bin/deno", "run", "/app/dist/index.js"]]);
  });
});

function packageManifest(extra = ""): string {
  return `name = "app"\nversion = "0.1.0"\ntarget = "executable"\n${extra}`;
}

function createHarness(
  files: ReadonlyMap<string, string> = new Map(),
  options: {
    readonly failWrites?: boolean;
    readonly binaries?: ReadonlyMap<string, string>;
    readonly spawnExitCode?: number;
  } = {},
): {
  readonly io: BuildIo;
  readonly writes: Map<string, string>;
  readonly commands: string[][];
} {
  const sourceFiles = new Map(files);
  const writes = new Map<string, string>();
  const commands: string[][] = [];

  const io: BuildIo = {
    readTextFile: async (path) => {
      const source = sourceFiles.get(path) ?? writes.get(path);
      if (source === undefined) {
        throw new Error(`missing file: ${path}`);
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
      for (const file of [...sourceFiles.keys(), ...writes.keys()]) {
        if (!file.startsWith(prefix)) {
          continue;
        }
        const entry = file.slice(prefix.length).split("/")[0];
        if (entry !== undefined && entry !== "") {
          entries.add(entry);
        }
      }
      return [...entries].sort();
    },
    stat: async (path) => {
      if (sourceFiles.has(path) || writes.has(path)) {
        return "file";
      }
      const prefix = `${path.replace(/\/$/, "")}/`;
      for (const file of [...sourceFiles.keys(), ...writes.keys()]) {
        if (file.startsWith(prefix)) {
          return "directory";
        }
      }
      return "missing";
    },
    mkdirp: async () => {},
    which: async (binary) => options.binaries?.get(binary),
    spawn: async (command) => {
      commands.push([...command]);
      return options.spawnExitCode ?? 0;
    },
  };

  return { io, writes, commands };
}
