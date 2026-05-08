import { describe, expect, test } from "bun:test";
import { renderDiagnostic } from "../diagnostic-renderer";

describe("diagnostic renderer", () => {
  test("renders a source snippet with a code, label, and help", () => {
    const source = "if 123 {\n";
    const rendered = renderDiagnostic({
      diagnostic: {
        severity: "error",
        code: "PLN202",
        message: "Expected 'boolean', got 'number'.",
        span: {
          start: { offset: 3, line: 1, column: 4 },
          end: { offset: 6, line: 1, column: 7 },
        },
        label: "condition must be a boolean",
        notes: [
          {
            kind: "help",
            message: "compare this value explicitly or produce a boolean expression",
          },
        ],
      },
      source,
      fileName: "examples/basic.plna",
    });

    expect(rendered).toBe(
      [
        "error[PLN202]: Expected 'boolean', got 'number'.",
        "  --> examples/basic.plna:1:4",
        "  |",
        "1 | if 123 {",
        "  |    ^^^ condition must be a boolean",
        "  |",
        "help: compare this value explicitly or produce a boolean expression",
      ].join("\n"),
    );
  });

  test("renders diagnostics without source spans", () => {
    const rendered = renderDiagnostic({
      diagnostic: {
        severity: "error",
        message: "Something went wrong.",
      },
      source: "",
      fileName: "<unknown>",
    });

    expect(rendered).toBe("error: Something went wrong.");
  });
});
