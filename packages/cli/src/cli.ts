import {
  compilePackage,
  parsePackageManifest,
  renderDiagnostics,
  type SourceFile,
} from "@polena/compiler";

const supportedSourceExtensions = [".plna", ".polena"] as const;

export type CliIo = {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly writeTextFile: (path: string, contents: string) => Promise<void>;
  readonly readDir: (path: string) => Promise<readonly string[]>;
  readonly stat: (path: string) => Promise<"file" | "directory" | "missing">;
  readonly mkdirp: (path: string) => Promise<void>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

type CompileCommand = {
  readonly kind: "compile";
  readonly packageDir: string;
  readonly outDir: string;
};

type CliCommand =
  | CompileCommand
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "error"; readonly message: string };

export type RunCliOptions = {
  readonly args: readonly string[];
  readonly version: string;
  readonly io: CliIo;
};

export async function runCli(options: RunCliOptions): Promise<number> {
  const command = parseCommand(options.args);

  switch (command.kind) {
    case "help":
      options.io.stdout(formatHelp());
      return 0;
    case "version":
      options.io.stdout(`polena ${options.version}`);
      return 0;
    case "error":
      options.io.stderr(`${command.message}\n\n${formatHelp()}`);
      return 1;
    case "compile":
      return runCompile(command, options.io);
  }
}

export function isSupportedSourceFile(path: string): boolean {
  return supportedSourceExtensions.some((extension) => path.endsWith(extension));
}

export function formatHelp(): string {
  return [
    "Polena programming language compiler",
    "",
    "Usage:",
    "  polena compile <package-dir> --out-dir <dir>",
    "  polena help",
    "  polena version",
    "",
    "Commands:",
    "  compile <package-dir>  Compile a Polena package to JavaScript modules",
    "  help                   Show this help message",
    "  version                Show the compiler version",
    "",
    "Options:",
    "  --out-dir <dir>  Write JavaScript output files to a directory",
    "  -h, --help       Show this help message",
    "  -V, --version    Show the compiler version",
    "",
    "Packages must contain polena.toml and src/index.plna.",
  ].join("\n");
}

function parseCommand(args: readonly string[]): CliCommand {
  if (args.length === 0) {
    return { kind: "error", message: "error: expected a source file or command" };
  }

  const first = args[0];

  if (first === "-h" || first === "--help" || first === "help") {
    return { kind: "help" };
  }

  if (first === "-V" || first === "--version" || first === "version") {
    return { kind: "version" };
  }

  if (first === "compile") {
    return parseCompileCommand(args.slice(1));
  }

  if (first?.startsWith("-")) {
    return { kind: "error", message: `error: unknown option '${first}'` };
  }

  return { kind: "error", message: "error: expected command 'compile'" };
}

function parseCompileCommand(args: readonly string[]): CliCommand {
  let packageDir: string | undefined;
  let outDir: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      return { kind: "help" };
    }

    if (arg === "-V" || arg === "--version") {
      return { kind: "version" };
    }

    if (arg === "-o" || arg === "--out") {
      return {
        kind: "error",
        message: `error: '${arg}' is not supported for package compilation; use --out-dir`,
      };
    }

    if (arg === "--out-dir") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: `error: expected a directory path after '${arg}'` };
      }
      outDir = value;
      index += 1;
      continue;
    }

    if (arg?.startsWith("-")) {
      return { kind: "error", message: `error: unknown option '${arg}'` };
    }

    if (packageDir !== undefined) {
      return { kind: "error", message: `error: unexpected argument '${arg}'` };
    }

    packageDir = arg;
  }

  if (packageDir === undefined) {
    return { kind: "error", message: "error: expected a package directory to compile" };
  }

  if (outDir === undefined) {
    return { kind: "error", message: "error: expected --out-dir for package compilation" };
  }

  return { kind: "compile", packageDir, outDir };
}

async function runCompile(command: CompileCommand, io: CliIo): Promise<number> {
  const manifestPath = joinPath(command.packageDir, "polena.toml");
  const sourceDir = joinPath(command.packageDir, "src");
  const entryPath = joinPath(sourceDir, "index.plna");

  if ((await io.stat(manifestPath)) !== "file") {
    io.stderr(`error: package is missing '${manifestPath}'`);
    return 1;
  }
  if ((await io.stat(entryPath)) !== "file") {
    io.stderr(`error: package is missing '${entryPath}'`);
    return 1;
  }

  let manifestSource: string;
  try {
    manifestSource = await io.readTextFile(manifestPath);
  } catch (reason) {
    io.stderr(`error: could not read '${manifestPath}': ${formatUnknownError(reason)}`);
    return 1;
  }

  const manifestResult = parsePackageManifest(manifestSource);
  if (!manifestResult.ok) {
    io.stderr(renderDiagnostics(manifestResult.diagnostics, manifestSource, manifestPath));
    return 1;
  }

  const files = await readSourceFiles(sourceDir, io);
  const result = compilePackage({
    manifest: manifestResult.manifest,
    rootDir: command.packageDir,
    sourceDir,
    files,
  });

  if (!result.ok) {
    const firstFile = files[0];
    io.stderr(
      renderDiagnostics(result.diagnostics, firstFile?.source ?? "", firstFile?.path ?? entryPath),
    );
    return 1;
  }

  try {
    await io.mkdirp(command.outDir);
    for (const file of result.files) {
      const outputPath = joinPath(command.outDir, file.path);
      await io.mkdirp(dirname(outputPath));
      await io.writeTextFile(outputPath, file.contents);
    }
  } catch (reason) {
    io.stderr(`error: could not write output: ${formatUnknownError(reason)}`);
    return 1;
  }

  return 0;
}

async function readSourceFiles(sourceDir: string, io: CliIo): Promise<readonly SourceFile[]> {
  const files: SourceFile[] = [];

  async function visit(dir: string): Promise<void> {
    for (const entry of await io.readDir(dir)) {
      const path = joinPath(dir, entry);
      const kind = await io.stat(path);
      if (kind === "directory") {
        await visit(path);
      } else if (kind === "file" && isSupportedSourceFile(path)) {
        files.push({ path, source: await io.readTextFile(path) });
      }
    }
  }

  await visit(sourceDir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function formatUnknownError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function joinPath(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "." : path.slice(0, index);
}
