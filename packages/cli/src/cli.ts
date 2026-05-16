import {
  buildPackage,
  initPackage,
  isSupportedSourceFile,
  runPackage,
  type BuildDiagnostic,
  type BuildIo,
} from "@polena/build";
import { renderDiagnostics } from "@polena/compiler";

export type CliIo = BuildIo & {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

type CommandKind = "build" | "init" | "run";

type CliCommand =
  | { readonly kind: "build"; readonly packageDir: string; readonly outDir?: string }
  | { readonly kind: "init"; readonly targetDir: string; readonly name?: string }
  | { readonly kind: "run"; readonly packageDir: string; readonly args: readonly string[] }
  | { readonly kind: "help"; readonly command?: CommandKind }
  | { readonly kind: "version" }
  | { readonly kind: "error"; readonly message: string; readonly command?: CommandKind };

export type RunCliOptions = {
  readonly args: readonly string[];
  readonly version: string;
  readonly io: CliIo;
};

export async function runCli(options: RunCliOptions): Promise<number> {
  const command = parseCommand(options.args);

  switch (command.kind) {
    case "help":
      options.io.stdout(formatHelp(command.command));
      return 0;
    case "version":
      options.io.stdout(`polena ${options.version}`);
      return 0;
    case "error":
      options.io.stderr(`${command.message}\n\n${formatHelp(command.command)}`);
      return 1;
    case "build": {
      const result = await buildPackage({
        packageRoot: command.packageDir,
        outDirOverride: command.outDir,
        io: options.io,
      });
      if (!result.ok) {
        await renderBuildDiagnostics(result.diagnostics, options.io);
        return 1;
      }
      return 0;
    }
    case "init": {
      const result = await initPackage({
        targetDir: command.targetDir,
        name: command.name,
        io: options.io,
      });
      if (!result.ok) {
        await renderBuildDiagnostics(result.diagnostics, options.io);
        return 1;
      }
      return 0;
    }
    case "run": {
      const result = await runPackage({
        packageRoot: command.packageDir,
        args: command.args,
        io: options.io,
      });
      if (!result.ok) {
        await renderBuildDiagnostics(result.diagnostics, options.io);
        return 1;
      }
      return result.exitCode;
    }
  }
}

export { isSupportedSourceFile };

export function formatHelp(command?: CommandKind): string {
  switch (command) {
    case "build":
      return [
        "Usage:",
        "  polena build [path] [--out-dir <dir>]",
        "",
        "Options:",
        "  --out-dir <dir>  Override the manifest output directory",
        "  -h, --help       Show this help message",
        "  -V, --version    Show the compiler version",
      ].join("\n");
    case "init":
      return [
        "Usage:",
        "  polena init [path] [--name <name>]",
        "",
        "Options:",
        "  --name <name>  Package name to write into polena.toml",
        "  -h, --help     Show this help message",
        "  -V, --version  Show the compiler version",
      ].join("\n");
    case "run":
      return [
        "Usage:",
        "  polena run [path] [-- args...]",
        "",
        "Options:",
        "  -h, --help     Show this help message",
        "  -V, --version  Show the compiler version",
      ].join("\n");
    case undefined:
      return [
        "Polena programming language tools",
        "",
        "Usage:",
        "  polena build [path] [--out-dir <dir>]",
        "  polena init  [path] [--name <name>]",
        "  polena run   [path]",
        "  polena help",
        "  polena version",
        "",
        "Commands:",
        "  build    Build a Polena package to JavaScript modules",
        "  init     Create a new Polena package",
        "  run      Build and run an executable Polena package",
        "  help     Show this help message",
        "  version  Show the compiler version",
        "",
        "Options:",
        "  -h, --help     Show this help message",
        "  -V, --version  Show the compiler version",
      ].join("\n");
  }
}

function parseCommand(args: readonly string[]): CliCommand {
  const passthroughIndex = args.indexOf("--");
  const argsBeforePassthrough = passthroughIndex === -1 ? args : args.slice(0, passthroughIndex);

  if (argsBeforePassthrough.includes("-V") || argsBeforePassthrough.includes("--version")) {
    return { kind: "version" };
  }

  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    return { kind: "help" };
  }

  if (args[0] === "version") {
    return { kind: "version" };
  }

  const first = args[0];
  if (first === "build" || first === "init" || first === "run") {
    const commandArgs = args.slice(1);
    const passthroughIndex = commandArgs.indexOf("--");
    const helpArgs = passthroughIndex === -1 ? commandArgs : commandArgs.slice(0, passthroughIndex);
    if (helpArgs.includes("-h") || helpArgs.includes("--help")) {
      return { kind: "help", command: first };
    }
    return parseSubcommand(first, commandArgs);
  }

  if (first?.startsWith("-")) {
    return usageError(`error: unknown option '${first}'`);
  }

  return usageError(`error: unknown command '${first}'`);
}

function parseSubcommand(command: CommandKind, args: readonly string[]): CliCommand {
  const passthroughIndex = args.indexOf("--");
  const cliArgs =
    command === "run" && passthroughIndex !== -1 ? args.slice(0, passthroughIndex) : args;

  for (const arg of cliArgs) {
    if (arg.includes("=") && arg.startsWith("--")) {
      return usageError(
        `error: '${arg}' is not supported; pass flag values as separate arguments`,
        command,
      );
    }
    if (/^-[A-Za-z]{2,}$/.test(arg)) {
      return usageError(`error: combined short flags are not supported: '${arg}'`, command);
    }
  }

  switch (command) {
    case "build":
      return parseBuildCommand(args);
    case "init":
      return parseInitCommand(args);
    case "run":
      return parseRunCommand(args);
  }
}

function parseBuildCommand(args: readonly string[]): CliCommand {
  let packageDir: string | undefined;
  let outDir: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out-dir") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError("error: expected a directory path after '--out-dir'", "build");
      }
      outDir = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith("-")) {
      return usageError(`error: unknown option '${arg}'`, "build");
    }
    if (packageDir !== undefined) {
      return usageError(`error: unexpected argument '${arg}'`, "build");
    }
    packageDir = arg;
  }

  return {
    kind: "build",
    packageDir: packageDir ?? ".",
    ...(outDir === undefined ? {} : { outDir }),
  };
}

function parseInitCommand(args: readonly string[]): CliCommand {
  let targetDir: string | undefined;
  let name: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--name") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return usageError("error: expected a package name after '--name'", "init");
      }
      name = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith("-")) {
      return usageError(`error: unknown option '${arg}'`, "init");
    }
    if (targetDir !== undefined) {
      return usageError(`error: unexpected argument '${arg}'`, "init");
    }
    targetDir = arg;
  }

  return {
    kind: "init",
    targetDir: targetDir ?? ".",
    ...(name === undefined ? {} : { name }),
  };
}

function parseRunCommand(args: readonly string[]): CliCommand {
  let packageDir: string | undefined;
  let runtimeArgs: readonly string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--") {
      runtimeArgs = args.slice(index + 1);
      break;
    }
    if (arg.startsWith("-")) {
      return usageError(`error: unknown option '${arg}'`, "run");
    }
    if (packageDir !== undefined) {
      return usageError(`error: unexpected argument '${arg}'`, "run");
    }
    packageDir = arg;
  }

  return { kind: "run", packageDir: packageDir ?? ".", args: runtimeArgs };
}

function usageError(message: string, command?: CommandKind): CliCommand {
  return { kind: "error", message, ...(command === undefined ? {} : { command }) };
}

async function renderBuildDiagnostics(
  diagnostics: readonly BuildDiagnostic[],
  io: CliIo,
): Promise<void> {
  for (const diagnostic of diagnostics) {
    if (diagnostic.kind === "message") {
      io.stderr(diagnostic.message);
      continue;
    }
    let source = "";
    try {
      source = await io.readTextFile(diagnostic.path);
    } catch {
      source = "";
    }
    io.stderr(renderDiagnostics([diagnostic.diagnostic], source, diagnostic.path));
  }
}
