import { describe, expect, test } from "bun:test";
import { analyze } from "@polena/compiler";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getHover } from "../hover";

describe("LSP hover", () => {
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
});

function hoverText(
  document: TextDocument,
  analysis: ReturnType<typeof analyze>,
  offset: number,
): string | undefined {
  const contents = getHover(document, analysis, document.positionAt(offset))?.contents;
  if (contents === undefined || typeof contents === "string" || Array.isArray(contents)) {
    return undefined;
  }

  return contents.value;
}
