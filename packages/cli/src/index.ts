#!/usr/bin/env bun

import { mkdir, readdir, stat } from "node:fs/promises";
import packageJson from "../package.json";
import { runCli, type CliIo } from "./cli";

export { formatHelp, isSupportedSourceFile, runCli } from "./cli";

if (import.meta.main) {
  const io: CliIo = {
    readTextFile: async (path) => Bun.file(path).text(),
    writeTextFile: async (path, contents) => {
      await Bun.write(path, contents);
    },
    readDir: async (path) => readdir(path),
    stat: async (path) => {
      try {
        const result = await stat(path);
        return result.isDirectory() ? "directory" : result.isFile() ? "file" : "missing";
      } catch {
        return "missing";
      }
    },
    mkdirp: async (path) => {
      await mkdir(path, { recursive: true });
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
