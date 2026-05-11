import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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

  test("tokenizes bigint literals and bigint types", () => {
    const result = lex("const answer: bigint = 42n;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Colon",
      "BigIntType",
      "Equal",
      "BigInt",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes type declarations", () => {
    const result = lex("type Score = number;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Type",
      "Identifier",
      "Equal",
      "NumberType",
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

  test("tokenizes while, break, and continue keywords", () => {
    const result = lex("while ready { continue; break; }");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "While",
      "Identifier",
      "LeftBrace",
      "Continue",
      "Semicolon",
      "Break",
      "Semicolon",
      "RightBrace",
      "Eof",
    ]);
  });

  test("tokenizes compound assignment operators", () => {
    const result = lex("value += 1; value %= 2;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Identifier",
      "PlusEqual",
      "Number",
      "Semicolon",
      "Identifier",
      "PercentEqual",
      "Number",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes array literals and array types", () => {
    const result = lex("const values: []number = [1, 2];");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Colon",
      "LeftBracket",
      "RightBracket",
      "NumberType",
      "Equal",
      "LeftBracket",
      "Number",
      "Comma",
      "Number",
      "RightBracket",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes array member and index expressions", () => {
    const result = lex("values.length; values[0];");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Identifier",
      "Dot",
      "Identifier",
      "Semicolon",
      "Identifier",
      "LeftBracket",
      "Number",
      "RightBracket",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes multiline strings", () => {
    const result = lex("const value = \\\\hello\n  \\\\world\n;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Equal",
      "MultilineString",
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

  test("parses if expressions", () => {
    const lexResult = lex("const value = if enabled { 1 } else { 0 };");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]?.kind).toBe("VariableDeclaration");
  });

  test("parses bigint literals", () => {
    const lexResult = lex("const value: bigint = 42n;");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      typeAnnotation: { kind: "PrimitiveType", name: "bigint" },
      initializer: { kind: "BigIntLiteral", text: "42n" },
    });
  });

  test("parses type declarations", () => {
    const lexResult = lex("type Scores = []Score;");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "TypeDeclaration",
      name: "Scores",
      value: {
        kind: "ArrayType",
        element: { kind: "NamedType", name: "Score" },
      },
    });
  });

  test("parses object type declarations and object literals", () => {
    const lexResult = lex(
      'type User = { id: string, score: number, }; const user: User = { id: "1", score: 90, };',
    );
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "TypeDeclaration",
      value: {
        kind: "ObjectType",
        fields: [
          { kind: "ObjectTypeField", name: "id" },
          { kind: "ObjectTypeField", name: "score" },
        ],
      },
    });
    expect(parseResult.program.declarations[1]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "ObjectLiteral",
        fields: [
          { kind: "ObjectLiteralField", name: "id" },
          { kind: "ObjectLiteralField", name: "score" },
        ],
      },
    });
  });

  test("parses interpolated strings into text and expression parts", () => {
    const lexResult = lex(['const value = "Hello ', "$", "{name}", '!";'].join(""));
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "StringLiteral",
        parts: [
          { kind: "StringText", value: "Hello " },
          {
            kind: "StringInterpolation",
            expression: { kind: "NameExpression", name: "name" },
          },
          { kind: "StringText", value: "!" },
        ],
      },
    });
  });

  test("parses while expressions with continuations", () => {
    const lexResult = lex("const value = while ready : (count += 1) { break 1; } else { 0 };");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "WhileExpression",
        continuation: {
          kind: "AssignmentStatement",
          operator: "+=",
        },
        elseBlock: {
          kind: "Block",
        },
      },
    });
  });

  test("parses assignment statements", () => {
    const lexResult = lex("let count = 0;\ncount = count + 1;");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[1]?.kind).toBe("AssignmentStatement");
  });

  test("parses compound assignment statements", () => {
    const lexResult = lex("let count = 0;\ncount += 1;");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[1]).toMatchObject({
      kind: "AssignmentStatement",
      operator: "+=",
    });
  });

  test("parses array type annotations and literals", () => {
    const lexResult = lex("const values: []number = [1, 2,];");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      typeAnnotation: {
        kind: "ArrayType",
        element: { kind: "PrimitiveType", name: "number" },
      },
      initializer: {
        kind: "ArrayLiteral",
        elements: [{ kind: "NumberLiteral" }, { kind: "NumberLiteral" }],
      },
    });
  });

  test("parses nested array types and literals", () => {
    const lexResult = lex("const values: [][]number = [[1]];");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      typeAnnotation: {
        kind: "ArrayType",
        element: {
          kind: "ArrayType",
          element: { kind: "PrimitiveType", name: "number" },
        },
      },
      initializer: {
        kind: "ArrayLiteral",
        elements: [{ kind: "ArrayLiteral" }],
      },
    });
  });

  test("parses empty array literals", () => {
    const lexResult = lex("const values: []number = [];");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: { kind: "ArrayLiteral", elements: [] },
    });
  });

  test("parses index and member expressions", () => {
    const lexResult = lex("const value = values[0].length;");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "MemberExpression",
        name: "length",
        target: {
          kind: "IndexExpression",
          target: { kind: "NameExpression", name: "values" },
          index: { kind: "NumberLiteral" },
        },
      },
    });
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

  test("supports println from the prelude", () => {
    const result = expectCompileOk(`
println("Hello");
`);

    expect(result.js).toContain('console.log("Hello");');
  });

  test("supports interpolation in println calls", () => {
    const result = expectCompileOk(`
const value = 42;
println("value ${"$"}{value}");
`);

    expect(result.js).toContain(["console.log(`value ", "$", "{value}`);"].join(""));
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

  test("supports interpolated strings", () => {
    const result = expectCompileOk(`
let name = "Ada";
const value = "Hello ${"$"}{name}!";
`);

    expect(result.js).toContain(["`Hello ", "$", "{name}", "!`"].join(""));
    expect(executeValue(result.js)).toBe("Hello Ada!");
  });

  test("supports multiline strings with interpolation", () => {
    const result = expectCompileOk(`
let name = "Ada";
const value = \\\\Hello
  \\\\\${name}
;
`);

    expect(executeValue(result.js)).toBe("Hello\nAda");
  });

  test("preserves supported string escape sequences", () => {
    const result = expectCompileOk(String.raw`
const value = "line\nnext\tindent";
`);

    expect(executeValue(result.js)).toBe("line\nnext\tindent");
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

  test("supports statement while loops", () => {
    const result = expectCompileOk(`
let total = 0;
let i = 0;

while i < 4 : (i += 1) {
  total += i;
}

const value = total;
`);

    expect(result.js).toContain("while ((i < 4))");
    expect(executeValue(result.js)).toBe(6);
  });

  test("runs while continuation expressions before continue", () => {
    const result = expectCompileOk(`
let total = 0;
let i = 0;

while i < 5 : (i += 1) {
  if i == 2 {
    continue;
  }

  total += i;
}

const value = total;
`);

    expect(executeValue(result.js)).toBe(8);
  });

  test("supports value-producing while expressions", () => {
    const result = expectCompileOk(`
let i = 0;

const value = while i < 6 : (i += 1) {
  if i == 4 {
    break i * 10;
  }
} else {
  -1
};
`);

    expect(result.js).toContain("let __whileResult");
    expect(executeValue(result.js)).toBe(40);
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

  test("compiles the checked-in MVP example", () => {
    const source = readFileSync(
      new URL("../../../../examples/basic.plna", import.meta.url),
      "utf8",
    );
    const result = expectCompileOk(source);

    expect(result.js).toContain("__polenaIndex");
    expect(result.js).toContain("const thresholds = [70, 90];");
  });

  test("supports named type aliases in annotations", () => {
    const result = expectCompileOk(`
type Score = number;
type Scores = []Score;
type Matrix = []Scores;

fn first(values: Scores): Score {
  values[0]
}

const scores: Scores = [40, 2];
const matrix: Matrix = [scores];
const value: Score = first(matrix[0]);
`);

    expect(result.js).not.toContain("type Score");
    expect(executeValue(result.js)).toBe(40);
  });

  test("keeps type and value namespaces separate", () => {
    const result = expectCompileOk(`
type Label = string;
const Label = "Ada";
const value: Label = Label;
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("supports exact object literals with named object types", () => {
    const result = expectCompileOk(`
type User = {
  id: string,
  score: number,
};

const value: User = {
  score: 90,
  id: "ada",
};
`);

    expect(result.js).toContain('const value = { score: 90, id: "ada" };');
    const execute = new Function(`${result.js}\nreturn value.score;`) as () => unknown;
    expect(execute()).toBe(90);
  });

  test("infers exact object literal types", () => {
    const result = expectCompileOk(`
const user = {
  id: "ada",
  score: 90,
};

const value = user;
`);

    expect(result.js).toContain('const user = { id: "ada", score: 90 };');
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

  test("supports compound assignment on let bindings", () => {
    const result = expectCompileOk(`
let count = 40;
count += 2;
count *= 2;

const value = count;
`);

    expect(result.js).toContain("count += 2;");
    expect(result.js).toContain("count *= 2;");
    expect(executeValue(result.js)).toBe(84);
  });

  test("supports remainder compound assignment", () => {
    const result = expectCompileOk(`
let count = 17;
count %= 5;

const value = count;
`);

    expect(result.js).toContain("count %= 5;");
    expect(executeValue(result.js)).toBe(2);
  });

  test("supports bigint arithmetic and compound assignment", () => {
    const result = expectCompileOk(`
fn double(value: bigint): bigint {
  value + value
}

let total: bigint = 40n;
total += 2n;

const value = double(total);
`);

    expect(result.js).toContain("40n");
    expect(result.js).toContain("total += 2n;");
    expect(executeValue(result.js)).toBe(84n);
  });

  test("supports bigint ordering", () => {
    const result = expectCompileOk("const value = 2n >= 1n;");

    expect(executeValue(result.js)).toBe(true);
  });

  test("supports array literals and checked indexing", () => {
    const result = expectCompileOk(`
const values = [20, 22];
const value = values[0] + values[1];
`);

    expect(result.js).toContain("function __polenaIndex");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports typed empty arrays and array length", () => {
    const result = expectCompileOk(`
const values: []number = [];
const value = values.length;
`);

    expect(result.js).not.toContain("function __polenaIndex");
    expect(executeValue(result.js)).toBe(0);
  });

  test("supports array function parameters and returns", () => {
    const result = expectCompileOk(`
fn pair(a: number, b: number): []number {
  [a, b]
}

const value = pair(20, 22)[1];
`);

    expect(executeValue(result.js)).toBe(22);
  });

  test("supports nested arrays", () => {
    const result = expectCompileOk(`
const values: [][]number = [[1], [42]];
const value = values[1][0];
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("throws on out-of-bounds array indexes", () => {
    const result = expectCompileOk(`
const values = [1];
const value = values[1];
`);

    expect(() => executeValue(result.js)).toThrow(RangeError);
  });

  test("throws on fractional array indexes", () => {
    const result = expectCompileOk(`
const values = [1];
const value = values[0.5];
`);

    expect(() => executeValue(result.js)).toThrow(RangeError);
  });

  test("rejects non-boolean if conditions", () => {
    const result = compile("const value = if 1 { 1 } else { 0 };");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'boolean', got 'number'.",
    );
  });

  test("rejects unterminated string interpolation", () => {
    const result = compile('const value = "Hello ${name";');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unterminated string interpolation.",
    );
  });

  test("rejects invalid interpolation expressions", () => {
    const result = compile(['const value = "Hello ', "$", "{if}", '";'].join(""));

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Invalid interpolation expression.",
    );
  });

  test("rejects non-boolean while conditions", () => {
    const result = compile("while 1 { break; }");

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

  test("rejects value-producing while expressions without else branches", () => {
    const result = compile(`
let i = 0;
const value = while i < 3 : (i += 1) {
  break i;
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "While expression used as a value must have an else branch.",
    );
  });

  test("rejects break outside loops", () => {
    const result = compile("break;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Break statement must be inside a loop.",
    );
  });

  test("rejects continue outside loops", () => {
    const result = compile("continue;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Continue statement must be inside a loop.",
    );
  });

  test("rejects break values in statement while loops", () => {
    const result = compile(`
while true {
  break 1;
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Break with a value is only allowed inside value-producing while expressions.",
    );
  });

  test("rejects plain break in value-producing while expressions", () => {
    const result = compile(`
let i = 0;
const value = while i < 3 : (i += 1) {
  if i == 1 {
    break;
  }
} else {
  0
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Value-producing while expressions must use 'break value;'.",
    );
  });

  test("rejects incompatible while exit value types", () => {
    const result = compile(`
let i = 0;
const value = while i < 3 : (i += 1) {
  if i == 1 {
    break 1;
  }
} else {
  "no"
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects unknown names", () => {
    const result = compile("const value = missing;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown name 'missing'.",
    );
  });

  test("rejects duplicate local variables", () => {
    const result = compile(`
fn value(): number {
  const count = 1;
  const count = 2;
  count
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate name 'count'.",
    );
  });

  test("rejects duplicate top-level variable and function names", () => {
    const result = compile(`
const value = 1;

fn value(): number {
  2
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate name 'value'.",
    );
  });

  test("rejects local variables that duplicate parameters", () => {
    const result = compile(`
fn value(count: number): number {
  const count = 1;
  count
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate name 'count'.",
    );
  });

  test("rejects shadowing names from outer scopes", () => {
    const result = compile(`
const count = 1;
const value = if true {
  const count = 2;
  count
} else {
  count
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Name 'count' shadows an existing name.",
    );
  });

  test("rejects incompatible binary operands", () => {
    const result = compile('const value = 1 + "x";');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects mixing number and bigint in arithmetic", () => {
    const result = compile("const value = 1 + 2n;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '+' requires compatible operands, got 'number' and 'bigint'.",
    );
  });

  test("rejects array equality", () => {
    const result = compile(`
const left = [1];
const right = [1];
const value = left == right;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '==' cannot compare '[]number' values.",
    );
  });

  test("rejects function equality", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

const value = add != add;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '!=' cannot compare 'function' values.",
    );
  });

  test("rejects ordering non-numeric primitive values", () => {
    const stringResult = compile('const value = "a" < "b";');
    const booleanResult = compile("const value = true > false;");

    expect(stringResult.ok).toBe(false);
    expect(stringResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' cannot order 'string' values.",
    );
    expect(booleanResult.ok).toBe(false);
    expect(booleanResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '>' cannot order 'boolean' values.",
    );
  });

  test("rejects ordering arrays", () => {
    const result = compile(`
const left = [1];
const right = [1];
const value = left < right;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' cannot order '[]number' values.",
    );
  });

  test("rejects ordering functions", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

const value = add > add;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '>' cannot order 'function' values.",
    );
  });

  test("rejects mixed number and bigint ordering", () => {
    const result = compile("const value = 1 < 2n;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' requires compatible operands, got 'number' and 'bigint'.",
    );
  });

  test("rejects mixed array element types", () => {
    const result = compile('const values = [1, "x"];');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects untyped empty arrays", () => {
    const result = compile("const values = [];");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer the element type of an empty array.",
    );
  });

  test("rejects array literals that do not match annotations", () => {
    const result = compile('const values: []number = ["x"];');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected '[]number', got '[]string'.",
    );
  });

  test("rejects indexing non-array values", () => {
    const result = compile("const value = 1[0];");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot index value of type 'number'.",
    );
  });

  test("rejects non-number array indexes", () => {
    const result = compile(`
const values = [1];
const value = values["0"];
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects unknown array properties", () => {
    const result = compile(`
const values = [1];
const value = values.size;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'size' on type '[]number'.",
    );
  });

  test("rejects length access on non-array values", () => {
    const result = compile("const value = 1.length;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'length' on type 'number'.",
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

  test("rejects compound assignment on const bindings", () => {
    const result = compile(`
const count = 1;
count += 2;
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

  test("rejects compound assignment on non-numeric bindings", () => {
    const result = compile(`
let name = "Ada";
name += 1;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects non-numeric right-hand sides in compound assignment", () => {
    const result = compile(`
let count = 1;
count += "Ada";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects bigint literals with fractional parts", () => {
    const result = compile("const value = 1.5n;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Bigint literals cannot have a fractional part.",
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

  test("rejects duplicate type names", () => {
    const result = compile(`
type Score = number;
type Score = string;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate type name 'Score'.",
    );
  });

  test("rejects unknown type names", () => {
    const result = compile("const value: Missing = 1;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown type 'Missing'.",
    );
  });

  test("rejects recursive type aliases", () => {
    const result = compile(`
type Scores = []Scores;
const value: Scores = [];
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Recursive type alias 'Scores'.",
    );
  });

  test("rejects object literals with missing fields", () => {
    const result = compile(`
type User = {
  id: string,
  score: number,
};

const value: User = {
  id: "ada",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing object field 'score'.",
    );
  });

  test("rejects object literals with extra fields", () => {
    const result = compile(`
type User = {
  id: string,
};

const value: User = {
  id: "ada",
  score: 90,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown object field 'score'.",
    );
  });

  test("rejects duplicate object literal fields", () => {
    const result = compile(`
const value = {
  id: "ada",
  id: "grace",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate object field 'id'.",
    );
  });

  test("rejects duplicate object type fields", () => {
    const result = compile(`
type User = {
  id: string,
  id: number,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate object field 'id'.",
    );
  });

  test("rejects structural object assignment before structural assignability is implemented", () => {
    const result = compile(`
const a = { a: 1, b: 2 };
type X = { a: number };
const b: X = a;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected '{ a: number }', got '{ a: number, b: number }'.",
    );
  });

  test("rejects wrong println argument types", () => {
    const result = compile("println(1);");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
    );
  });

  test("rejects wrong println arity", () => {
    const result = compile("println();");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 1 argument(s), got 0.",
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
