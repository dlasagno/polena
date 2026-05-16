import {
  buildPackage,
  initPackage,
  isSupportedSourceFile,
  runPackage,
  sanitizePackageName,
  type BuildDiagnostic,
  type BuildIo,
  type PackageRuntime,
  type PackageTarget,
} from "@polena/build";
import { basename, resolve } from "node:path";
import { renderDiagnostics } from "@polena/compiler";

export type CliIo = BuildIo & {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly prompt: (question: string) => Promise<string>;
};

type CommandKind = "build" | "init" | "run";

type CliCommand =
  | { readonly kind: "build"; readonly packageDir: string; readonly outDir?: string }
  | {
      readonly kind: "init";
      readonly targetDir: string;
      readonly name?: string;
      readonly yes: boolean;
    }
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
      const initOptions = command.yes
        ? {
            ok: true as const,
            options: { ...(command.name === undefined ? {} : { name: command.name }) },
          }
        : await promptForInitOptions(command.targetDir, command.name, options.io);
      if (!initOptions.ok) {
        options.io.stderr(initOptions.message);
        return 1;
      }
      const result = await initPackage({
        targetDir: command.targetDir,
        ...initOptions.options,
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
        "  polena init [path] [--name <name>] [--yes]",
        "",
        "Options:",
        "  --name <name>  Package name to write into polena.toml",
        "  -y, --yes      Use the default package setup without prompts",
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
        "  polena init  [path] [--name <name>] [--yes]",
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
  let yes = false;

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
    if (arg === "-y" || arg === "--yes") {
      yes = true;
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
    yes,
  };
}

async function promptForInitOptions(
  targetDir: string,
  explicitName: string | undefined,
  io: Pick<CliIo, "prompt">,
): Promise<
  | {
      readonly ok: true;
      readonly options: {
        readonly name: string;
        readonly target: PackageTarget;
        readonly runtime?: PackageRuntime;
      };
    }
  | { readonly ok: false; readonly message: string }
> {
  const defaultName = explicitName ?? sanitizePackageName(basename(resolve(targetDir)));
  if (defaultName === undefined) {
    return {
      ok: false,
      message: "error: could not infer a valid package name; pass --name explicitly",
    };
  }

  const name = explicitName ?? (await promptForPackageName(io, "Package name", defaultName));
  const target = await promptForChoice(io, "Package target", "executable", [
    "executable",
    "library",
  ]);
  const runtime =
    target === "executable"
      ? await promptForChoice(io, "Runtime", "node", ["node", "bun", "deno"])
      : undefined;

  return {
    ok: true,
    options: {
      name,
      target,
      ...(runtime === undefined ? {} : { runtime }),
    },
  };
}

async function promptForPackageName(
  io: Pick<CliIo, "prompt">,
  label: string,
  defaultValue: string,
): Promise<string> {
  while (true) {
    const answer = (await io.prompt(`${label} (${defaultValue}): `)).trim();
    const value = answer === "" ? defaultValue : answer;
    if (sanitizePackageName(value) === value) {
      return value;
    }
  }
}

async function promptForChoice<const T extends string>(
  io: Pick<CliIo, "prompt">,
  label: string,
  defaultValue: T,
  choices: readonly T[],
): Promise<T> {
  while (true) {
    const answer = (await io.prompt(`${label} (${choices.join("/")}) [${defaultValue}]: `)).trim();
    if (answer === "") {
      return defaultValue;
    }
    if (choices.includes(answer as T)) {
      return answer as T;
    }
  }
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
