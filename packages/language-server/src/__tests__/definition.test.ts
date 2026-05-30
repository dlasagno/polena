import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDefinition } from "../definition";

describe("LSP definition", () => {
  test("returns local value, function, type, enum variant, and field definitions", () => {
    const source = [
      "type User = { name: string };",
      "type Color = enum { Red, Green };",
      "fn greet(user: User): string { user.name }",
      'const user: User = { name: "Ada" };',
      "const color: Color = .Red;",
      "const message = greet(user);",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(definitionRange(document, analysis, source.indexOf("greet(user)"))).toEqual(
      rangeForText(document, source, "greet"),
    );
    expect(definitionRange(document, analysis, source.lastIndexOf("user);"))).toEqual(
      rangeForText(document, source, "user", source.indexOf("const user")),
    );
    expect(
      definitionRange(document, analysis, source.indexOf("User", source.indexOf("const user"))),
    ).toEqual(rangeForText(document, source, "User"));
    expect(
      definitionRange(document, analysis, source.indexOf("name", source.indexOf("user.name"))),
    ).toEqual(rangeForText(document, source, "name"));
    expect(definitionRange(document, analysis, source.lastIndexOf("Red"))).toEqual(
      rangeForText(document, source, "Red"),
    );
  });

  test("returns cross-module definitions for imports and references", () => {
    const indexSource = [
      "import @/users.{type User, greeting} as users;",
      "fn test(): string {",
      '  const user: User = { name: "Ada" };',
      "  const message = greeting(user);",
      "  const userName = user.name;",
      "  users.greeting(user)",
      "}",
    ].join("\n");
    const usersSource = [
      "//! User helpers.",
      "export type User = {",
      "  name: string,",
      "};",
      "export fn greeting(user: User): string {",
      ['  "Hello ', "$", '{user.name}"'].join(""),
      "}",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "definition-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source: indexSource },
        { path: "/app/src/users.plna", source: usersSource },
      ],
    });
    const document = TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource);
    const current = result.analyses.find((analysis) => analysis.moduleName === "@/");
    const analysesByModuleName = new Map(
      result.analyses.map((analysis) => [analysis.moduleName, analysis]),
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(current).toBeDefined();
    if (current === undefined) {
      return;
    }

    const context = { analysesByModuleName };
    expect(definition(document, current.analysis, indexSource.indexOf("@/users"), context)).toEqual(
      {
        uri: "file:///app/src/users.plna",
        range: rangeForText(
          TextDocument.create("file:///app/src/users.plna", "polena", 1, usersSource),
          usersSource,
          "//! User helpers.",
        ),
      },
    );
    expect(
      definition(document, current.analysis, indexSource.indexOf("User,"), context),
    ).toMatchObject({
      uri: "file:///app/src/users.plna",
      range: rangeForText(
        TextDocument.create("file:///app/src/users.plna", "polena", 1, usersSource),
        usersSource,
        "User",
        usersSource.indexOf("export type User"),
      ),
    });
    expect(
      definition(document, current.analysis, indexSource.indexOf("greeting}"), context),
    ).toMatchObject({
      uri: "file:///app/src/users.plna",
      range: rangeForText(
        TextDocument.create("file:///app/src/users.plna", "polena", 1, usersSource),
        usersSource,
        "greeting",
      ),
    });
    expect(
      definition(document, current.analysis, indexSource.lastIndexOf("name"), context),
    ).toMatchObject({
      uri: "file:///app/src/users.plna",
      range: rangeForText(
        TextDocument.create("file:///app/src/users.plna", "polena", 1, usersSource),
        usersSource,
        "name",
      ),
    });
    expect(
      definition(
        document,
        current.analysis,
        indexSource.indexOf("greeting", indexSource.lastIndexOf("users.")),
        context,
      ),
    ).toMatchObject({
      uri: "file:///app/src/users.plna",
      range: rangeForText(
        TextDocument.create("file:///app/src/users.plna", "polena", 1, usersSource),
        usersSource,
        "greeting",
      ),
    });
  });

  test("returns null for unknown names and punctuation", () => {
    const source = 'const message = missing("Hello");';
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(definition(document, analysis, source.indexOf("missing"))).toBeNull();
    expect(definition(document, analysis, source.indexOf("="))).toBeNull();
  });
});

function definition(
  document: TextDocument,
  analysis: ReturnType<typeof analyze>,
  offset: number,
  context?: Parameters<typeof getDefinition>[3],
) {
  return getDefinition(document, analysis, document.positionAt(offset), context);
}

function definitionRange(
  document: TextDocument,
  analysis: ReturnType<typeof analyze>,
  offset: number,
): ReturnType<typeof rangeForText> | undefined {
  return definition(document, analysis, offset)?.range;
}

function rangeForText(document: TextDocument, source: string, text: string, fromOffset = 0) {
  const offset = source.indexOf(text, fromOffset);
  expect(offset).toBeGreaterThanOrEqual(0);
  return {
    start: document.positionAt(offset),
    end: document.positionAt(offset + text.length),
  };
}
