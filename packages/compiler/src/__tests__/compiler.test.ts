import { describe, expect, test } from "bun:test";
import type { CompileResult } from "../compiler";
import { compile, compilePackage, lex, parse } from "../compiler";

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

  test("tokenizes doc comments", () => {
    const result = lex("//! Module docs\n/// Adds one.\nconst answer: number = 42;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => `${token.kind}:${token.text}`)).toEqual([
      "ModuleDocComment:Module docs",
      "DocComment:Adds one.",
      "Const:const",
      "Identifier:answer",
      "Colon::",
      "NumberType:number",
      "Equal:=",
      "Number:42",
      "Semicolon:;",
      "Eof:",
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

  test("tokenizes supported number literal forms", () => {
    const result = lex("0xff 0o70 0b1100 1e9 1.5e-3 0xffn");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => `${token.kind}:${token.text}`)).toEqual([
      "Number:0xff",
      "Number:0o70",
      "Number:0b1100",
      "Number:1e9",
      "Number:1.5e-3",
      "BigInt:0xffn",
      "Eof:",
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

  test("tokenizes enums, match arrows, and wildcard patterns", () => {
    const result = lex("type Color = enum { Red, }; const label = match color { .Red => _, };");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Type",
      "Identifier",
      "Equal",
      "Enum",
      "LeftBrace",
      "Identifier",
      "Comma",
      "RightBrace",
      "Semicolon",
      "Const",
      "Identifier",
      "Equal",
      "Match",
      "Identifier",
      "LeftBrace",
      "Dot",
      "Identifier",
      "Arrow",
      "Identifier",
      "Comma",
      "RightBrace",
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
    const result = lex("value += 1; value %= 2; left ++ right;");

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
      "Identifier",
      "PlusPlus",
      "Identifier",
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
    const result = lex("const value = #;");

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unexpected character '#'.",
    );
  });
});

describe("parser", () => {
  test("attaches module doc comments to programs", () => {
    const source = ["//! Module docs.", "//!", "//! More module docs.", "const answer = 42;"].join(
      "\n",
    );
    const result = parse(lex(source).tokens);

    expect(result.diagnostics).toHaveLength(0);
    expect(result.program).toMatchObject({
      doc: "Module docs.\n\nMore module docs.",
      docSpan: {
        start: { line: 1, column: 1 },
        end: { line: 3, column: 22 },
      },
      declarations: [{ kind: "VariableDeclaration", name: "answer" }],
    });
  });

  test("attaches doc comments to declarations", () => {
    const source =
      "/// Adds one.\n///\n/// Returns the next value.\nfn next(value: number): number { value + 1 }";
    const result = parse(lex(source).tokens);
    const declaration = result.program.declarations[0];

    expect(result.diagnostics).toHaveLength(0);
    expect(declaration).toMatchObject({
      kind: "FunctionDeclaration",
      doc: "Adds one.\n\nReturns the next value.",
    });
  });

  test("attaches doc comments to object fields and enum variants", () => {
    const source = [
      "type User = {",
      "  /// Display name.",
      "  name: string,",
      "};",
      "type Status = enum {",
      "  /// Ready to run.",
      "  Ready,",
      "};",
    ].join("\n");
    const result = parse(lex(source).tokens);
    const user = result.program.declarations[0];
    const status = result.program.declarations[1];

    expect(result.diagnostics).toHaveLength(0);
    expect(user).toMatchObject({
      kind: "TypeDeclaration",
      value: {
        kind: "ObjectType",
        fields: [{ kind: "ObjectTypeField", name: "name", doc: "Display name." }],
      },
    });
    expect(status).toMatchObject({
      kind: "TypeDeclaration",
      value: {
        kind: "EnumType",
        variants: [{ kind: "EnumVariantType", name: "Ready", doc: "Ready to run." }],
      },
    });
  });

  test("reports misplaced doc comments", () => {
    const source = [
      "/// Expressions cannot be documented.",
      "1;",
      "fn value(): number {",
      "  /// Return statements cannot be documented.",
      "  return 1;",
      "}",
      "type User = {",
      "  /// This has no field.",
      "};",
      "type Status = enum {",
      "  /// This has no variant.",
      "};",
    ].join("\n");
    const result = parse(lex(source).tokens);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PLN015",
      "PLN015",
      "PLN015",
      "PLN015",
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Misplaced doc comment.",
      "Misplaced doc comment.",
      "Misplaced doc comment.",
      "Misplaced doc comment.",
    ]);
  });

  test("reports misplaced module doc comments", () => {
    const source = [
      "const answer = 42;",
      "//! Module docs must be first.",
      "const other = 1;",
      "fn value(): number {",
      "  //! Module docs cannot be in blocks.",
      "  return other;",
      "}",
    ].join("\n");
    const result = parse(lex(source).tokens);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["PLN015", "PLN015"]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Misplaced module doc comment.",
      "Misplaced module doc comment.",
    ]);
  });

  test("parses function declarations and operator precedence", () => {
    const lexResult = lex('fn value(): string { "a" ++ "b" + "c" }');
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "FunctionDeclaration",
      body: {
        finalExpression: {
          kind: "BinaryExpression",
          operator: "+",
          left: { kind: "BinaryExpression", operator: "++" },
        },
      },
    });
  });

  test("assigns deterministic node IDs to parsed AST nodes", () => {
    const source = "type Score = []number; fn value(input: Score): number { input.length }";
    const first = parse(lex(source).tokens);
    const second = parse(lex(source).tokens);

    expect(first.diagnostics).toHaveLength(0);
    expect(first).toEqual(second);
    expect(first.program).toMatchObject({ nodeId: expect.any(Number) });

    const typeDeclaration = first.program.declarations[0];
    expect(typeDeclaration).toMatchObject({
      kind: "TypeDeclaration",
      nodeId: expect.any(Number),
      value: {
        kind: "ArrayType",
        nodeId: expect.any(Number),
        element: { kind: "PrimitiveType", nodeId: expect.any(Number) },
      },
    });

    const functionDeclaration = first.program.declarations[1];
    expect(functionDeclaration).toMatchObject({
      kind: "FunctionDeclaration",
      nodeId: expect.any(Number),
      params: [{ kind: "Parameter", nodeId: expect.any(Number) }],
      body: {
        kind: "Block",
        nodeId: expect.any(Number),
        finalExpression: { kind: "MemberExpression", nodeId: expect.any(Number) },
      },
    });
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

  test("parses generic type declarations and instantiations", () => {
    const parseResult = parse(lex("type Pair<A, B> = { first: A, second: B };").tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "TypeDeclaration",
      name: "Pair",
      typeParameters: [
        { kind: "TypeParameter", name: "A" },
        { kind: "TypeParameter", name: "B" },
      ],
      value: {
        kind: "ObjectType",
        fields: [
          { name: "first", type: { kind: "NamedType", name: "A", typeArguments: [] } },
          { name: "second", type: { kind: "NamedType", name: "B", typeArguments: [] } },
        ],
      },
    });

    const nested = parse(lex("const value: Option<Option<number>> = .None;").tokens);
    expect(nested.diagnostics).toHaveLength(0);
    expect(nested.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      typeAnnotation: {
        kind: "NamedType",
        name: "Option",
        typeArguments: [
          {
            kind: "NamedType",
            name: "Option",
            typeArguments: [{ kind: "PrimitiveType", name: "number" }],
          },
        ],
      },
    });
  });

  test("parses generic function declarations", () => {
    const parseResult = parse(lex("fn identity<T>(value: T): T { value }").tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "FunctionDeclaration",
      name: "identity",
      typeParameters: [{ kind: "TypeParameter", name: "T" }],
      params: [{ name: "value", type: { kind: "NamedType", name: "T" } }],
      returnType: { kind: "NamedType", name: "T" },
    });
  });

  test("parses fieldless enum declarations", () => {
    const lexResult = lex("type Color = enum { Red, Green, Blue, };");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "TypeDeclaration",
      value: {
        kind: "EnumType",
        variants: [
          { kind: "EnumVariantType", name: "Red" },
          { kind: "EnumVariantType", name: "Green" },
          { kind: "EnumVariantType", name: "Blue" },
        ],
      },
    });
  });

  test("parses enum shorthand values and match expressions", () => {
    const lexResult = lex(`
type Color = enum { Red, Green, Blue, };
const blue: Color = .Blue;
const label = match blue {
  .Red => "red",
  Color.Green => "green",
  _ => "other",
};
`);
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[1]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: { kind: "EnumVariantExpression", variantName: "Blue" },
    });
    expect(parseResult.program.declarations[2]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "MatchExpression",
        arms: [
          { pattern: { kind: "EnumVariantPattern", variantName: "Red" } },
          { pattern: { kind: "EnumVariantPattern", enumName: "Color", variantName: "Green" } },
          { pattern: { kind: "WildcardPattern" } },
        ],
      },
    });
  });

  test("parses enum payload declarations and match payload patterns", () => {
    const parseResult = parse(
      lex(`
type Message = enum { Move(number, number), Write(string), Quit, };
const value = match message {
  .Move(x, y) => "move",
  Message.Write(_) => "write",
  .Quit => "quit",
};
`).tokens,
    );

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "TypeDeclaration",
      value: {
        kind: "EnumType",
        variants: [
          {
            kind: "EnumVariantType",
            name: "Move",
            payload: [{ name: "number" }, { name: "number" }],
          },
          { kind: "EnumVariantType", name: "Write", payload: [{ name: "string" }] },
          { kind: "EnumVariantType", name: "Quit", payload: [] },
        ],
      },
    });
    expect(parseResult.program.declarations[1]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "MatchExpression",
        arms: [
          {
            pattern: {
              kind: "EnumVariantPattern",
              variantName: "Move",
              payload: [
                { kind: "BindingPattern", name: "x" },
                { kind: "BindingPattern", name: "y" },
              ],
            },
          },
          {
            pattern: {
              kind: "EnumVariantPattern",
              enumName: "Message",
              variantName: "Write",
              payload: [{ kind: "WildcardPattern" }],
            },
          },
          { pattern: { kind: "EnumVariantPattern", variantName: "Quit" } },
        ],
      },
    });
  });

  test("rejects named enum payload fields in declarations", () => {
    const parseResult = parse(
      lex("type Message = enum { Move { x: number, y: number }, };").tokens,
    );

    expect(parseResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variants do not support named associated fields.",
    );
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
    const lexResult = lex("fn run(): void { let count = 0;\ncount = count + 1; }");
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    const declaration = parseResult.program.declarations[0];
    expect(declaration?.kind).toBe("FunctionDeclaration");
    expect(
      declaration?.kind === "FunctionDeclaration" && declaration.body.statements[1]?.kind,
    ).toBe("AssignmentStatement");
  });

  test("parses field and index assignment statements", () => {
    const lexResult = lex('user.name = "Grace";\nvalues[0] = 42;');
    const parseResult = parse(lexResult.tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "AssignmentStatement",
      target: { kind: "MemberExpression", name: "name" },
    });
    expect(parseResult.program.declarations[1]).toMatchObject({
      kind: "AssignmentStatement",
      target: { kind: "IndexExpression" },
    });
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
  test("compiles current-package modules to ESM files", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @/users.{type User, parseUser} as users;",
            "export fn main(): void {",
            '  const user: User = users.parseUser("Ada");',
            "  println(user.name);",
            "}",
          ].join("\n"),
        },
        {
          path: "app/src/users.plna",
          source: [
            "export type User = { name: string };",
            "export fn parseUser(name: string): User {",
            "  { name: name }",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.path).sort()).toEqual(["index.js", "users.js"]);
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      'import * as users from "./users.js";',
    );
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      'import { parseUser } from "./users.js";',
    );
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain("main();");
  });

  test("rejects missing current-package modules", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: "import @/missing;\nexport fn main(): void {}",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing module '@/missing'.",
    );
  });

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

  test("supports string concatenation", () => {
    const result = expectCompileOk(`
const first = "Ada";
const value = "Hello, " ++ first ++ "!";
`);

    expect(result.js).toContain('"Hello, ".concat(first)');
    expect(executeValue(result.js)).toBe("Hello, Ada!");
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

  test("compiles the checked-in package example", () => {
    const result = compilePackage({
      manifest: { name: "basic", version: "0.1.0", target: "executable" },
      rootDir: "examples/basic",
      sourceDir: "examples/basic/src",
      files: [
        {
          path: "examples/basic/src/index.plna",
          source: [
            "import @/users.{type User, greeting} as users;",
            "export fn main(): void {",
            '  const user: User = { name: "Ada" };',
            "  println(users.greeting(user));",
            "}",
          ].join("\n"),
        },
        {
          path: "examples/basic/src/users.plna",
          source: [
            "export type User = {",
            "  name: string,",
            "};",
            "export fn greeting(user: User): string {",
            ['  "Hello ', "$", '{user.name}"'].join(""),
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      'import * as users from "./users.js";',
    );
    expect(result.files.find((file) => file.path === "users.js")?.contents).toContain(
      "export function greeting",
    );
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

  test("supports object property access", () => {
    const result = expectCompileOk(`
type User = {
  name: string,
  score: number,
};

const user: User = { name: "Ada", score: 42 };
const value = user.name;
`);

    expect(result.js).toContain("user.name");
    expect(executeValue(result.js)).toBe("Ada");
  });

  test("supports object property access on inferred object types", () => {
    const result = expectCompileOk(`
const point = { x: 20, y: 22 };
const value = point.x + point.y;
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("supports object field assignment through const bindings", () => {
    const result = expectCompileOk(`
const user = { name: "Ada", score: 1 };
user.name = "Grace";
const value = user.name;
`);

    expect(result.js).toContain('user.name = "Grace";');
    expect(executeValue(result.js)).toBe("Grace");
  });

  test("supports compound assignment on object fields", () => {
    const result = expectCompileOk(`
const user = { score: 40 };
user.score += 2;
const value = user.score;
`);

    expect(result.js).toContain("user.score += 2;");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports object field assignment through function parameters", () => {
    const result = expectCompileOk(`
type User = {
  name: string,
};

fn rename(user: User): void {
  user.name = "Grace";
}

const user: User = { name: "Ada" };
rename(user);
const value = user.name;
`);

    expect(executeValue(result.js)).toBe("Grace");
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

  test("supports non-decimal and exponent number literals", () => {
    const result = expectCompileOk("const value = 0xff + 0o70 + 0b10 + 1e3 + 1.5e1;");

    expect(executeValue(result.js)).toBe(1328);
  });

  test("supports array literals and checked indexing", () => {
    const result = expectCompileOk(`
const values = [20, 22];
const value = values[0] + values[1];
`);

    expect(result.js).toContain("function __polenaIndex");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports array concatenation", () => {
    const result = expectCompileOk(`
const left = [20];
const right = [22];
const values = left ++ right;
const value = values[0] + values[1];
`);

    expect(result.js).toContain("left.concat(right)");
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

  test("supports checked array element assignment", () => {
    const result = expectCompileOk(`
const values = [1, 2];
values[0] = 40;
values[1] = 2;
const value = values[0] + values[1];
`);

    expect(result.js).toContain("function __polenaIndexSet");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports checked compound assignment on array elements", () => {
    const result = expectCompileOk(`
const values = [40, 2];
values[0] += values[1];
const value = values[0];
`);

    expect(result.js).toContain("function __polenaIndexUpdate");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports checked compound assignment on bigint array elements", () => {
    const result = expectCompileOk(`
const values = [40n, 2n];
values[0] += values[1];
const value = values[0];
`);

    expect(executeValue(result.js)).toBe(42n);
  });

  test("emits JavaScript-safe names for reserved identifiers and compiler helper names", () => {
    const result = expectCompileOk(`
const default = 40;
const __polenaIndex = [2];
const value = default + __polenaIndex[0];
`);

    expect(result.js).toContain("const $polena$default = 40;");
    expect(result.js).toContain("const $polena$__polenaIndex = [2];");
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

  test("throws on out-of-bounds array assignment indexes", () => {
    const result = expectCompileOk(`
const values = [1];
values[1] = 2;
const value = values[0];
`);

    expect(() => executeValue(result.js)).toThrow(RangeError);
  });

  test("throws on out-of-bounds array compound assignment indexes", () => {
    const result = expectCompileOk(`
const values = [1];
values[1] += 2;
const value = values[0];
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

  test("rejects concatenating unsupported operand types", () => {
    const result = compile("const value = 1 ++ 2;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '++' requires string or array operands, got 'number' and 'number'.",
    );
  });

  test("rejects array concatenation with incompatible element types", () => {
    const result = compile('const value = [1] ++ ["x"];');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '++' requires compatible array element types, got 'number' and 'string'.",
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

  test("rejects unknown object properties", () => {
    const result = compile(`
type User = {
  name: string,
};

const user: User = { name: "Ada" };
const value = user.email;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'email' on type '{ name: string }'.",
    );
  });

  test("rejects unknown object properties in assignments", () => {
    const result = compile(`
const user = { name: "Ada" };
user.email = "a@example.com";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'email' on type '{ name: string }'.",
    );
  });

  test("rejects incompatible object field assignment values", () => {
    const result = compile(`
const user = { name: "Ada" };
user.name = 42;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
    );
  });

  test("rejects incompatible array element assignment values", () => {
    const result = compile(`
const values = [1];
values[0] = "no";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects compound assignment on non-numeric object fields", () => {
    const result = compile(`
const user = { name: "Ada" };
user.name += 1;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects compound assignment on non-numeric array elements", () => {
    const result = compile(`
const values = ["Ada"];
values[0] += 1;
`);

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

  test("rejects base-prefixed number literals without digits", () => {
    const result = compile("const value = 0x;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed hexadecimal literal.",
    );
  });

  test("rejects malformed numeric separator placement", () => {
    const sources = ["const value = 1_;", "const value = 1__2;", "const value = 1e_2;"];

    for (const source of sources) {
      const result = compile(source);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
        "Malformed number literal.",
      );
    }
  });

  test("rejects malformed exponent number literals", () => {
    const result = compile("const value = 1e;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed number literal.",
    );
  });

  test("rejects trailing text after decimal bigint suffixes", () => {
    const result = compile("const value = 1number;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed bigint literal.",
    );
  });

  test("rejects invalid digits in base-prefixed number literals", () => {
    const binaryResult = compile("const value = 0b102;");

    expect(binaryResult.ok).toBe(false);
    expect(binaryResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed binary literal.",
    );

    const separatorResult = compile("const value = 0x_FF;");

    expect(separatorResult.ok).toBe(false);
    expect(separatorResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed hexadecimal literal.",
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

  test("supports structural object assignment from non-literal values", () => {
    const result = expectCompileOk(`
type Named = {
  name: string,
};

const user = {
  id: "ada",
  name: "Ada",
};

const named: Named = user;
const value = named.name;
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("supports structural object arguments", () => {
    const result = expectCompileOk(`
type Named = {
  name: string,
};

fn greet(value: Named): string {
  "Hello \${value.name}"
}

const user = {
  id: "ada",
  name: "Ada",
};

const value = greet(user);
`);

    expect(executeValue(result.js)).toBe("Hello Ada");
  });

  test("accepts functions where all if branches return explicitly", () => {
    const result = expectCompileOk(`
fn choose(enabled: boolean): number {
  if enabled {
    return 40;
  } else {
    return 42;
  };
}

const value = choose(false);
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("accepts final if expressions where all branches return explicitly", () => {
    const result = expectCompileOk(`
fn choose(enabled: boolean): number {
  if enabled {
    return 40;
  } else {
    return 42;
  }
}

const value = choose(true);
`);

    expect(executeValue(result.js)).toBe(40);
  });

  test("rejects functions where an if branch can fall through", () => {
    const result = compile(`
fn choose(enabled: boolean): number {
  if enabled {
    return 42;
  };
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Function 'choose' must return 'number'.",
    );
  });

  test("supports nested structural object assignment", () => {
    const result = expectCompileOk(`
type NamedBox = {
  value: {
    name: string,
  },
};

const userBox = {
  value: {
    id: "ada",
    name: "Ada",
  },
};

const namedBox: NamedBox = userBox;
const value = namedBox.value.name;
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("rejects structural object assignment with missing fields", () => {
    const result = compile(`
type User = {
  id: string,
  name: string,
};

const named = {
  name: "Ada",
};

const user: User = named;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing object field 'id'.",
    );
  });

  test("rejects nested structural object assignment with missing fields", () => {
    const result = compile(`
type NamedBox = {
  value: {
    name: string,
  },
};

const box = {
  value: {
    id: "ada",
  },
};

const namedBox: NamedBox = box;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing object field 'value.name'.",
    );
  });

  test("rejects structural object assignment with incompatible field types", () => {
    const result = compile(`
type User = {
  id: string,
};

const value = {
  id: 1,
};

const user: User = value;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Object field 'id' has type 'number', expected 'string'.",
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

  test("supports fieldless enum values and equality", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const red = Color.Red;
const blue: Color = .Blue;
const value = red != blue;
`);

    expect(executeValue(result.js)).toBe(true);
    expect(result.js).not.toContain("const Color");
    expect(result.js).toContain('"Color.Red"');
    expect(result.js).toContain('"Color.Blue"');
  });

  test("supports exhaustive match expressions with dot and qualified patterns", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const color = Color.Green;
const value = match color {
  .Red => "red",
  Color.Green => "green",
  .Blue => "blue",
};
`);

    expect(executeValue(result.js)).toBe("green");
    expect(result.js).toContain("switch");
    expect(result.js).toContain('case "Color.Green"');
  });

  test("supports wildcard match arms", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const color = Color.Blue;
const value = match color {
  .Red => "red",
  _ => "other",
};
`);

    expect(executeValue(result.js)).toBe("other");
    expect(result.js).toContain("default:");
  });

  test("supports contextual enum shorthand in function arguments", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Blue,
};

fn label(color: Color): string {
  match color {
    .Red => "red",
    .Blue => "blue",
  }
}

const value = label(.Blue);
`);

    expect(executeValue(result.js)).toBe("blue");
  });

  test("supports enum variants with positional payloads", () => {
    const result = expectCompileOk(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Move(10, 20);
const value = match message {
  .Move(x, y) => "Move to \${x}, \${y}",
  .Write(_) => "write",
  .Quit => "quit",
};
`);

    expect(executeValue(result.js)).toBe("Move to 10, 20");
    expect(result.js).toContain('tag: "Message.Move"');
    expect(result.js).toContain("values: [10, 20]");
    expect(result.js).toContain(".tag ??");
  });

  test("supports generic object aliases and aliases over generic instantiations", () => {
    const result = expectCompileOk(`
type Pair<A, B> = { first: A, second: B };
type StringPair<V> = Pair<string, V>;

const pair: StringPair<number> = { first: "x", second: 1 };
const value = pair.second;
`);

    expect(executeValue(result.js)).toBe(1);
  });

  test("supports generic enum construction and payload matching", () => {
    const result = expectCompileOk(`
const one = Option.Some(1);
const empty: Option<number> = .None;
const nested: Option<Option<number>> = .Some(one);
const value = match nested {
  .Some(inner) => match inner {
    .Some(value) => value,
    .None => 0,
  },
  .None => 0,
};
`);

    expect(executeValue(result.js)).toBe(1);
  });

  test("supports prelude Option and Result types", () => {
    const result = expectCompileOk(`
type ParseError = enum {
  Empty,
  Invalid,
};

const present = Option.Some(42);
const missing: Option<number> = .None;
const parsed: Result<number, ParseError> = .Ok(10);
const failed: Result<number, ParseError> = .Err(ParseError.Empty);

const optionValue = match present {
  .Some(value) => value,
  .None => 0,
};
const resultValue = match parsed {
  .Ok(value) => value,
  .Err(_) => 0,
};
const value = optionValue + resultValue;
`);

    expect(executeValue(result.js)).toBe(52);
    expect(result.js).toContain('"Option.Some"');
    expect(result.js).toContain('"Result.Ok"');
    expect(result.js).toContain('"Result.Err"');
    expect(result.js).toContain('"Option.None"');
    expect(result.js).toContain("const missing =");
    expect(result.js).toContain("const failed =");
  });

  test("supports safe array get through prelude Option", () => {
    const result = expectCompileOk(`
const values = [10, 20];
const first = match values.get(0) {
  .Some(value) => value,
  .None => 0,
};
const missing = match values.get(4) {
  .Some(value) => value,
  .None => 5,
};
const value = first + missing;
`);

    expect(executeValue(result.js)).toBe(15);
    expect(result.js).toContain("function __polenaArrayGet");
  });

  test("rejects invalid safe array get calls", () => {
    const wrongIndex = compile('const value = [1].get("0");');
    expect(wrongIndex.ok).toBe(false);
    expect(wrongIndex.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );

    const nonArray = compile("const value = 1.get(0);");
    expect(nonArray.ok).toBe(false);
    expect(nonArray.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'get' on type 'number'.",
    );
  });

  test("supports generic functions over arrays, objects, and enums", () => {
    const result = expectCompileOk(`
type Box<T> = { value: T };

fn identity<T>(value: T): T {
  value
}

fn first<T>(items: []T): Option<T> {
  if items.length == 0 {
    .None
  } else {
    .Some(items[0])
  }
}

fn unbox<T>(box: Box<T>): T {
  box.value
}

const numberValue = identity(41) + 1;
const stringValue = identity("ok");
const boxed = unbox({ value: stringValue });
const firstValue = match first([numberValue]) {
  .Some(value) => value,
  .None => 0,
};
const value = if boxed == "ok" { firstValue } else { 0 };
`);

    expect(executeValue(result.js)).toBe(42);
    expect(result.js).toContain("function identity(value)");
    expect(result.js).toContain("function first(items)");
  });

  test("infers generic function return type from context", () => {
    const result = expectCompileOk(`
fn none<T>(): Option<T> {
  .None
}

const value: Option<number> = none();
`);

    expect(result.js).toContain("function none()");
    expect(result.js).toContain('"Option.None"');
  });

  test("rejects invalid generic type argument usage", () => {
    const missing = compile(`
type Box<T> = { value: T };
const box: Box = { value: 1 };
`);
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Generic type 'Box' requires 1 type argument(s).",
    );

    const extra = compile(`
type Score = number;
const score: Score<string> = 1;
`);
    expect(extra.ok).toBe(false);
    expect(extra.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Type 'Score' does not take type arguments.",
    );

    const preludeConflict = compile("type Option<T> = enum { Some(T), None };");
    expect(preludeConflict.ok).toBe(false);
    expect(preludeConflict.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate type name 'Option'.",
    );
  });

  test("rejects invalid generic function usage", () => {
    const duplicate = compile("fn bad<T, T>(value: T): T { value }");
    expect(duplicate.ok).toBe(false);
    expect(duplicate.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate type parameter 'T'.",
    );

    const cannotInfer = compile(`
fn make<T>(): Option<T> {
  .None
}

const value = make();
`);
    expect(cannotInfer.ok).toBe(false);
    expect(cannotInfer.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer type argument(s) 'T' for 'make'.",
    );

    const mismatch = compile(`
fn choose<T>(left: T, right: T): T {
  left
}

const value = choose(1, "two");
`);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects generic enum construction when type arguments cannot be inferred", () => {
    const result = compile(`
const empty = Option.None;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer type arguments for 'Option.None'.",
    );
  });

  test("supports contextual shorthand construction and object payloads", () => {
    const result = expectCompileOk(`
type Message = enum {
  Move({ x: number, y: number }),
  Write(string),
  Quit,
};

fn label(message: Message): string {
  match message {
    .Move(pos) => "Move to \${pos.x}, \${pos.y}",
    .Write(value) => value,
    .Quit => "Quit",
  }
}

const direct: Message = .Move({ x: 3, y: 4 });
const value = label(.Move({ x: 10, y: 20 }));
`);

    expect(executeValue(result.js)).toBe("Move to 10, 20");
  });

  test("supports wildcard payload patterns", () => {
    const result = expectCompileOk(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Write("hello");
const value = match message {
  .Move(_, _) => "move",
  .Write(_) => "write",
  .Quit => "quit",
};
`);

    expect(executeValue(result.js)).toBe("write");
  });

  test("rejects duplicate enum variants", () => {
    const result = compile(`
type Color = enum {
  Red,
  Red,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate enum variant 'Red'.",
    );
  });

  test("rejects unknown enum variants", () => {
    const result = compile(`
type Color = enum {
  Red,
};

const value = Color.Blue;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown enum variant 'Color.Blue'.",
    );
  });

  test("rejects enum shorthand without contextual type", () => {
    const result = compile(`
type Color = enum {
  Red,
};

const value = .Red;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer enum type for '.Red'.",
    );
  });

  test("rejects invalid enum payload construction", () => {
    const makeConstructor = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const makeMove = Message.Move;
`);
    expect(makeConstructor.ok).toBe(false);
    expect(makeConstructor.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Move' requires 2 argument(s).",
    );

    const wrongArity = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Move(10);
`);
    expect(wrongArity.ok).toBe(false);
    expect(wrongArity.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 2 argument(s), got 1.",
    );

    const wrongTypes = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Move("x", "y");
`);
    expect(wrongTypes.ok).toBe(false);
    expect(wrongTypes.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );

    const fieldlessCall = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Quit();
`);
    expect(fieldlessCall.ok).toBe(false);
    expect(fieldlessCall.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Quit' has no associated data.",
    );

    const shorthandWithoutContext = compile(`
type Message = enum {
  Move(number, number),
};

const message = .Move(1, 2);
`);
    expect(shorthandWithoutContext.ok).toBe(false);
    expect(shorthandWithoutContext.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer enum type for '.Move'.",
    );
  });

  test("rejects equality across different enum types", () => {
    const result = compile(`
type Color = enum {
  Red,
};

type Status = enum {
  Red,
};

const value = Color.Red == Status.Red;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '==' requires compatible operands, got 'Color' and 'Status'.",
    );
  });

  test("rejects equality for enums with associated data", () => {
    const result = compile(`
type Message = enum {
  Write(string),
  Quit,
};

const value = Message.Quit == Message.Quit;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '==' cannot compare 'Message' values.",
    );
  });

  test("rejects enum ordering", () => {
    const result = compile(`
type Color = enum {
  Red,
  Blue,
};

const value = Color.Red < Color.Blue;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' cannot order 'Color' values.",
    );
  });

  test("rejects non-exhaustive enum matches", () => {
    const result = compile(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const color = Color.Red;
const value = match color {
  .Red => "red",
  .Green => "green",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Non-exhaustive match; missing '.Blue'.",
    );
  });

  test("rejects invalid enum payload match patterns", () => {
    const wrongArity = compile(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Move(1, 2);
const value = match message {
  .Move(x) => "move",
  .Write(_) => "write",
  .Quit => "quit",
};
`);
    expect(wrongArity.ok).toBe(false);
    expect(wrongArity.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 2 payload pattern(s), got 1.",
    );

    const omittedPayload = compile(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Write("hello");
const value = match message {
  .Move(_, _) => "move",
  .Write => "write",
  .Quit => "quit",
};
`);
    expect(omittedPayload.ok).toBe(false);
    expect(omittedPayload.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Write' requires 1 payload pattern(s).",
    );

    const fieldlessPayload = compile(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Quit;
const value = match message {
  .Move(_, _) => "move",
  .Write(_) => "write",
  .Quit() => "quit",
};
`);
    expect(fieldlessPayload.ok).toBe(false);
    expect(fieldlessPayload.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Quit' has no associated data.",
    );
  });

  test("rejects invalid enum payload pattern bindings", () => {
    const duplicateBinding = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Move(1, 2);
const value = match message {
  .Move(x, x) => "move",
  .Quit => "quit",
};
`);
    expect(duplicateBinding.ok).toBe(false);
    expect(duplicateBinding.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate pattern binding 'x'.",
    );

    const shadowedBinding = compile(`
type Message = enum {
  Write(string),
  Quit,
};

const text = "outer";
const message = Message.Write("inner");
const value = match message {
  .Write(text) => text,
  .Quit => "",
};
`);
    expect(shadowedBinding.ok).toBe(false);
    expect(shadowedBinding.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Name 'text' shadows an existing name.",
    );

    const outOfScopeBinding = compile(`
type Message = enum {
  Write(string),
  Quit,
};

const message = Message.Write("inner");
const value = match message {
  .Write(text) => text,
  .Quit => "",
};
const other = text;
`);
    expect(outOfScopeBinding.ok).toBe(false);
    expect(outOfScopeBinding.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown name 'text'.",
    );
  });

  test("rejects duplicate and unreachable match arms", () => {
    const duplicateResult = compile(`
type Color = enum {
  Red,
  Blue,
};

const color = Color.Red;
const value = match color {
  .Red => "red",
  .Red => "again",
  .Blue => "blue",
};
`);

    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate match arm for '.Red'.",
    );

    const unreachableResult = compile(`
type Color = enum {
  Red,
  Blue,
};

const color = Color.Red;
const value = match color {
  _ => "any",
  .Blue => "blue",
};
`);

    expect(unreachableResult.ok).toBe(false);
    expect(unreachableResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unreachable match arm.",
    );
  });

  test("rejects qualified match patterns from another enum", () => {
    const result = compile(`
type Color = enum {
  Red,
  Blue,
};

type Status = enum {
  Red,
};

const color = Color.Red;
const value = match color {
  Status.Red => "red",
  .Blue => "blue",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Match pattern uses enum 'Status', but scrutinee has type 'Color'.",
    );
  });

  test("rejects match arm result type mismatches", () => {
    const result = compile(`
type Color = enum {
  Red,
  Blue,
};

const color = Color.Red;
const value = match color {
  .Red => "red",
  .Blue => 1,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
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
