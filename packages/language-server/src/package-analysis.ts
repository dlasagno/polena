import {
  findPackageRoot,
  isSupportedSourceFile,
  parseBuildManifest,
  readPackageSources,
  type BuildIo,
} from "@polena/build";
import {
  analyzePackage,
  type Diagnostic as PolenaDiagnostic,
  type SourceFile,
} from "@polena/compiler";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { pathToFileURL } from "node:url";

export type LanguageServerIo = Pick<BuildIo, "readTextFile" | "readDir" | "stat">;

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
  const manifestSource =
    input.openDocuments.find((document) => normalize(document.path) === normalize(manifestPath))
      ?.text ?? (await input.io.readTextFile(manifestPath));
  const manifestResult = parseBuildManifest(manifestSource);
  if (!manifestResult.ok) {
    return {
      packageRoot,
      diagnosticsByUri: new Map([[pathToFileURL(manifestPath).href, manifestResult.diagnostics]]),
    };
  }

  const filesByPath = new Map<string, SourceFile>();
  for (const file of await readPackageSources(packageRoot, input.io)) {
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
    manifest: {
      name: manifestResult.manifest.name,
      version: manifestResult.manifest.version,
      target: manifestResult.manifest.target,
    },
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

function isPackageSourcePath(path: string, sourceDir: string): boolean {
  if (!isSupportedSourceFile(path)) {
    return false;
  }

  const relativePath = relative(normalize(sourceDir), normalize(path));
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}
