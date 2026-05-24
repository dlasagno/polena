import { isAbsolute, normalize, relative } from "node:path";
import type { analyzePackageForDocument, OpenDocumentSnapshot } from "./package-analysis";

type PackageAnalysis = Awaited<ReturnType<typeof analyzePackageForDocument>>;

export class PackageAnalysisCache {
  private readonly entries = new Map<
    string,
    {
      readonly key: string;
      readonly analysis: PackageAnalysis;
    }
  >();

  public get(packageRoot: string, snapshots: readonly OpenDocumentSnapshot[]): PackageAnalysis {
    const entry = this.entries.get(normalize(packageRoot));
    const key = packageAnalysisCacheKey(packageRoot, snapshots);
    return entry?.key === key ? entry.analysis : undefined;
  }

  public set(
    packageRoot: string,
    snapshots: readonly OpenDocumentSnapshot[],
    analysis: PackageAnalysis,
  ): void {
    this.entries.set(normalize(packageRoot), {
      key: packageAnalysisCacheKey(packageRoot, snapshots),
      analysis,
    });
  }

  public invalidatePath(path: string): void {
    for (const packageRoot of this.entries.keys()) {
      if (isPathWithin(path, packageRoot)) {
        this.entries.delete(packageRoot);
      }
    }
  }
}

export function packageAnalysisCacheKey(
  packageRoot: string,
  snapshots: readonly OpenDocumentSnapshot[],
): string {
  const normalizedRoot = normalize(packageRoot);
  return snapshots
    .filter((snapshot) => isPathWithin(snapshot.path, normalizedRoot))
    .map((snapshot) => `${normalize(snapshot.path)}@${snapshot.version ?? -1}`)
    .sort()
    .join("|");
}

function isPathWithin(path: string, root: string): boolean {
  const relativePath = relative(normalize(root), normalize(path));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
