import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDocumentHighlights, getReferences } from "../references";

describe("LSP references", () => {
  test("returns local references with optional declarations", () => {
    const source = [
      "fn add(input: number): number {",
      "  const next = input + 1;",
      "  next",
      "}",
      "const value = add(1);",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(referenceRanges(document, analysis, source.indexOf("input +"), false)).toEqual([
      rangeForText(document, source, "input", source.indexOf("input +")),
    ]);
    expect(referenceRanges(document, analysis, source.indexOf("input +"), true)).toEqual([
      rangeForText(document, source, "input"),
      rangeForText(document, source, "input", source.indexOf("input +")),
    ]);
    expect(referenceRanges(document, analysis, source.indexOf("add(1)"), true)).toEqual([
      rangeForText(document, source, "add"),
      rangeForText(document, source, "add", source.indexOf("add(1)")),
    ]);
  });

  test("returns document highlights for the current document", () => {
    const source = ["let value = 1;", "value = value + 1;", "const other = 1;"].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(
      getDocumentHighlights(document, analysis, document.positionAt(source.indexOf("value +"))).map(
        (highlight) => highlight.range,
      ),
    ).toEqual([
      rangeForText(document, source, "value"),
      rangeForText(document, source, "value", source.indexOf("value =", source.indexOf("\n"))),
      rangeForText(document, source, "value", source.indexOf("value +")),
    ]);
  });

  test("returns cross-module references for exported symbols", () => {
    const indexSource = [
      "import @/users.{type User, greeting} as users;",
      "fn test(): string {",
      '  const user: User = { name: "Ada" };',
      "  const message = greeting(user);",
      "  users.greeting(user)",
      "}",
    ].join("\n");
    const usersSource = [
      "export type User = { name: string };",
      "export fn greeting(user: User): string {",
      ['  "Hello ', "$", '{user.name}"'].join(""),
      "}",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "references-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source: indexSource },
        { path: "/app/src/users.plna", source: usersSource },
      ],
    });
    const usersDocument = TextDocument.create(
      "file:///app/src/users.plna",
      "polena",
      1,
      usersSource,
    );
    const usersAnalysis = result.analyses.find((analysis) => analysis.moduleName === "@/users");
    const analysesByModuleName = new Map(
      result.analyses.map((analysis) => [analysis.moduleName, analysis]),
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(usersAnalysis).toBeDefined();
    if (usersAnalysis === undefined) {
      return;
    }

    expect(
      getReferences(
        usersDocument,
        usersAnalysis.analysis,
        usersDocument.positionAt(usersSource.indexOf("greeting")),
        { includeDeclaration: true },
        { currentModuleName: "@/users", analysesByModuleName },
      ).map((location) => [location.uri, location.range]),
    ).toEqual([
      ["file:///app/src/users.plna", rangeForText(usersDocument, usersSource, "greeting")],
      [
        "file:///app/src/index.plna",
        rangeForText(
          TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource),
          indexSource,
          "greeting",
        ),
      ],
      [
        "file:///app/src/index.plna",
        rangeForText(
          TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource),
          indexSource,
          "greeting",
          indexSource.indexOf("greeting(user)"),
        ),
      ],
      [
        "file:///app/src/index.plna",
        rangeForText(
          TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource),
          indexSource,
          "greeting",
          indexSource.indexOf("users.greeting"),
        ),
      ],
    ]);
  });
});

function referenceRanges(
  document: TextDocument,
  analysis: ReturnType<typeof analyze>,
  offset: number,
  includeDeclaration: boolean,
) {
  return getReferences(document, analysis, document.positionAt(offset), { includeDeclaration }).map(
    (location) => location.range,
  );
}

function rangeForText(document: TextDocument, source: string, text: string, fromOffset = 0) {
  const offset = source.indexOf(text, fromOffset);
  expect(offset).toBeGreaterThanOrEqual(0);
  return {
    start: document.positionAt(offset),
    end: document.positionAt(offset + text.length),
  };
}
