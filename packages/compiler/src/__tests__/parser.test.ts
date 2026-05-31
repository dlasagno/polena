import { describe, expect, test } from "bun:test";
import { lex, parse } from "../compiler";

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

  test("parses pipe expressions with low precedence", () => {
    const parseResult = parse(lex("const value = 1 + 2 |> double |> stringify;").tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "BinaryExpression",
        operator: "|>",
        left: {
          kind: "BinaryExpression",
          operator: "|>",
          left: {
            kind: "BinaryExpression",
            operator: "+",
          },
          right: { kind: "NameExpression", name: "double" },
        },
        right: { kind: "NameExpression", name: "stringify" },
      },
    });
  });

  test("parses pipe call placeholders as name expressions", () => {
    const parseResult = parse(lex("const value = 1 |> add(_, 2);").tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "BinaryExpression",
        operator: "|>",
        right: {
          kind: "CallExpression",
          callee: { kind: "NameExpression", name: "add" },
          args: [{ kind: "NameExpression", name: "_" }, { kind: "NumberLiteral" }],
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

  test("parses unknown and opaque type syntax", () => {
    const parseResult = parse(lex("type Json = unknown; type Date = opaque;").tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations).toMatchObject([
      {
        kind: "TypeDeclaration",
        name: "Json",
        value: { kind: "UnknownType", recovery: false },
      },
      {
        kind: "TypeDeclaration",
        name: "Date",
        value: { kind: "OpaqueType" },
      },
    ]);
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

  test("parses function type annotations", () => {
    const parseResult = parse(lex("const op: fn(number, number) -> number = add;").tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      typeAnnotation: {
        kind: "FunctionType",
        params: [
          { kind: "PrimitiveType", name: "number" },
          { kind: "PrimitiveType", name: "number" },
        ],
        returnType: { kind: "PrimitiveType", name: "number" },
      },
    });
  });

  test("parses anonymous function expressions", () => {
    const parseResult = parse(
      lex("const double = fn (value: number): number { value * 2 };").tokens,
    );

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "AnonymousFunctionExpression",
        params: [{ name: "value", type: { kind: "PrimitiveType", name: "number" } }],
        returnType: { kind: "PrimitiveType", name: "number" },
      },
    });
  });

  test("parses anonymous function expressions with omitted contextual types", () => {
    const parseResult = parse(lex("const double = fn (value) { value * 2 };").tokens);

    expect(parseResult.diagnostics).toHaveLength(0);
    expect(parseResult.program.declarations[0]).toMatchObject({
      kind: "VariableDeclaration",
      initializer: {
        kind: "AnonymousFunctionExpression",
        params: [{ name: "value" }],
      },
    });
    const declaration = parseResult.program.declarations[0];
    if (
      declaration === undefined ||
      declaration.kind !== "VariableDeclaration" ||
      declaration.initializer.kind !== "AnonymousFunctionExpression"
    ) {
      throw new Error("expected anonymous function initializer");
    }
    expect(declaration.initializer.params[0]?.type).toBeUndefined();
    expect(declaration.initializer.returnType).toBeUndefined();
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
