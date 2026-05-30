import { describe, expect, test } from "bun:test";
import { PackageAnalysisCache, packageAnalysisCacheKey } from "../package-analysis-cache";
import type { OpenDocumentSnapshot, PackageDiagnostics } from "../package-analysis";

describe("package analysis cache", () => {
  test("keys package analysis by in-package open document versions", () => {
    const snapshots: OpenDocumentSnapshot[] = [
      { uri: "file:///app/src/users.plna", path: "/app/src/users.plna", version: 3, text: "" },
      { uri: "file:///app/src/index.plna", path: "/app/src/index.plna", version: 1, text: "" },
      { uri: "file:///other/src/index.plna", path: "/other/src/index.plna", version: 9, text: "" },
    ];

    expect(packageAnalysisCacheKey("/app", snapshots).replaceAll("\\", "/")).toMatch(
      /^\/app\/src\/index\.plna@1:[0-9a-f]+\|\/app\/src\/users\.plna@3:[0-9a-f]+$/,
    );
  });

  test("returns cached analysis until an in-package version or text changes", () => {
    const cache = new PackageAnalysisCache();
    const analysis = packageAnalysis("/app");
    const snapshots: OpenDocumentSnapshot[] = [
      {
        uri: "file:///app/src/index.plna",
        path: "/app/src/index.plna",
        version: 1,
        text: "one",
      },
    ];

    cache.set("/app", snapshots, analysis);

    expect(cache.get("/app", snapshots)).toBe(analysis);
    expect(
      cache.get("/app", [
        {
          uri: "file:///app/src/index.plna",
          path: "/app/src/index.plna",
          version: 2,
          text: "one",
        },
      ]),
    ).toBeUndefined();
    expect(
      cache.get("/app", [
        {
          uri: "file:///app/src/index.plna",
          path: "/app/src/index.plna",
          version: 1,
          text: "two",
        },
      ]),
    ).toBeUndefined();
  });

  test("invalidates only packages containing the changed path", () => {
    const cache = new PackageAnalysisCache();
    const appAnalysis = packageAnalysis("/app");
    const otherAnalysis = packageAnalysis("/other");
    const appSnapshots: OpenDocumentSnapshot[] = [
      { uri: "file:///app/src/index.plna", path: "/app/src/index.plna", version: 1, text: "" },
    ];
    const otherSnapshots: OpenDocumentSnapshot[] = [
      {
        uri: "file:///other/src/index.plna",
        path: "/other/src/index.plna",
        version: 1,
        text: "",
      },
    ];

    cache.set("/app", appSnapshots, appAnalysis);
    cache.set("/other", otherSnapshots, otherAnalysis);
    cache.invalidatePath("/app/src/index.plna");

    expect(cache.get("/app", appSnapshots)).toBeUndefined();
    expect(cache.get("/other", otherSnapshots)).toBe(otherAnalysis);
  });
});

function packageAnalysis(packageRoot: string): PackageDiagnostics {
  return {
    packageRoot,
    diagnosticsByUri: new Map(),
    analysesByUri: new Map(),
    analysesByModuleName: new Map(),
  };
}
