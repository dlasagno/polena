import { describe, expect, test } from "bun:test";
import { analyze } from "@polena/compiler";
import { SymbolKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDocumentSymbols } from "../document-symbols";

describe("LSP document symbols", () => {
  test("returns top-level declarations with nested fields and enum variants", () => {
    const source = [
      "type User = {",
      "  name: string,",
      "  age: number,",
      "};",
      "type Status = enum { Ready, Failed(string) };",
      "fn greet(user: User): string { user.name }",
      'const user: User = { name: "Ada", age: 37 };',
      "let count = 0;",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const symbols = getDocumentSymbols(document, analyze(source));

    expect(symbols.map((symbol) => [symbol.name, symbol.detail, symbol.kind])).toEqual([
      ["User", "= { name: string, age: number }", SymbolKind.Struct],
      ["Status", "= enum { Ready, Failed(string) }", SymbolKind.Enum],
      ["greet", "(user: User): string", SymbolKind.Function],
      ["user", ": User", SymbolKind.Constant],
      ["count", ": number", SymbolKind.Variable],
    ]);

    expect(
      symbols[0]?.children?.map((symbol) => [symbol.name, symbol.detail, symbol.kind]),
    ).toEqual([
      ["name", ": string", SymbolKind.Field],
      ["age", ": number", SymbolKind.Field],
    ]);
    expect(
      symbols[1]?.children?.map((symbol) => [symbol.name, symbol.detail, symbol.kind]),
    ).toEqual([
      ["Ready", "Status.Ready", SymbolKind.EnumMember],
      ["Failed", "Status.Failed(string)", SymbolKind.EnumMember],
    ]);
  });

  test("uses source ranges for symbol selection", () => {
    const source = "fn value(): number { 1 }";
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const symbol = getDocumentSymbols(document, analyze(source))[0];

    expect(symbol).toMatchObject({
      name: "value",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: source.length },
      },
      selectionRange: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 8 },
      },
    });
  });
});
