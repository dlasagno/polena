#!/usr/bin/env bun

import { constants } from "node:fs";
import { access, chmod, copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const binaryName = process.platform === "win32" ? "polena.exe" : "polena";
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourcePath = join(repoRoot, "dist", binaryName);
const installDir = process.env.POLENA_INSTALL_BIN ?? defaultInstallDir();
const targetPath = join(installDir, binaryName);

await assertReadableFile(sourcePath);
await mkdir(installDir, { recursive: true });
await copyFile(sourcePath, targetPath);

if (process.platform !== "win32") {
  await chmod(targetPath, 0o755);
}

console.log(`Installed ${binaryName} to ${targetPath}`);

if (!isOnPath(installDir)) {
  console.warn(`Warning: ${installDir} is not on PATH.`);
  console.warn("Add it to PATH or set POLENA_INSTALL_BIN to a directory already on PATH.");
}

function defaultInstallDir(): string {
  const bunInstall = process.env.BUN_INSTALL;
  if (bunInstall !== undefined && bunInstall.length > 0) {
    return join(bunInstall, "bin");
  }

  const xdgBinHome = process.env.XDG_BIN_HOME;
  if (process.platform !== "win32" && xdgBinHome !== undefined && xdgBinHome.length > 0) {
    return xdgBinHome;
  }

  return join(homedir(), ".bun", "bin");
}

async function assertReadableFile(path: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Expected built binary at ${path}. Run bun run build:binary first.`);
  }
}

function isOnPath(path: string): boolean {
  const normalizedPath = normalizePath(path);
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry.length > 0)
    .some((entry) => normalizePath(entry) === normalizedPath);
}

function normalizePath(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
