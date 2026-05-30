import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getSignatureHelp } from "../signature-help";

describe("signature help", () => {
  test("returns local function signature help with active parameter", () => {
    const source = [
      "/// Adds two numbers.",
      "fn add(left: number, right: number): number { left + right }",
      "const value = add(1, );",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);
    const help = getSignatureHelp(document, analysis, document.positionAt(source.indexOf(");")));

    expect(help).toEqual({
      signatures: [
        {
          label: "add(left: number, right: number): number",
          parameters: [{ label: "left: number" }, { label: "right: number" }],
          documentation: "Adds two numbers.",
        },
      ],
      activeSignature: 0,
      activeParameter: 1,
    });
  });

  test("uses the innermost call expression", () => {
    const source = [
      "fn add(left: number, right: number): number { left + right }",
      "fn wrap(value: number): number { value }",
      "const value = wrap(add(1, ));",
    ].join("\n");
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);
    const help = getSignatureHelp(document, analysis, document.positionAt(source.indexOf("))")));

    expect(help?.signatures[0]?.label).toBe("add(left: number, right: number): number");
    expect(help?.activeParameter).toBe(1);
  });

  test("uses package context for imported function declarations", () => {
    const indexSource = ["import @/math.{add};", "const value = add(1, );"].join("\n");
    const mathSource = [
      "/// Adds two numbers.",
      "export fn add(left: number, right: number): number { left + right }",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "signature-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source: indexSource },
        { path: "/app/src/math.plna", source: mathSource },
      ],
    });
    const current = result.analyses.find((analysis) => analysis.moduleName === "@/");
    const analysesByModuleName = new Map(
      result.analyses.map((analysis) => [analysis.moduleName, analysis]),
    );
    const document = TextDocument.create("file:///app/src/index.plna", "polena", 1, indexSource);

    expect(current).toBeDefined();
    if (current === undefined) {
      return;
    }

    const help = getSignatureHelp(
      document,
      current.analysis,
      document.positionAt(indexSource.indexOf(");")),
      { analysesByModuleName },
    );

    expect(help?.signatures[0]).toEqual({
      label: "add(left: number, right: number): number",
      parameters: [{ label: "left: number" }, { label: "right: number" }],
      documentation: "Adds two numbers.",
    });
  });

  test("returns signature help for local functions without docs", () => {
    const source = 'fn println(message: string): void {}\nconst value = println("Hello");';
    const document = TextDocument.create("file:///example.plna", "polena", 1, source);
    const analysis = analyze(source);
    const help = getSignatureHelp(document, analysis, document.positionAt(source.lastIndexOf(")")));

    expect(help?.signatures[0]).toEqual({
      label: "println(message: string): void",
      parameters: [{ label: "message: string" }],
      documentation: undefined,
    });
    expect(help?.activeParameter).toBe(0);
  });
});
