import { describe, expect, test } from "bun:test";
import { analyze, type Diagnostic as PolenaDiagnostic } from "@polena/compiler";
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
});
