import { describe, expect, test } from "bun:test";
import type { Diagnostic } from "../diagnostic";
import { DiagnosticCode } from "../diagnostic-codes";
import { analyze, lex } from "../compiler";

type DiagnosticSummary = {
  readonly code: string;
  readonly message: string;
  readonly label?: string;
  readonly span: {
    readonly start: {
      readonly offset: number;
      readonly line: number;
      readonly column: number;
    };
    readonly end: {
      readonly offset: number;
      readonly line: number;
      readonly column: number;
    };
  };
  readonly notes?: readonly {
    readonly kind?: "note" | "help";
    readonly message: string;
  }[];
};

describe("diagnostic regressions", () => {
  test("reports invalid characters with a stable code, span, and label", () => {
    const result = lex("const value = @;");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.UnexpectedCharacter,
      message: "Unexpected character '@'.",
      label: "this character is not part of Polena syntax",
      span: span(14, 1, 15, 15, 1, 16),
    });
  });

  test("reports unterminated strings with actionable help", () => {
    const result = lex('const value = "hello');

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.UnterminatedString,
      message: "Unterminated string literal.",
      label: "string literal starts here but is not closed",
      span: span(14, 1, 15, 20, 1, 21),
      notes: [{ kind: "help", message: 'add a closing `"` before the end of the file' }],
    });
  });

  test("reports missing tokens at the parser recovery point", () => {
    const result = analyze("const value = 1");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected ';' after variable declaration.",
      label: "parser was looking here",
      span: span(15, 1, 16, 15, 1, 16),
    });
  });

  test("reports missing expressions without a follow-up semicolon diagnostic", () => {
    const result = analyze("const value = ;");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ExpectedExpression,
      message: "Expected an expression.",
      label: "expected an expression here",
      span: span(14, 1, 15, 15, 1, 16),
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  test("reports unknown names with stable help text", () => {
    const result = analyze("const value = missing;");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.UnknownName,
      message: "Unknown name 'missing'.",
      label: "no value with this name is in scope",
      span: span(14, 1, 15, 21, 1, 22),
      notes: [
        {
          kind: "help",
          message: "declare it before using it, or check for a spelling mistake",
        },
      ],
    });
  });

  test("reports type mismatches at the expression that produced the wrong type", () => {
    const result = analyze('const value: number = "x";');

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.TypeMismatch,
      message: "Expected 'number', got 'string'.",
      label: "expected 'number' here",
      span: span(22, 1, 23, 25, 1, 26),
      notes: [
        {
          kind: "help",
          message: "make this expression produce the expected type explicitly",
        },
      ],
    });
  });

  test("reports assignment to const bindings at the assigned name", () => {
    const result = analyze("const count = 1;\ncount = 2;");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.CannotAssign,
      message: "Cannot assign to 'count'.",
      label: "this binding is not mutable",
      span: span(17, 2, 1, 22, 2, 6),
      notes: [{ kind: "help", message: "only 'let' bindings may be reassigned" }],
    });
  });

  test("reports function arity errors at the call expression", () => {
    const result = analyze(`
fn add(a: number, b: number): number {
  a + b
}

const value = add(1);
`);

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.WrongArgumentCount,
      message: "Expected 2 argument(s), got 1.",
      label: "wrong number of arguments in this call",
      span: span(65, 6, 15, 71, 6, 21),
    });
  });
});

function expectDiagnostic(actual: Diagnostic | undefined, expected: DiagnosticSummary): void {
  expect(actual).toBeDefined();
  expect(actual).toMatchObject({
    severity: "error",
    code: expected.code,
    message: expected.message,
    label: expected.label,
    span: expected.span,
  });

  if (expected.notes !== undefined) {
    expect(actual?.notes).toEqual(expected.notes);
  }
}

function span(
  startOffset: number,
  startLine: number,
  startColumn: number,
  endOffset: number,
  endLine: number,
  endColumn: number,
): DiagnosticSummary["span"] {
  return {
    start: { offset: startOffset, line: startLine, column: startColumn },
    end: { offset: endOffset, line: endLine, column: endColumn },
  };
}
