import { compile } from "./compiler";
import { renderDiagnostics } from "./diagnostic-renderer";

const supportedSourceExtensions = [".plna", ".polena"] as const;

export type CliIo = {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly writeTextFile: (path: string, contents: string) => Promise<void>;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

type CompileCommand = {
  readonly kind: "compile";
  readonly inputPath: string;
  readonly outputPath?: string;
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
    "  polena <file>",
    "  polena compile <file> [options]",
    "  polena help",
    "  polena version",
    "",
    "Commands:",
    "  compile <file>  Compile a Polena source file to JavaScript",
    "  help            Show this help message",
    "  version         Show the compiler version",
    "",
    "Options:",
    "  -o, --out <file>  Write JavaScript output to a file",
    "  -h, --help        Show this help message",
    "  -V, --version     Show the compiler version",
    "",
    "Source files must end in .plna or .polena.",
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

  return parseCompileCommand(args);
}

function parseCompileCommand(args: readonly string[]): CliCommand {
  let inputPath: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-h" || arg === "--help") {
      return { kind: "help" };
    }

    if (arg === "-V" || arg === "--version") {
      return { kind: "version" };
    }

    if (arg === "-o" || arg === "--out") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "error", message: `error: expected a file path after '${arg}'` };
      }
      outputPath = value;
      index += 1;
      continue;
    }

    if (arg?.startsWith("-")) {
      return { kind: "error", message: `error: unknown option '${arg}'` };
    }

    if (inputPath !== undefined) {
      return { kind: "error", message: `error: unexpected argument '${arg}'` };
    }

    inputPath = arg;
  }

  if (inputPath === undefined) {
    return { kind: "error", message: "error: expected a source file to compile" };
  }

  if (!isSupportedSourceFile(inputPath)) {
    return {
      kind: "error",
      message: "error: expected a Polena source file ending in .plna or .polena",
    };
  }

  return outputPath === undefined
    ? { kind: "compile", inputPath }
    : { kind: "compile", inputPath, outputPath };
}

async function runCompile(command: CompileCommand, io: CliIo): Promise<number> {
  let source: string;

  try {
    source = await io.readTextFile(command.inputPath);
  } catch (reason) {
    io.stderr(`error: could not read '${command.inputPath}': ${formatUnknownError(reason)}`);
    return 1;
  }

  const result = compile(source);

  if (!result.ok) {
    io.stderr(renderDiagnostics(result.diagnostics, source, command.inputPath));
    return 1;
  }

  if (command.outputPath !== undefined) {
    try {
      await io.writeTextFile(command.outputPath, result.js);
    } catch (reason) {
      io.stderr(`error: could not write '${command.outputPath}': ${formatUnknownError(reason)}`);
      return 1;
    }
    return 0;
  }

  io.stdout(result.js);
  return 0;
}

function formatUnknownError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
