import { describe, expect, test } from "bun:test";
import type { Expression, Program, TypeNode } from "../ast";
import { findHoverTarget, findNodeAt, lex, parse } from "../compiler";

describe("query", () => {
  test("finds an identifier inside a function body", () => {
    const source = "fn value(input: number): number { input }";
    const program = parseProgram(source);
    const expression = finalExpression(program);

    expect(findNodeAt(program, source.lastIndexOf("input"))).toBe(expression.nodeId);
  });

  test("finds a name inside a nested match arm", () => {
    const source = "const label = match color { .Red => color, .Green => color };";
    const program = parseProgram(source);
    const declaration = program.declarations[0];
    if (declaration?.kind !== "VariableDeclaration") {
      throw new Error("expected variable declaration");
    }
    const match = declaration.initializer;
    if (match.kind !== "MatchExpression") {
      throw new Error("expected match expression");
    }
    const body = match.arms[1]?.body;

    expect(body).toMatchObject({ kind: "NameExpression" });
    expect(findNodeAt(program, source.lastIndexOf("color"))).toBe(body?.nodeId);
  });

  test("returns undefined on whitespace outside nodes", () => {
    const source = "const x = 1;\n\nconst y = 2;";
    const program = parseProgram(source);

    expect(findNodeAt(program, source.indexOf("\n\n") + 1)).toBeUndefined();
  });

  test("finds a named type annotation", () => {
    const source = 'type User = { name: string }; const user: User = { name: "Ada" };';
    const program = parseProgram(source);
    const declaration = program.declarations[1];
    if (declaration?.kind !== "VariableDeclaration") {
      throw new Error("expected variable declaration");
    }
    const annotation = declaration.typeAnnotation;

    expect(annotation).toMatchObject({ kind: "NamedType" });
    expect(findNodeAt(program, source.lastIndexOf("User"))).toBe((annotation as TypeNode).nodeId);
  });

  test("does not resolve operators, keywords, or interior whitespace as hover targets", () => {
    const source = "const value = if ready { a and b } else { a + b };";
    const program = parseProgram(source);

    expect(findHoverTarget(program, source.indexOf("if"))).toBeUndefined();
    expect(findHoverTarget(program, source.indexOf("and"))).toBeUndefined();
    expect(findHoverTarget(program, source.indexOf("+"))).toBeUndefined();
    expect(findHoverTarget(program, source.indexOf(" {") + 1)).toBeUndefined();
  });

  test("classifies declaration, parameter, field, and type hover targets", () => {
    const source = "type User = { name: string }; fn greet(user: User): string { user.name }";
    const program = parseProgram(source);

    expect(findHoverTarget(program, source.indexOf("User"))).toMatchObject({
      kind: "Declaration",
    });
    expect(findHoverTarget(program, source.indexOf("user"))).toMatchObject({
      kind: "Parameter",
    });
    expect(findHoverTarget(program, source.indexOf("name"))).toMatchObject({
      kind: "FieldDefinition",
    });
    expect(findHoverTarget(program, source.lastIndexOf("User"))).toMatchObject({
      kind: "TypeReference",
    });
    expect(findHoverTarget(program, source.lastIndexOf("name"))).toMatchObject({
      kind: "MemberName",
    });
  });

  test("finds enum payload types and pattern bindings", () => {
    const source = `
type Message = enum { Move(number, number), Quit };
const message = Message.Move(1, 2);
const label = match message {
  .Move(x, y) => x,
  .Quit => 0,
};
`;
    const program = parseProgram(source);

    expect(findHoverTarget(program, source.indexOf("number"))).toMatchObject({
      kind: "TypeReference",
    });
    expect(findHoverTarget(program, source.indexOf("x,"))).toMatchObject({
      kind: "PatternBinding",
    });
  });
});

function parseProgram(source: string): Program {
  const result = parse(lex(source).tokens);
  expect(result.diagnostics).toHaveLength(0);
  return result.program;
}

function finalExpression(program: Program): Expression {
  const declaration = program.declarations[0];
  if (
    declaration?.kind !== "FunctionDeclaration" ||
    declaration.body.finalExpression === undefined
  ) {
    throw new Error("expected function final expression");
  }

  return declaration.body.finalExpression;
}
