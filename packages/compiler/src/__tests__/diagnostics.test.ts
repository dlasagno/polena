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
    const result = lex("const value = #;");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.UnexpectedCharacter,
      message: "Unexpected character '#'.",
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

  test("recovers after a malformed grouped expression without cascading", () => {
    const result = analyze("const value = (1 2);");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected ')' after expression.",
      label: "parser was looking here",
      span: span(17, 1, 18, 18, 1, 19),
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  test("recovers after malformed call arguments without cascading", () => {
    const result = analyze(`
fn add(a: number): number {
  a
}

const value = add(1 2);
`);

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected ')' after arguments.",
      label: "parser was looking here",
      span: span(56, 6, 21, 57, 6, 22),
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  test("recovers after malformed array literals without cascading", () => {
    const result = analyze("const values = [1 2];");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected ']' after array literal.",
      label: "parser was looking here",
      span: span(18, 1, 19, 19, 1, 20),
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  test("recovers after malformed variable type annotations without checker noise", () => {
    const result = analyze("const value: = 1;");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ExpectedTypeSyntax,
      message: "Expected a type.",
      label: "expected a type such as 'number', 'string', or '[]number'",
      span: span(13, 1, 14, 14, 1, 15),
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  test("recovers after malformed function return types without checker noise", () => {
    const result = analyze("fn value(): { 1 }");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected field name in object type.",
      label: "parser was looking here",
      span: span(14, 1, 15, 15, 1, 16),
    });
    expect(result.diagnostics).toHaveLength(2);
  });

  test("recovers after missing function bodies without missing-return noise", () => {
    const result = analyze("fn value(): number");

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected '{' before function body.",
      label: "parser was looking here",
      span: span(18, 1, 19, 18, 1, 19),
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  test("reports missing if, else, and while blocks with context-specific messages", () => {
    const missingIfBlock = analyze("const value = if true 1 else { 2 };");
    const missingElseBlock = analyze("const value = if true { 1 } else 2;");
    const missingWhileBody = analyze("while true break;");

    expectDiagnostic(missingIfBlock.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected '{' before if body.",
      label: "parser was looking here",
      span: span(22, 1, 23, 23, 1, 24),
    });
    expect(missingIfBlock.diagnostics).toHaveLength(1);

    expectDiagnostic(missingElseBlock.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected '{' before else block.",
      label: "parser was looking here",
      span: span(33, 1, 34, 34, 1, 35),
    });
    expect(missingElseBlock.diagnostics).toHaveLength(1);

    expectDiagnostic(missingWhileBody.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected '{' before while body.",
      label: "parser was looking here",
      span: span(11, 1, 12, 16, 1, 17),
    });
    expect(missingWhileBody.diagnostics).toHaveLength(1);
  });

  test("reports trailing call commas without arity noise", () => {
    const result = analyze(`
fn add(a: number): number {
  a
}

const value = add(1,);
`);

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ExpectedExpression,
      message: "Expected an expression.",
      label: "expected an expression here",
      span: span(56, 6, 21, 57, 6, 22),
    });
    expect(result.diagnostics).toHaveLength(1);
  });

  test("recovers after match arms with missing arrows without checker noise", () => {
    const result = analyze(`
type Color = enum { Red, Blue };
const value: number = match Color.Red {
  .Red 1,
  .Blue => 2,
};
`);

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.ParseExpectedToken,
      message: "Expected '=>' after match pattern.",
      label: "parser was looking here",
      span: span(81, 4, 8, 82, 4, 9),
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

  test("reports interpolation diagnostics at the source expression span", () => {
    const result = analyze(['const value = "Hello ', "$", '{missing}";'].join(""));

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.UnknownName,
      message: "Unknown name 'missing'.",
      label: "no value with this name is in scope",
      span: span(23, 1, 24, 30, 1, 31),
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

  test("reports missing fresh object literal fields at the expected field name", () => {
    const result = analyze('const user: { id: string, name: string } = { name: "Ada" };');

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.TypeMismatch,
      message: "Missing object field 'id'.",
      label: "this object literal is missing a required field",
      span: span(14, 1, 15, 16, 1, 17),
    });
  });

  test("reports missing structural object fields at the expected field name", () => {
    const result = analyze(
      'type User = { id: string, name: string }; const named = { name: "Ada" }; const user: User = named;',
    );

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.TypeMismatch,
      message: "Missing object field 'id'.",
      label: "this object value is missing a required field",
      span: span(14, 1, 15, 16, 1, 17),
    });
  });

  test("reports structural object field type mismatches at the actual field name", () => {
    const result = analyze(
      "type User = { id: string }; const value = { id: 1 }; const user: User = value;",
    );

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.TypeMismatch,
      message: "Object field 'id' has type 'number', expected 'string'.",
      label: "this object field has the wrong type",
      span: span(44, 1, 45, 46, 1, 47),
    });
  });

  test("reports excess fresh object literal fields at the extra field name", () => {
    const result = analyze('const user: { id: string } = { id: "ada", score: 90 };');

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.UnknownProperty,
      message: "Unknown object field 'score'.",
      label: "this field is not part of the expected object type",
      span: span(42, 1, 43, 47, 1, 48),
    });
  });

  test("reports nested structural object field type mismatches at the actual field name", () => {
    const result = analyze(
      "type Box = { value: { id: string } }; const box = { value: { id: 1 } }; const value: Box = box;",
    );

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.TypeMismatch,
      message: "Object field 'value.id' has type 'number', expected 'string'.",
      label: "this object field has the wrong type",
      span: span(61, 1, 62, 63, 1, 64),
      notes: [
        {
          kind: "help",
          message: "provide the required object shape explicitly",
        },
      ],
    });
  });

  test("reports invalid field compound assignment at the field name", () => {
    const result = analyze('const user = { name: "Ada" }; user.name += 1;');

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.TypeMismatch,
      message: "Expected 'number', got 'string'.",
      label: "expected 'number' here",
      span: span(35, 1, 36, 39, 1, 40),
      notes: [
        {
          kind: "help",
          message: "make this expression produce the expected type explicitly",
        },
      ],
    });
  });

  test("reports invalid index compound assignment at the indexed value", () => {
    const result = analyze('const values = ["Ada"]; values[0] += 1;');

    expectDiagnostic(result.diagnostics[0], {
      code: DiagnosticCode.TypeMismatch,
      message: "Expected 'number', got 'string'.",
      label: "expected 'number' here",
      span: span(24, 1, 25, 30, 1, 31),
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
