import { describe, expect, test } from "bun:test";
import { analyze } from "@polena/compiler";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getHover } from "../hover";

describe("LSP hover", () => {
  test("returns expression types and null for whitespace", () => {
    const source = "const x = 1 + 2;\nconst y = x;";
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);

    expect(
      getHover(document, analysis, document.positionAt(source.lastIndexOf("x"))),
    ).toMatchObject({
      contents: { value: "number" },
    });
    expect(getHover(document, analysis, document.positionAt(source.indexOf("+")))).toMatchObject({
      contents: { value: "number" },
    });
    expect(getHover(document, analysis, document.positionAt(source.indexOf("\n")))).toBeNull();
  });
});
