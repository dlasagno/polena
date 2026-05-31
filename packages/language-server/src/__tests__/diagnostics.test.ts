import { describe, expect, test } from "bun:test";
import {
  analyze,
  analyzePackage,
  type Diagnostic as PolenaDiagnostic,
  type ModuleAnalysis,
} from "@polena/compiler";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver/node";
import { toLspDiagnostics } from "../diagnostics";

describe("LSP diagnostics", () => {
  test("converts Polena spans to zero-based LSP ranges", () => {
    const diagnostics: PolenaDiagnostic[] = [
      {
        severity: "error",
        code: "PLN102",
        message: "Unknown name 'missing'.",
        span: {
          start: { offset: 14, line: 1, column: 15 },
          end: { offset: 21, line: 1, column: 22 },
        },
      },
    ];

    expect(toLspDiagnostics(diagnostics, "file:///example.plna")[0]).toMatchObject({
      code: "PLN102",
      message: "Unknown name 'missing'.",
      range: {
        start: { line: 0, character: 14 },
        end: { line: 0, character: 21 },
      },
    });
  });

  test("moves spanned diagnostic notes into related information", () => {
    const diagnostics: PolenaDiagnostic[] = [
      {
        severity: "error",
        code: "PLN202",
        message: "Expected 'number', got 'string'.",
        span: {
          start: { offset: 20, line: 1, column: 21 },
          end: { offset: 23, line: 1, column: 24 },
        },
        notes: [
          {
            kind: "note",
            message: "expected type declared here",
            span: {
              start: { offset: 7, line: 1, column: 8 },
              end: { offset: 13, line: 1, column: 14 },
            },
          },
          {
            kind: "help",
            message: "make this expression produce the expected type explicitly",
          },
        ],
      },
    ];

    const diagnostic = toLspDiagnostics(diagnostics, "file:///example.plna")[0];

    if (diagnostic === undefined) {
      throw new Error("expected one LSP diagnostic");
    }
    expect(diagnostic.message).toBe(
      "Expected 'number', got 'string'.\nhelp: make this expression produce the expected type explicitly",
    );
    expect(diagnostic.relatedInformation).toEqual([
      {
        location: {
          uri: "file:///example.plna",
          range: {
            start: { line: 0, character: 7 },
            end: { line: 0, character: 13 },
          },
        },
        message: "note: expected type declared here",
      },
    ]);
  });

  test("surfaces object semantic diagnostics from the compiler", () => {
    const result = analyze(
      'type User = { id: string, name: string }; const named = { name: "Ada" }; const user: User = named;',
    );
    const diagnostics = toLspDiagnostics(result.diagnostics, "file:///example.plna");

    expect(diagnostics[0]).toMatchObject({
      code: "PLN202",
      message: "Missing object field 'id'.\nhelp: provide the required object shape explicitly",
      range: {
        start: { line: 0, character: 14 },
        end: { line: 0, character: 16 },
      },
    });
  });

  test("surfaces object syntax diagnostics from the compiler", () => {
    const result = analyze("type User = { id string };");
    const diagnostics = toLspDiagnostics(result.diagnostics, "file:///example.plna");

    expect(diagnostics[0]).toMatchObject({
      code: "PLN012",
      message: "Expected ':' after object type field name.",
      range: {
        start: { line: 0, character: 17 },
        end: { line: 0, character: 23 },
      },
    });
  });

  test("tags unused variables as unnecessary hint diagnostics", () => {
    const result = analyze("fn main(): void { const unused = 1; const used = unused; }");
    const diagnostics = toLspDiagnostics(result.diagnostics, "file:///example.plna", {
      analysis: result,
    });

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Variable 'used' is never used.",
        severity: DiagnosticSeverity.Hint,
        tags: [DiagnosticTag.Unnecessary],
        range: {
          start: { line: 0, character: 42 },
          end: { line: 0, character: 46 },
        },
      }),
    );
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("'unused'"))).toBe(false);
  });

  test("tags unused imports as unnecessary hint diagnostics", () => {
    const indexSource = [
      "import @/users.{type User, greeting, unusedValue as valueAlias} as users;",
      "fn main(user: User): void {",
      "  const message = greeting(user);",
      "  users.greeting(user);",
      "}",
    ].join("\n");
    const usersSource = [
      "export type User = { name: string };",
      "export fn greeting(user: User): string {",
      '  "Hello"',
      "}",
      "export const unusedValue = 1;",
    ].join("\n");
    const packageResult = analyzePackage({
      manifest: { name: "diagnostic-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source: indexSource },
        { path: "/app/src/users.plna", source: usersSource },
      ],
    });
    const current = moduleAnalysis(packageResult.analyses, "@/");
    const diagnostics = toLspDiagnostics(
      current.analysis.diagnostics,
      "file:///app/src/index.plna",
      {
        analysis: current.analysis,
      },
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        message: "Imported value 'valueAlias' is never used.",
        severity: DiagnosticSeverity.Hint,
        tags: [DiagnosticTag.Unnecessary],
      }),
    );
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("'User'"))).toBe(false);
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("'greeting'"))).toBe(false);
    expect(diagnostics.some((diagnostic) => diagnostic.message.includes("'users'"))).toBe(false);
  });
});

function moduleAnalysis(analyses: readonly ModuleAnalysis[], moduleName: string): ModuleAnalysis {
  const analysis = analyses.find((candidate) => candidate.moduleName === moduleName);
  if (analysis === undefined) {
    throw new Error(`expected analysis for ${moduleName}`);
  }
  return analysis;
}
