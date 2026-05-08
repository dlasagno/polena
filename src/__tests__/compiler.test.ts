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

  test("tokenizes if and else keywords", () => {
    const result = lex("if enabled { 1 } else { 0 }");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "If",
      "Identifier",
      "LeftBrace",
      "Number",
      "RightBrace",
      "Else",
      "LeftBrace",
      "Number",
      "RightBrace",
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

  test("parses if expressions", () => {
    const lexResult = lex("const value = if enabled { 1 } else { 0 };");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]?.kind).toBe("VariableDeclaration");
  });

  test("parses assignment statements", () => {
    const lexResult = lex("let count = 0;\ncount = count + 1;");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[1]?.kind).toBe("AssignmentStatement");
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

  test("supports value-producing if expressions", () => {
    const result = expectCompileOk(`
const enabled = true;
const value = if enabled {
  "yes"
} else {
  "no"
};
`);

    expect(executeValue(result.js)).toBe("yes");
  });

  test("supports if statements without else branches", () => {
    const result = expectCompileOk(`
fn choose(enabled: boolean): number {
  if enabled {
    return 1;
  }

  0
}

const value = choose(true);
`);

    expect(executeValue(result.js)).toBe(1);
  });

  test("indents nested if expression output", () => {
    const result = expectCompileOk(`
fn describeScore(score: number): string {
  if score >= 90 {
    "excellent"
  } else {
    if score >= 70 {
      "passing"
    } else {
      "needs work"
    }
  }
}

const value = describeScore(72);
`);

    expect(result.js).toContain(
      [
        "function describeScore(score) {",
        "  return (() => {",
        "    if ((score >= 90)) {",
        '      return "excellent";',
        "    } else {",
        "      return (() => {",
        "        if ((score >= 70)) {",
        '          return "passing";',
        "        } else {",
        '          return "needs work";',
        "        }",
        "      })();",
        "    }",
        "  })();",
        "}",
      ].join("\n"),
    );
    expect(executeValue(result.js)).toBe("passing");
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

  test("supports reassigning let bindings", () => {
    const result = expectCompileOk(`
let count = 40;
count = count + 2;

const value = count;
`);

    expect(result.js).toContain("count = (count + 2);");
    expect(executeValue(result.js)).toBe(42);
  });

  test("rejects non-boolean if conditions", () => {
    const result = compile("const value = if 1 { 1 } else { 0 };");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'boolean', got 'number'.",
    );
  });

  test("rejects incompatible if branch types", () => {
    const result = compile('const value = if true { 1 } else { "no" };');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects value-producing if expressions without else branches", () => {
    const result = compile("const value = if true { 1 };");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "If expression used as a value must have an else branch.",
    );
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

  test("rejects assigning the wrong type to a let binding", () => {
    const result = compile(`
let count = 1;
count = "Ada";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects assigning to const bindings", () => {
    const result = compile(`
const count = 1;
count = 2;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot assign to 'count'.",
    );
  });

  test("rejects assigning to unknown names", () => {
    const result = compile("missing = 1;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown name 'missing'.",
    );
  });

  test("rejects assigning to function names", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

add = add;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot assign to 'add'.",
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
