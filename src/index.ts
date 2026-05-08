#!/usr/bin/env bun

import packageJson from "../package.json";
import { runCli, type CliIo } from "./cli";

export { formatHelp, isSupportedSourceFile, runCli } from "./cli";
export { compile } from "./compiler";
export type { CompileResult, Diagnostic } from "./compiler";
export { renderDiagnostic, renderDiagnostics } from "./diagnostic-renderer";
export type { RenderDiagnosticOptions } from "./diagnostic-renderer";

if (import.meta.main) {
  const io: CliIo = {
    readTextFile: async (path) => Bun.file(path).text(),
    writeTextFile: async (path, contents) => {
      await Bun.write(path, contents);
    },
    stdout: (text) => console.log(text),
    stderr: (text) => console.error(text),
  };

  const exitCode = await runCli({
    args: Bun.argv.slice(2),
    version: getPackageVersion(),
    io,
  });

  process.exit(exitCode);
}

function getPackageVersion(): string {
  return typeof packageJson.version === "string" ? packageJson.version : "unknown";
}
