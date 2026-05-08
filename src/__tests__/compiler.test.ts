import { describe, expect, test } from "bun:test";
import type { CompileResult } from "../compiler";
import { compile, lex, parse } from "../compiler";

describe("lexer", () => {
  test("tokenizes declarations and skips line comments", () => {
    const result = lex("// ignored\nconst answer: number = 42;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Colon",
      "NumberType",
      "Equal",
      "Number",
      "Semicolon",
      "Eof",
    ]);
  });

  test("reports invalid characters", () => {
    const result = lex("const value = @;");

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unexpected character '@'.",
    );
  });
});

describe("parser", () => {
  test("parses function declarations and operator precedence", () => {
    const lexResult = lex("fn value(): number { 1 + 2 * 3 }");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]?.kind).toBe("FunctionDeclaration");
  });
});

describe("compiler", () => {
  test("compiles and runs a tiny program", () => {
    const result = expectCompileOk(`
fn add(a: number, b: number): number {
  a + b
}

const value = add(20, 22);
`);

    expect(result.js).toContain("function add(a, b)");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports explicit return statements", () => {
    const result = expectCompileOk(`
fn identity(value: string): string {
  return value;
}

const value = identity("Ada");
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("compiles the README MVP example shape", () => {
    const result = expectCompileOk(`
const answer: number = 40 + 2;
let name: string = "Ada";

fn add(a: number, b: number): number {
  a + b
}

const value = add(answer, 1);
`);

    expect(result.js).toContain('let name = "Ada";');
    expect(executeValue(result.js)).toBe(43);
  });

  test("rejects unknown names", () => {
    const result = compile("const value = missing;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown name 'missing'.",
    );
  });

  test("rejects incompatible binary operands", () => {
    const result = compile('const value = 1 + "x";');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects wrong function call arity", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

const value = add(1);
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 2 argument(s), got 1.",
    );
  });
});

function expectCompileOk(source: string): Extract<CompileResult, { ok: true }> {
  const result = compile(source);

  if (!result.ok) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  return result;
}

function executeValue(js: string): unknown {
  const execute = new Function(`${js}\nreturn value;`) as () => unknown;
  return execute();
}
