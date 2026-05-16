import {
  analyzePackage,
  compilePackage,
  type Diagnostic,
  type EmittedFile,
  type SourceFile,
} from "@polena/compiler";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

export type PackageTarget = "executable" | "library";
export type PackageRuntime = "node" | "bun" | "deno";

export type BuildManifest = {
  readonly name: string;
  readonly version: string;
  readonly target: PackageTarget;
  readonly runtime?: PackageRuntime;
  readonly build: {
    readonly outDir?: string;
  };
};

export type BuildDiagnostic =
  | { readonly kind: "source"; readonly path: string; readonly diagnostic: Diagnostic }
  | { readonly kind: "message"; readonly message: string };

export type ParseBuildManifestResult =
  | {
      readonly ok: true;
      readonly manifest: BuildManifest;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export type BuildResult =
  | {
      readonly ok: true;
      readonly outDir: string;
      readonly files: readonly EmittedFile[];
      readonly manifest: BuildManifest;
      readonly diagnostics: readonly BuildDiagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

export type InitResult =
  | { readonly ok: true; readonly files: readonly string[] }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

export type RunResult =
  | { readonly ok: true; readonly exitCode: number }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

export type BuildIo = {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly writeTextFile: (path: string, contents: string) => Promise<void>;
  readonly readDir: (path: string) => Promise<readonly string[]>;
  readonly stat: (path: string) => Promise<"file" | "directory" | "missing">;
  readonly mkdirp: (path: string) => Promise<void>;
  readonly which: (binary: string) => Promise<string | undefined>;
  readonly spawn: (command: readonly string[]) => Promise<number>;
};

const supportedSourceExtensions = [".plna", ".polena"] as const;
const topLevelFields = new Set(["name", "version", "target", "runtime", "build"]);
const buildFields = new Set(["out-dir"]);
const validTargets = new Set(["executable", "library"]);
const validRuntimes = new Set(["node", "bun", "deno"]);

export function parseBuildManifest(source: string): ParseBuildManifestResult {
  const diagnostics: Diagnostic[] = [];
  const spans = scanManifestSpans(source);
  let parsed: unknown;

  try {
    parsed = parseToml(source);
  } catch (reason) {
    diagnostics.push(
      manifestError(`Invalid TOML: ${formatUnknownError(reason)}`, syntaxSpan(reason, source), {
        label: "fix this TOML syntax error",
      }),
    );
    return { ok: false, diagnostics };
  }

  if (!isPlainObject(parsed)) {
    diagnostics.push(
      manifestError("Invalid manifest.", spanForManifest(source), {
        label: "expected a TOML table",
      }),
    );
    return { ok: false, diagnostics };
  }

  for (const key of Object.keys(parsed)) {
    if (!topLevelFields.has(key)) {
      diagnostics.push(
        manifestError(
          `Unknown manifest field or section '${key}'.`,
          spanForKey(spans, key, source),
          {
            label: "remove this field or check its spelling",
          },
        ),
      );
    }
  }

  const buildValue = parsed.build;
  if (buildValue !== undefined && !isPlainObject(buildValue)) {
    diagnostics.push(
      manifestError("Invalid manifest field 'build'.", spanForKey(spans, "build", source), {
        label: "expected a [build] section",
      }),
    );
  }

  if (isPlainObject(buildValue)) {
    for (const key of Object.keys(buildValue)) {
      if (!buildFields.has(key)) {
        diagnostics.push(
          manifestError(`Unknown build field '${key}'.`, spanForBuildKey(spans, key, source), {
            label: "remove this field or check its spelling",
          }),
        );
      }
    }
  }

  const name = readRequiredString(parsed, "name", source, spans, diagnostics);
  const version = readRequiredString(parsed, "version", source, spans, diagnostics);
  const target = readRequiredString(parsed, "target", source, spans, diagnostics);
  const runtime = readOptionalString(parsed, "runtime", source, spans, diagnostics);
  const outDir = isPlainObject(buildValue)
    ? readOptionalBuildString(buildValue, "out-dir", source, spans, diagnostics)
    : undefined;

  if (name !== undefined && !isValidPackageName(name)) {
    diagnostics.push(
      manifestError(`Invalid package name '${name}'.`, spanForKey(spans, "name", source), {
        label: "package names must be valid Polena identifiers",
      }),
    );
  }

  if (target !== undefined && !validTargets.has(target)) {
    diagnostics.push(
      manifestError(`Invalid package target '${target}'.`, spanForKey(spans, "target", source), {
        label: 'target must be "executable" or "library"',
      }),
    );
  }

  if (runtime !== undefined && !validRuntimes.has(runtime)) {
    diagnostics.push(
      manifestError(`Invalid package runtime '${runtime}'.`, spanForKey(spans, "runtime", source), {
        label: 'runtime must be "node", "bun", or "deno"',
      }),
    );
  }

  if (
    diagnostics.length > 0 ||
    name === undefined ||
    version === undefined ||
    target === undefined
  ) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    manifest: {
      name,
      version,
      target: target as PackageTarget,
      ...(runtime === undefined ? {} : { runtime: runtime as PackageRuntime }),
      build: {
        ...(outDir === undefined ? {} : { outDir }),
      },
    },
    diagnostics,
  };
}

export async function findPackageRoot(
  startDir: string,
  io: Pick<BuildIo, "stat">,
): Promise<string | undefined> {
  let current = normalize(startDir);

  while (true) {
    if ((await io.stat(join(current, "polena.toml"))) === "file") {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function readPackageSources(
  packageRoot: string,
  io: Pick<BuildIo, "readTextFile" | "readDir" | "stat">,
): Promise<readonly SourceFile[]> {
  const sourceDir = join(packageRoot, "src");
  return readSourceFiles(sourceDir, io);
}

export function isSupportedSourceFile(path: string): boolean {
  return supportedSourceExtensions.some((extension) => path.endsWith(extension));
}

export function resolveOutDir(input: {
  readonly packageRoot: string;
  readonly manifest: BuildManifest;
  readonly outDirOverride?: string;
}): string {
  const outDir = input.outDirOverride ?? input.manifest.build.outDir ?? "dist";
  return isAbsolute(outDir) ? normalize(outDir) : normalize(join(input.packageRoot, outDir));
}

export async function buildPackage(input: {
  readonly packageRoot: string;
  readonly outDirOverride?: string;
  readonly io: BuildIo;
}): Promise<BuildResult> {
  const packageRoot = normalize(input.packageRoot);
  const manifestPath = join(packageRoot, "polena.toml");
  const sourceDir = join(packageRoot, "src");
  const entryPath = join(sourceDir, "index.plna");

  if ((await input.io.stat(manifestPath)) !== "file") {
    return failMessage(`error: package is missing '${manifestPath}'`);
  }
  if ((await input.io.stat(entryPath)) !== "file") {
    return failMessage(`error: package is missing '${entryPath}'`);
  }

  let manifestSource: string;
  try {
    manifestSource = await input.io.readTextFile(manifestPath);
  } catch (reason) {
    return failMessage(`error: could not read '${manifestPath}': ${formatUnknownError(reason)}`);
  }

  const manifestResult = parseBuildManifest(manifestSource);
  if (!manifestResult.ok) {
    return {
      ok: false,
      diagnostics: manifestResult.diagnostics.map((diagnostic) => ({
        kind: "source",
        path: manifestPath,
        diagnostic,
      })),
    };
  }

  const files = await readSourceFiles(sourceDir, input.io);
  const compilerManifest = compilerManifestFromBuildManifest(manifestResult.manifest);
  const analysis = analyzePackage({
    manifest: compilerManifest,
    rootDir: packageRoot,
    sourceDir,
    files,
  });

  if (!analysis.ok) {
    return {
      ok: false,
      diagnostics: analysis.diagnostics.map((item) => ({
        kind: "source",
        path: item.path,
        diagnostic: item.diagnostic,
      })),
    };
  }

  const compileResult = compilePackage({
    manifest: compilerManifest,
    rootDir: packageRoot,
    sourceDir,
    files,
  });

  if (!compileResult.ok) {
    return {
      ok: false,
      diagnostics: compileResult.diagnostics.map((diagnostic) => ({
        kind: "source",
        path: diagnostic.sourcePath ?? entryPath,
        diagnostic,
      })),
    };
  }

  const outDir = resolveOutDir({
    packageRoot,
    manifest: manifestResult.manifest,
    outDirOverride: input.outDirOverride,
  });

  try {
    await input.io.mkdirp(outDir);
    for (const file of compileResult.files) {
      const outputPath = join(outDir, file.path);
      await input.io.mkdirp(dirname(outputPath));
      await input.io.writeTextFile(outputPath, file.contents);
    }
  } catch (reason) {
    return failMessage(`error: could not write output: ${formatUnknownError(reason)}`);
  }

  return {
    ok: true,
    outDir,
    manifest: manifestResult.manifest,
    files: compileResult.files,
    diagnostics: [],
  };
}

export async function initPackage(input: {
  readonly targetDir: string;
  readonly name?: string;
  readonly io: Pick<BuildIo, "stat" | "mkdirp" | "writeTextFile">;
}): Promise<InitResult> {
  const targetDir = normalize(input.targetDir);
  const manifestPath = join(targetDir, "polena.toml");
  const sourceDir = join(targetDir, "src");
  const entryPath = join(sourceDir, "index.plna");

  if ((await input.io.stat(manifestPath)) === "file") {
    return failMessage(`error: package already exists at '${manifestPath}'`);
  }

  const packageName = input.name ?? sanitizePackageName(dirnameBasename(targetDir));
  if (packageName === undefined || !isValidPackageName(packageName)) {
    return failMessage("error: could not infer a valid package name; pass --name explicitly");
  }

  try {
    await input.io.mkdirp(sourceDir);
    await input.io.writeTextFile(
      manifestPath,
      [
        `name = "${packageName}"`,
        'version = "0.1.0"',
        'target = "executable"',
        'runtime = "node"',
        "",
      ].join("\n"),
    );
    await input.io.writeTextFile(
      entryPath,
      ["export fn main(): void {", '  println("Hello, Polena!");', "}", ""].join("\n"),
    );
  } catch (reason) {
    return failMessage(`error: could not initialize package: ${formatUnknownError(reason)}`);
  }

  return { ok: true, files: [manifestPath, entryPath] };
}

export async function runPackage(input: {
  readonly packageRoot: string;
  readonly outDirOverride?: string;
  readonly io: BuildIo;
}): Promise<RunResult> {
  const buildResult = await buildPackage(input);
  if (!buildResult.ok) {
    return buildResult;
  }

  if (buildResult.manifest.target !== "executable") {
    return failMessage("error: cannot run a library package");
  }

  const runtime = buildResult.manifest.runtime;
  if (runtime === undefined) {
    return failMessage(
      "error: package runtime is required to run an executable; add runtime to polena.toml",
    );
  }

  const runtimeBinary = await input.io.which(runtime);
  if (runtimeBinary === undefined) {
    return failMessage(`error: runtime '${runtime}' was not found on PATH`);
  }

  const entryPath = join(buildResult.outDir, "index.js");
  const command =
    runtime === "deno" ? [runtimeBinary, "run", entryPath] : [runtimeBinary, entryPath];
  const exitCode = await input.io.spawn(command);
  return { ok: true, exitCode };
}

export function sanitizePackageName(name: string): string | undefined {
  const sanitized = name
    .trim()
    .replaceAll(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^([^A-Za-z_$])/, "_$1")
    .replaceAll(/_+/g, "_")
    .replaceAll(/^_+$/g, "");
  return sanitized.length === 0 || !isValidPackageName(sanitized) ? undefined : sanitized;
}

function compilerManifestFromBuildManifest(manifest: BuildManifest): {
  readonly name: string;
  readonly version: string;
  readonly target: PackageTarget;
} {
  return {
    name: manifest.name,
    version: manifest.version,
    target: manifest.target,
  };
}

async function readSourceFiles(
  sourceDir: string,
  io: Pick<BuildIo, "readTextFile" | "readDir" | "stat">,
): Promise<readonly SourceFile[]> {
  const files: SourceFile[] = [];

  async function visit(dir: string): Promise<void> {
    if ((await io.stat(dir)) !== "directory") {
      return;
    }

    for (const entry of await io.readDir(dir)) {
      const path = join(dir, entry);
      const kind = await io.stat(path);
      if (kind === "directory") {
        await visit(path);
      } else if (kind === "file" && isSupportedSourceFile(path)) {
        files.push({ path: normalize(path), source: await io.readTextFile(path) });
      }
    }
  }

  await visit(sourceDir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

type ManifestSpans = {
  readonly topLevel: ReadonlyMap<string, Span>;
  readonly build: ReadonlyMap<string, Span>;
  readonly sections: ReadonlyMap<string, Span>;
};

type Span = NonNullable<Diagnostic["span"]>;

function scanManifestSpans(source: string): ManifestSpans {
  const topLevel = new Map<string, Span>();
  const build = new Map<string, Span>();
  const sections = new Map<string, Span>();
  const lines = source.split(/\n/);
  let offset = 0;
  let section: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const sectionMatch = /^\[([^\]]+)\]\s*(?:#.*)?$/.exec(trimmed);
    if (sectionMatch !== null) {
      const name = sectionMatch[1] ?? "";
      section = name;
      sections.set(name, spanForText(offset, lineNumber, line, name));
      offset += line.length + 1;
      continue;
    }

    const fieldMatch = /^([A-Za-z_][A-Za-z0-9_$-]*)\s*=/.exec(trimmed);
    if (fieldMatch !== null) {
      const key = fieldMatch[1] ?? "";
      if (section === "build") {
        build.set(key, spanForText(offset, lineNumber, line, key));
      } else if (section === undefined) {
        topLevel.set(key, spanForText(offset, lineNumber, line, key));
      }
    }

    offset += line.length + 1;
  }

  return { topLevel, build, sections };
}

function readRequiredString(
  table: Record<string, unknown>,
  key: string,
  source: string,
  spans: ManifestSpans,
  diagnostics: Diagnostic[],
): string | undefined {
  const value = table[key];
  if (value === undefined) {
    diagnostics.push(
      manifestError(`Missing required manifest field '${key}'.`, spanForManifest(source), {
        label: "add this field to polena.toml",
      }),
    );
    return undefined;
  }
  if (typeof value !== "string") {
    diagnostics.push(
      manifestError(`Invalid manifest field '${key}'.`, spanForKey(spans, key, source), {
        label: "expected a string value",
      }),
    );
    return undefined;
  }
  return value;
}

function readOptionalString(
  table: Record<string, unknown>,
  key: string,
  source: string,
  spans: ManifestSpans,
  diagnostics: Diagnostic[],
): string | undefined {
  const value = table[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    diagnostics.push(
      manifestError(`Invalid manifest field '${key}'.`, spanForKey(spans, key, source), {
        label: "expected a string value",
      }),
    );
    return undefined;
  }
  return value;
}

function readOptionalBuildString(
  table: Record<string, unknown>,
  key: string,
  source: string,
  spans: ManifestSpans,
  diagnostics: Diagnostic[],
): string | undefined {
  const value = table[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    diagnostics.push(
      manifestError(`Invalid build field '${key}'.`, spanForBuildKey(spans, key, source), {
        label: "expected a string value",
      }),
    );
    return undefined;
  }
  return value;
}

function manifestError(
  message: string,
  span: Span,
  options: { readonly label: string },
): Diagnostic {
  return {
    severity: "error",
    code: "PLN025",
    message,
    span,
    label: options.label,
  };
}

function failMessage(message: string): {
  readonly ok: false;
  readonly diagnostics: readonly BuildDiagnostic[];
} {
  return { ok: false, diagnostics: [{ kind: "message", message }] };
}

function spanForKey(spans: ManifestSpans, key: string, source: string): Span {
  return spans.topLevel.get(key) ?? spans.sections.get(key) ?? spanForManifest(source);
}

function spanForBuildKey(spans: ManifestSpans, key: string, source: string): Span {
  return spans.build.get(key) ?? spanForManifest(source);
}

function spanForManifest(source: string): Span {
  const firstLine = source.split(/\n/)[0] ?? "";
  return {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: firstLine.length, line: 1, column: firstLine.length + 1 },
  };
}

function syntaxSpan(reason: unknown, source: string): Span {
  const maybeReason = reason as {
    readonly line?: unknown;
    readonly column?: unknown;
  };
  if (typeof maybeReason.line === "number" && typeof maybeReason.column === "number") {
    const line = Math.max(1, maybeReason.line);
    const column = Math.max(1, maybeReason.column);
    const offset = offsetForLocation(source, line, column);
    return {
      start: { offset, line, column },
      end: { offset: offset + 1, line, column: column + 1 },
    };
  }
  return spanForManifest(source);
}

function offsetForLocation(source: string, line: number, column: number): number {
  const lines = source.split(/\n/);
  let offset = 0;
  for (let index = 0; index < line - 1; index += 1) {
    offset += (lines[index] ?? "").length + 1;
  }
  return offset + column - 1;
}

function spanForText(offset: number, lineNumber: number, line: string, text: string): Span {
  const column = line.indexOf(text) + 1;
  return {
    start: { offset: offset + column - 1, line: lineNumber, column },
    end: {
      offset: offset + column - 1 + text.length,
      line: lineNumber,
      column: column + text.length,
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPackageName(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function dirnameBasename(path: string): string {
  const resolved = resolve(path);
  const parts = resolved.split(/[\\/]+/);
  return parts[parts.length - 1] ?? "";
}

function formatUnknownError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
