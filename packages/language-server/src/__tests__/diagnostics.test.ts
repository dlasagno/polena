import { describe, expect, test } from "bun:test";
import type { Diagnostic as PolenaDiagnostic } from "@polena/compiler";
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
});
