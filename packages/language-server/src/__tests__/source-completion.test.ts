import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getSourceCompletions } from "../source-completion";

describe("source completions", () => {
  test("returns visible values, types, imports, locals, and prelude names", () => {
    const source = [
      "import @/users.{type User, greeting} as users;",
      "type Status = enum { Ready };",
      "fn test(input: number): number {",
      "  const next = input + 1;",
      "  ",
      "}",
    ].join("\n");
    const document = TextDocument.create("file:///app/src/index.plna", "polena", 1, source);
    const result = analyzePackage({
      manifest: { name: "completion-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source },
        {
          path: "/app/src/users.plna",
          source:
            'export type User = { name: string };\nexport fn greeting(user: User): string { "" }',
        },
      ],
    });
    const current = result.analyses.find((analysis) => analysis.moduleName === "@/");
    expect(current).toBeDefined();
    if (current === undefined) {
      return;
    }

    const completions = getSourceCompletions(
      document,
      current.analysis,
      document.positionAt(source.indexOf("  \n}")),
    );

    expect(completion(completions, "input")).toMatchObject({
      kind: CompletionItemKind.Variable,
      detail: "number",
    });
    expect(completion(completions, "next")).toMatchObject({
      kind: CompletionItemKind.Constant,
    });
    expect(completion(completions, "Status")).toMatchObject({
      kind: CompletionItemKind.Enum,
    });
    expect(completion(completions, "User")).toMatchObject({
      kind: CompletionItemKind.TypeParameter,
      detail: "imported from @/users",
    });
    expect(completion(completions, "greeting")).toMatchObject({
      kind: CompletionItemKind.Value,
      detail: "imported from @/users",
    });
    expect(completion(completions, "users")).toMatchObject({
      kind: CompletionItemKind.Module,
      detail: "@/users",
    });
    expect(completion(completions, "println")).toMatchObject({
      kind: CompletionItemKind.Function,
      detail: "prelude",
    });
  });

  test("returns object field and array property completions after dot", () => {
    const source = [
      "type User = { name: string, age: number };",
      'const user: User = { name: "Ada", age: 37 };',
      "const names: []string = [];",
      "const userName = user.",
      "const count = names.",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(
      getSourceCompletions(
        document,
        analysis,
        document.positionAt(source.indexOf("user.") + "user.".length),
      ).map((item) => [item.label, item.kind, item.detail]),
    ).toEqual([
      ["name", CompletionItemKind.Field, "string"],
      ["age", CompletionItemKind.Field, "number"],
    ]);
    expect(
      getSourceCompletions(
        document,
        analysis,
        document.positionAt(source.indexOf("names.") + "names.".length),
      ).map((item) => [item.label, item.kind, item.detail]),
    ).toEqual([["length", CompletionItemKind.Property, "number"]]);
  });

  test("returns contextual enum variant completions after shorthand dot", () => {
    const source = "type Color = enum { Red, Green(number) }; const color: Color = .";
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(
      getSourceCompletions(document, analysis, document.positionAt(source.length)).map((item) => [
        item.label,
        item.kind,
        item.detail,
      ]),
    ).toEqual([
      ["Red", CompletionItemKind.EnumMember, "Color"],
      ["Green", CompletionItemKind.EnumMember, "Color.Green(number)"],
    ]);
  });

  test("returns type-focused completions in type positions", () => {
    const source = [
      "type Status = enum { Ready };",
      "type Box<T> = { value: T };",
      "fn test(input: ",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);
    const completions = getSourceCompletions(
      document,
      analysis,
      document.positionAt(source.length),
    );

    expect(completion(completions, "Status")).toMatchObject({
      kind: CompletionItemKind.Enum,
    });
    expect(completion(completions, "Box")).toMatchObject({
      kind: CompletionItemKind.Struct,
    });
    expect(completion(completions, "number")).toMatchObject({
      kind: CompletionItemKind.Keyword,
    });
    expect(completion(completions, "Option")).toMatchObject({
      kind: CompletionItemKind.Enum,
      detail: "prelude",
    });
    expect(completion(completions, "[]")).toMatchObject({
      detail: "array type",
      insertText: "[]$1",
      insertTextFormat: InsertTextFormat.Snippet,
    });
    expect(completion(completions, "enum")).toMatchObject({
      detail: "enum type",
      insertText: "enum { $1 }",
      insertTextFormat: InsertTextFormat.Snippet,
    });
    expect(completion(completions, "println")).toBeUndefined();
    expect(completion(completions, "input")).toBeUndefined();
  });

  test("returns expression-focused completions without type names", () => {
    const source = [
      "type Status = enum { Ready };",
      "fn test(input: number): number {",
      "  const value = ",
      "}",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);
    const completions = getSourceCompletions(
      document,
      analysis,
      document.positionAt(source.indexOf("  const value = ") + "  const value = ".length),
    );

    expect(completion(completions, "input")).toMatchObject({
      kind: CompletionItemKind.Variable,
    });
    expect(completion(completions, "println")).toMatchObject({
      kind: CompletionItemKind.Function,
      detail: "prelude",
    });
    expect(completion(completions, "true")).toMatchObject({
      kind: CompletionItemKind.Keyword,
    });
    expect(completion(completions, "Status")).toBeUndefined();
    expect(completion(completions, "number")).toBeUndefined();
  });

  test("returns snippets for statement and top-level keywords", () => {
    const source = ["fn test(): void {", "  ", "}"].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);
    const statementCompletions = getSourceCompletions(
      document,
      analysis,
      document.positionAt(source.indexOf("  \n")),
    );

    expect(completion(statementCompletions, "const")).toMatchObject({
      kind: CompletionItemKind.Keyword,
      insertText: `const ${snippetPlaceholder("1:name")} = $0;`,
      insertTextFormat: InsertTextFormat.Snippet,
    });
    expect(completion(statementCompletions, "if")).toMatchObject({
      kind: CompletionItemKind.Keyword,
      insertText: "if $1 {\n  $0\n}",
      insertTextFormat: InsertTextFormat.Snippet,
    });

    const topLevelSource = "";
    const topLevelDocument = TextDocument.create(
      "file:///example.plna",
      "polena",
      1,
      topLevelSource,
    );
    const topLevelCompletions = getSourceCompletions(topLevelDocument, analyze(topLevelSource), {
      line: 0,
      character: 0,
    });

    expect(completion(topLevelCompletions, "fn")).toMatchObject({
      kind: CompletionItemKind.Keyword,
      insertText: `fn ${snippetPlaceholder("1:name")}(${snippetPlaceholder(
        "2",
      )}): ${snippetPlaceholder("3:void")} {\n  $0\n}`,
      insertTextFormat: InsertTextFormat.Snippet,
    });
    expect(completion(topLevelCompletions, "import")).toMatchObject({
      kind: CompletionItemKind.Keyword,
      insertText: `import @/${snippetPlaceholder("1:module")};`,
      insertTextFormat: InsertTextFormat.Snippet,
    });
  });

  test("uses package analysis for qualified imported member completions", () => {
    const indexSource = ["import @/users as users;", "fn test(): string {", "  users.", "}"].join(
      "\n",
    );
    const usersSource = [
      "export const version = 1;",
      "export fn greeting(): string {",
      '  "Hello"',
      "}",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "completion-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source: indexSource },
        { path: "/app/src/users.plna", source: usersSource },
      ],
    });
    const current = result.analyses.find((analysis) => analysis.moduleName === "@/");
    const document = TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource);

    expect(current).toBeDefined();
    if (current === undefined) {
      return;
    }

    expect(
      getSourceCompletions(
        document,
        current.analysis,
        document.positionAt(indexSource.indexOf("users.") + "users.".length),
      ).map((item) => [item.label, item.kind]),
    ).toEqual([
      ["version", CompletionItemKind.Field],
      ["greeting", CompletionItemKind.Field],
    ]);
  });
});

function completion(completions: readonly { readonly label: string }[], label: string) {
  return completions.find((item) => item.label === label);
}

function snippetPlaceholder(value: string): string {
  return `\${${value}}`;
}
