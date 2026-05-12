import { describe, expect, test } from "bun:test";
import type { Expression, Program, TypeNode } from "../ast";
import { findNodeAt, lex, parse } from "../compiler";

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
