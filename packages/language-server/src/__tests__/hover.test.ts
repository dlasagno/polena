import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getHover } from "../hover";

describe("LSP hover", () => {
  test("returns module doc hovers at the top of the file", () => {
    const source = ["//! Module docs.", "//!", "//! More module docs.", "const answer = 42;"].join(
      "\n",
    );
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(hoverText(document, analysis, source.indexOf("Module"))).toBe(
      "Module docs.\n\nMore module docs.",
    );
    expect(hoverText(document, analysis, source.indexOf("answer"))).toBe(
      "```polena\nconst answer: number\n```",
    );
  });

  test("returns useful expression hovers and null for punctuation", () => {
    const source = "const x = 1 + 2;\nconst y = x;";
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(hoverText(document, analysis, source.lastIndexOf("x"))).toBe(
      "```polena\nconst x: number\n```",
    );
    expect(getHover(document, analysis, document.positionAt(source.indexOf("+")))).toBeNull();
    expect(getHover(document, analysis, document.positionAt(source.indexOf("\n")))).toBeNull();
  });

  test("does not hover on boolean operators or keywords", () => {
    const source = "const value = if ready { a and b } else { a };";
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(getHover(document, analysis, document.positionAt(source.indexOf("if")))).toBeNull();
    expect(getHover(document, analysis, document.positionAt(source.indexOf("and")))).toBeNull();
  });

  test("returns declaration, function, type, enum, and field hovers", () => {
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

    expect(hoverText(document, analysis, source.indexOf("greet("))).toBe(
      "```polena\nfn greet(user: User): string\n```",
    );
    expect(hoverText(document, analysis, source.indexOf("user:"))).toBe(
      "```polena\nuser: User\n```",
    );
    expect(hoverText(document, analysis, source.indexOf("User", source.indexOf("user:")))).toBe(
      "```polena\ntype User = { name: string }\n```",
    );
    expect(hoverText(document, analysis, source.indexOf("name"))).toBe(
      "```polena\nname: string\n```",
    );
    expect(hoverText(document, analysis, source.lastIndexOf("name"))).toBe(
      "```polena\nname: string\n```",
    );
    expect(hoverText(document, analysis, source.indexOf("Red"))).toBe(
      "```polena\nColor.Red: Color\n```",
    );
    expect(hoverText(document, analysis, source.lastIndexOf("Red"))).toBe(
      "```polena\nColor.Red: Color\n```",
    );
  });

  test("returns enum payload and pattern binding hovers", () => {
    const source = [
      "type Message = enum { Move(number, number), Quit };",
      "const message = Message.Move(1, 2);",
      "const label = match message {",
      "  .Move(x, y) => x,",
      "  .Quit => 0,",
      "};",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(hoverText(document, analysis, source.indexOf("Message"))).toBe(
      "```polena\ntype Message = enum { Move(number, number), Quit }\n```",
    );
    expect(hoverText(document, analysis, source.indexOf("Move"))).toBe(
      "```polena\nMessage.Move(number, number): Message\n```",
    );
    expect(hoverText(document, analysis, source.indexOf("x,"))).toBe("```polena\nx: number\n```");
    expect(hoverText(document, analysis, source.lastIndexOf("x"))).toBe(
      "```polena\nx: number\n```",
    );
  });

  test("includes declaration doc comments in hovers", () => {
    const source = [
      "/// A user-facing greeting.",
      "///",
      "/// Supports Markdown **emphasis**.",
      'fn greet(name: string): string { "Hello, $' + '{name}" }',
      'const message = greet("Ada");',
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(hoverText(document, analysis, source.indexOf("greet("))).toBe(
      "```polena\nfn greet(name: string): string\n```\n\nA user-facing greeting.\n\nSupports Markdown **emphasis**.",
    );
    expect(hoverText(document, analysis, source.lastIndexOf("greet"))).toBe(
      "```polena\nfn greet(name: string): string\n```\n\nA user-facing greeting.\n\nSupports Markdown **emphasis**.",
    );
  });

  test("includes field and enum variant doc comments in hovers", () => {
    const source = [
      "type User = {",
      "  /// Display name.",
      "  name: string,",
      "};",
      "type Status = enum {",
      "  /// Ready to run.",
      "  Ready,",
      "};",
      'const user: User = { name: "Ada" };',
      "const userName = user.name;",
      "const status: Status = .Ready;",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(hoverText(document, analysis, source.indexOf("name:"))).toBe(
      "```polena\nname: string\n```\n\nDisplay name.",
    );
    expect(hoverText(document, analysis, source.lastIndexOf("name;"))).toBe(
      "```polena\nname: string\n```\n\nDisplay name.",
    );
    expect(hoverText(document, analysis, source.indexOf("Ready,"))).toBe(
      "```polena\nStatus.Ready: Status\n```\n\nReady to run.",
    );
    expect(hoverText(document, analysis, source.lastIndexOf("Ready"))).toBe(
      "```polena\nStatus.Ready: Status\n```\n\nReady to run.",
    );
  });

  test("uses package context for imported member hovers", () => {
    const indexSource = [
      "import @/users.{type Color, type User, greeting} as users;",
      "fn test(): string {",
      '  const user: User = { name: "Ada" };',
      "  const message = greeting(user);",
      "  const userName = user.name;",
      "  const color: Color = .Red;",
      "  users.greeting(user)",
      "}",
    ].join("\n");
    const usersSource = [
      "export type User = {",
      "  /// Display name.",
      "  name: string,",
      "};",
      "export type Color = enum {",
      "  /// Primary color.",
      "  Red,",
      "};",
      "/// Builds a greeting.",
      "export fn greeting(user: User): string {",
      ['  "Hello ', "$", '{user.name}"'].join(""),
      "}",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "hover-test", version: "0.1.0", target: "library" },
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
    expect(
      hoverText(
        document,
        current.analysis,
        indexSource.indexOf("User", indexSource.indexOf("const user")),
        context,
      ),
    ).toBe("```polena\ntype User = { name: string }\n```");
    expect(
      hoverText(document, current.analysis, indexSource.indexOf("greeting(user)"), context),
    ).toBe("```polena\nfn greeting(user: User): string\n```\n\nBuilds a greeting.");
    expect(hoverText(document, current.analysis, indexSource.lastIndexOf("name"), context)).toBe(
      "```polena\nname: string\n```\n\nDisplay name.",
    );
    expect(hoverText(document, current.analysis, indexSource.lastIndexOf("Red"), context)).toBe(
      "```polena\nColor.Red: Color\n```\n\nPrimary color.",
    );
    expect(
      hoverText(
        document,
        current.analysis,
        indexSource.indexOf("greeting", indexSource.lastIndexOf("users.")),
        context,
      ),
    ).toBe("```polena\nfn greeting(user: User): string\n```\n\nBuilds a greeting.");
  });
});

function hoverText(
  document: TextDocument,
  analysis: ReturnType<typeof analyze>,
  offset: number,
  context?: Parameters<typeof getHover>[3],
): string | undefined {
  const contents = getHover(document, analysis, document.positionAt(offset), context)?.contents;
  if (contents === undefined || typeof contents === "string" || Array.isArray(contents)) {
    return undefined;
  }

  return contents.value;
}
