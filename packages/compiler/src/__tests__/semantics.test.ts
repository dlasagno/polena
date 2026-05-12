import { describe, expect, test } from "bun:test";
import type { Expression, Program, Statement, TopLevelDeclaration, TypeNode } from "../ast";
import { analyze } from "../compiler";
import { primitiveType, unknownType } from "../types";

describe("semantics", () => {
  test("returns empty semantic tables from analysis", () => {
    const result = analyze("");

    expect(result.semantics.expressionTypes).toBeInstanceOf(Map);
    expect(result.semantics.references).toBeInstanceOf(Map);
    expect(result.semantics.definitions).toEqual([]);
    expect(result.semantics.expressionTypes.size).toBe(0);
  });

  test("records expression types", () => {
    const result = analyze("const x: number = 1 + 2;");
    const binary = findExpression(result.program, "BinaryExpression");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.semantics.expressionTypes.get(binary.nodeId)).toEqual(primitiveType("number"));
  });

  test("records enum variant, string literal, and unknown expression types", () => {
    const enumResult = analyze("type Color = enum { Red, Green }; const color: Color = .Red;");
    const variant = findExpression(enumResult.program, "EnumVariantExpression");
    expect(enumResult.diagnostics).toHaveLength(0);
    expect(enumResult.semantics.expressionTypes.get(variant.nodeId)).toMatchObject({
      kind: "enum",
      name: "Color",
    });

    const stringResult = analyze('const name = "Ada";');
    const stringLiteral = findExpression(stringResult.program, "StringLiteral");
    expect(stringResult.diagnostics).toHaveLength(0);
    expect(stringResult.semantics.expressionTypes.get(stringLiteral.nodeId)).toEqual(
      primitiveType("string"),
    );

    const unknownResult = analyze("const value = missing;");
    const missing = findExpression(unknownResult.program, "NameExpression");
    expect(unknownResult.semantics.expressionTypes.get(missing.nodeId)).toEqual(unknownType());
  });

  test("records local references", () => {
    const result = analyze("const x = 1; const y = x;");
    const xReference = findExpression(result.program, "NameExpression");
    const xDeclaration = result.program.declarations[0];

    expect(result.diagnostics).toHaveLength(0);
    expect(result.semantics.references.get(xReference.nodeId)).toMatchObject({
      kind: "Local",
      definitionNodeId: xDeclaration?.nodeId,
    });
  });

  test("records enum variant references for qualified and shorthand variants", () => {
    const result = analyze(
      "type Color = enum { Red, Green }; const a: Color = Color.Red; const b: Color = .Red;",
    );
    const qualified = findExpression(result.program, "MemberExpression");
    const shorthand = findExpression(result.program, "EnumVariantExpression");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.semantics.references.get(qualified.nodeId)).toMatchObject({
      kind: "EnumVariant",
      enumName: "Color",
      variantName: "Red",
    });
    expect(result.semantics.references.get(shorthand.nodeId)).toEqual(
      result.semantics.references.get(qualified.nodeId),
    );
  });

  test("records enum variant references and pattern binding types for payload enums", () => {
    const result = analyze(`
type Message = enum { Move(number, number), Quit };
const message = Message.Move(1, 2);
const label = match message {
  .Move(x, y) => x,
  .Quit => 0,
};
`);
    const constructorCall = findExpression(result.program, "CallExpression");
    if (constructorCall.callee.kind !== "MemberExpression") {
      throw new Error("expected enum constructor callee");
    }
    const match = findExpression(result.program, "MatchExpression");
    const movePattern = match.arms[0]?.pattern;
    if (movePattern?.kind !== "EnumVariantPattern") {
      throw new Error("expected enum variant pattern");
    }
    const xPattern = movePattern.payload?.[0];
    const xReference = match.arms[0]?.body;

    expect(result.diagnostics).toHaveLength(0);
    expect(result.semantics.references.get(constructorCall.callee.nodeId)).toMatchObject({
      kind: "EnumVariant",
      enumName: "Message",
      variantName: "Move",
    });
    expect(result.semantics.references.get(movePattern.nodeId)).toMatchObject({
      kind: "EnumVariant",
      enumName: "Message",
      variantName: "Move",
    });
    expect(xPattern).toMatchObject({ kind: "BindingPattern", name: "x" });
    expect(result.semantics.patternBindingTypes.get(xPattern?.nodeId ?? -1)).toEqual(
      primitiveType("number"),
    );
    expect(xReference).toMatchObject({ kind: "NameExpression", name: "x" });
    expect(result.semantics.references.get(xReference?.nodeId ?? -1)).toMatchObject({
      kind: "Local",
      definitionNodeId: xPattern?.nodeId,
    });
  });

  test("records type annotation references", () => {
    const result = analyze('type User = { name: string }; const user: User = { name: "Ada" };');
    const userType = findTypeNode(result.program, "NamedType");
    const typeDeclaration = result.program.declarations[0];

    expect(result.diagnostics).toHaveLength(0);
    expect(result.semantics.references.get(userType.nodeId)).toMatchObject({
      kind: "TypeAlias",
      definitionNodeId: typeDeclaration?.nodeId,
    });
  });

  test("records field access references", () => {
    const result = analyze(
      'type User = { name: string }; const user: User = { name: "Ada" }; const value = user.name;',
    );
    const member = findExpression(result.program, "MemberExpression");
    const fieldDefinition = result.semantics.definitions.find(
      (definition) => definition.kind === "Field" && definition.name === "name",
    );

    expect(result.diagnostics).toHaveLength(0);
    expect(result.semantics.references.get(member.nodeId)).toMatchObject({
      kind: "Field",
      definitionNodeId: fieldDefinition?.nodeId,
      nameSpan: fieldDefinition?.nameSpan,
    });
  });
});

function findExpression<K extends Expression["kind"]>(
  program: Program,
  kind: K,
): Extract<Expression, { readonly kind: K }> {
  for (const declaration of program.declarations) {
    const found = expressionFromDeclaration(declaration, kind);
    if (found !== undefined) {
      return found;
    }
  }

  throw new Error(`missing expression ${kind}`);
}

function expressionFromDeclaration<K extends Expression["kind"]>(
  declaration: Statement | TopLevelDeclaration,
  kind: K,
): Extract<Expression, { readonly kind: K }> | undefined {
  switch (declaration.kind) {
    case "VariableDeclaration":
      return findExpressionInExpression(declaration.initializer, kind);
    case "ExpressionStatement":
      return findExpressionInExpression(declaration.expression, kind);
    case "FunctionDeclaration":
      return declaration.body.finalExpression === undefined
        ? undefined
        : findExpressionInExpression(declaration.body.finalExpression, kind);
    case "AssignmentStatement":
      return (
        findExpressionInExpression(declaration.target, kind) ??
        findExpressionInExpression(declaration.value, kind)
      );
    case "BreakStatement":
      return declaration.expression === undefined
        ? undefined
        : findExpressionInExpression(declaration.expression, kind);
    case "TypeDeclaration":
    case "ContinueStatement":
      return undefined;
  }
}

function findExpressionInExpression<K extends Expression["kind"]>(
  expression: Expression,
  kind: K,
): Extract<Expression, { readonly kind: K }> | undefined {
  if (expression.kind === kind) {
    return expression as Extract<Expression, { readonly kind: K }>;
  }

  switch (expression.kind) {
    case "ArrayLiteral":
      return findFirst(expression.elements, (element) => findExpressionInExpression(element, kind));
    case "ObjectLiteral":
      return findFirst(expression.fields, (field) => findExpressionInExpression(field.value, kind));
    case "UnaryExpression":
      return findExpressionInExpression(expression.operand, kind);
    case "BinaryExpression":
      return (
        findExpressionInExpression(expression.left, kind) ??
        findExpressionInExpression(expression.right, kind)
      );
    case "IfExpression":
      return (
        findExpressionInExpression(expression.condition, kind) ??
        findFirst(expression.thenBlock.statements, (statement) =>
          expressionFromDeclaration(statement, kind),
        ) ??
        (expression.thenBlock.finalExpression === undefined
          ? undefined
          : findExpressionInExpression(expression.thenBlock.finalExpression, kind))
      );
    case "MatchExpression":
      return (
        findExpressionInExpression(expression.scrutinee, kind) ??
        findFirst(expression.arms, (arm) => findExpressionInExpression(arm.body, kind))
      );
    case "CallExpression":
      return (
        findExpressionInExpression(expression.callee, kind) ??
        findFirst(expression.args, (arg) => findExpressionInExpression(arg, kind))
      );
    case "IndexExpression":
      return (
        findExpressionInExpression(expression.target, kind) ??
        findExpressionInExpression(expression.index, kind)
      );
    case "MemberExpression":
      return findExpressionInExpression(expression.target, kind);
    case "StringLiteral":
      return findFirst(expression.parts, (part) =>
        part.kind === "StringInterpolation"
          ? findExpressionInExpression(part.expression, kind)
          : undefined,
      );
    case "WhileExpression":
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "EnumVariantExpression":
      return undefined;
  }
}

function findTypeNode<K extends TypeNode["kind"]>(
  program: Program,
  kind: K,
): Extract<TypeNode, { readonly kind: K }> {
  for (const declaration of program.declarations) {
    if (declaration.kind === "VariableDeclaration" && declaration.typeAnnotation !== undefined) {
      const found = findTypeNodeInTypeNode(declaration.typeAnnotation, kind);
      if (found !== undefined) {
        return found;
      }
    }
  }

  throw new Error(`missing type node ${kind}`);
}

function findTypeNodeInTypeNode<K extends TypeNode["kind"]>(
  typeNode: TypeNode,
  kind: K,
): Extract<TypeNode, { readonly kind: K }> | undefined {
  if (typeNode.kind === kind) {
    return typeNode as Extract<TypeNode, { readonly kind: K }>;
  }

  if (typeNode.kind === "ArrayType") {
    return findTypeNodeInTypeNode(typeNode.element, kind);
  }

  if (typeNode.kind === "ObjectType") {
    return findFirst(typeNode.fields, (field) => findTypeNodeInTypeNode(field.type, kind));
  }

  return undefined;
}

function findFirst<T, U>(items: readonly T[], callback: (item: T) => U | undefined): U | undefined {
  for (const item of items) {
    const found = callback(item);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}
