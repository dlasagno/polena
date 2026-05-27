import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getRenameEdit, prepareRename } from "../rename";

describe("LSP rename", () => {
  test("prepares and edits local symbol renames", () => {
    const source = [
      "fn add(input: number): number {",
      "  const next = input + 1;",
      "  next",
      "}",
      "const value = add(1);",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(
      prepareRename(document, analysis, document.positionAt(source.indexOf("input +"))),
    ).toEqual({
      range: rangeForText(document, source, "input", source.indexOf("input +")),
      placeholder: "input",
    });
    expect(
      getRenameEdit(document, analysis, document.positionAt(source.indexOf("input +")), "amount"),
    ).toEqual({
      changes: {
        "file:///example.plna": [
          { range: rangeForText(document, source, "input"), newText: "amount" },
          {
            range: rangeForText(document, source, "input", source.indexOf("input +")),
            newText: "amount",
          },
        ],
      },
    });
  });

  test("edits cross-module exported symbol renames", () => {
    const indexSource = [
      "import @/users.{type User, greeting};",
      "fn test(): string {",
      '  const user: User = { name: "Ada" };',
      "  greeting(user)",
      "}",
    ].join("\n");
    const usersSource = [
      "export type User = { name: string };",
      "export fn greeting(user: User): string {",
      ['  "Hello ', "$", '{user.name}"'].join(""),
      "}",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "rename-test", version: "0.1.0", target: "library" },
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
      getRenameEdit(
        usersDocument,
        usersAnalysis.analysis,
        usersDocument.positionAt(usersSource.indexOf("greeting")),
        "salute",
        { currentModuleName: "@/users", analysesByModuleName },
      ),
    ).toEqual({
      changes: {
        "file:///app/src/users.plna": [
          { range: rangeForText(usersDocument, usersSource, "greeting"), newText: "salute" },
        ],
        "file:///app/src/index.plna": [
          {
            range: rangeForText(
              TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource),
              indexSource,
              "greeting",
            ),
            newText: "salute",
          },
          {
            range: rangeForText(
              TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource),
              indexSource,
              "greeting",
              indexSource.indexOf("greeting(user)"),
            ),
            newText: "salute",
          },
        ],
      },
    });
  });

  test("rejects unsupported targets and invalid new names", () => {
    const source = 'const message = println("Hello");';
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(
      prepareRename(document, analysis, document.positionAt(source.indexOf("println"))),
    ).toBeNull();
    expect(
      getRenameEdit(document, analysis, document.positionAt(source.indexOf("message")), "while"),
    ).toBeNull();
    expect(
      getRenameEdit(document, analysis, document.positionAt(source.indexOf("message")), "1bad"),
    ).toBeNull();
  });
});

function rangeForText(document: TextDocument, source: string, text: string, fromOffset = 0) {
  const offset = source.indexOf(text, fromOffset);
  expect(offset).toBeGreaterThanOrEqual(0);
  return {
    start: document.positionAt(offset),
    end: document.positionAt(offset + text.length),
  };
}
