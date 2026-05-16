import {
  analyzePackage,
  parsePackageManifest,
  type Diagnostic as PolenaDiagnostic,
  type SourceFile,
} from "@polena/compiler";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { pathToFileURL } from "node:url";

const supportedSourceExtensions = [".plna", ".polena"] as const;

export type LanguageServerIo = {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly readDir: (path: string) => Promise<readonly string[]>;
  readonly stat: (path: string) => Promise<"file" | "directory" | "missing">;
};

export type OpenDocumentSnapshot = {
  readonly uri: string;
  readonly path: string;
  readonly text: string;
};

export type PackageDiagnostics = {
  readonly packageRoot: string;
  readonly diagnosticsByUri: ReadonlyMap<string, readonly PolenaDiagnostic[]>;
};

export async function analyzePackageForDocument(input: {
  readonly documentPath: string;
  readonly openDocuments: readonly OpenDocumentSnapshot[];
  readonly io: LanguageServerIo;
}): Promise<PackageDiagnostics | undefined> {
  const packageRoot = await findPackageRoot(dirname(input.documentPath), input.io);
  if (packageRoot === undefined) {
    return undefined;
  }

  const manifestPath = join(packageRoot, "polena.toml");
  const sourceDir = join(packageRoot, "src");
  const manifestSource = await input.io.readTextFile(manifestPath);
  const manifestResult = parsePackageManifest(manifestSource);
  if (!manifestResult.ok) {
    return {
      packageRoot,
      diagnosticsByUri: new Map([[pathToFileURL(manifestPath).href, manifestResult.diagnostics]]),
    };
  }

  const filesByPath = new Map<string, SourceFile>();
  for (const file of await readSourceFiles(sourceDir, input.io)) {
    filesByPath.set(normalize(file.path), file);
  }

  for (const document of input.openDocuments) {
    const normalizedPath = normalize(document.path);
    if (isPackageSourcePath(normalizedPath, sourceDir)) {
      filesByPath.set(normalizedPath, {
        path: normalizedPath,
        source: document.text,
      });
    }
  }

  const result = analyzePackage({
    manifest: manifestResult.manifest,
    rootDir: packageRoot,
    sourceDir,
    files: [...filesByPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
  });

  const diagnosticsByUri = new Map<string, PolenaDiagnostic[]>();
  for (const item of result.diagnostics) {
    const uri = pathToFileURL(normalize(item.path)).href;
    const diagnostics = diagnosticsByUri.get(uri);
    if (diagnostics === undefined) {
      diagnosticsByUri.set(uri, [item.diagnostic]);
    } else {
      diagnostics.push(item.diagnostic);
    }
  }

  for (const file of filesByPath.values()) {
    const uri = pathToFileURL(normalize(file.path)).href;
    if (!diagnosticsByUri.has(uri)) {
      diagnosticsByUri.set(uri, []);
    }
  }

  return { packageRoot, diagnosticsByUri };
}

async function findPackageRoot(
  startDir: string,
  io: LanguageServerIo,
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

async function readSourceFiles(sourceDir: string, io: LanguageServerIo): Promise<SourceFile[]> {
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
  return files;
}

function isPackageSourcePath(path: string, sourceDir: string): boolean {
  if (!isSupportedSourceFile(path)) {
    return false;
  }

  const relativePath = relative(normalize(sourceDir), normalize(path));
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isSupportedSourceFile(path: string): boolean {
  return supportedSourceExtensions.some((extension) => path.endsWith(extension));
}
