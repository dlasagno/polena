import type {
  AssignmentStatement,
  Block,
  Expression,
  FunctionDeclaration,
  MatchArm,
  MatchPattern,
  NodeId,
  Program,
  Statement,
  TopLevelDeclaration,
  TypeDeclaration,
  TypeNode,
  VariableDeclaration,
} from "./ast";
import type { Span } from "./span";

export type HoverTargetKind =
  | "Expression"
  | "MemberName"
  | "TypeReference"
  | "Declaration"
  | "Parameter"
  | "FieldDefinition"
  | "EnumVariantDefinition";

export type HoverTarget = {
  readonly kind: HoverTargetKind;
  readonly nodeId: NodeId;
  readonly span: Span;
};

export function findNodeAt(program: Program, offset: number): NodeId | undefined {
  return findHoverTarget(program, offset)?.nodeId;
}

export function findHoverTarget(program: Program, offset: number): HoverTarget | undefined {
  for (const declaration of program.declarations) {
    const found = findInTopLevelDeclaration(declaration, offset);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function contains(span: Span, offset: number): boolean {
  return span.start.offset <= offset && offset < span.end.offset;
}

function target(kind: HoverTargetKind, nodeId: NodeId, span: Span): HoverTarget {
  return { kind, nodeId, span };
}

function findInTopLevelDeclaration(
  declaration: TopLevelDeclaration,
  offset: number,
): HoverTarget | undefined {
  if (!contains(declaration.span, offset)) {
    return undefined;
  }

  switch (declaration.kind) {
    case "TypeDeclaration":
      return findInTypeDeclaration(declaration, offset);
    case "FunctionDeclaration":
      return findInFunctionDeclaration(declaration, offset);
    case "VariableDeclaration":
      return findInVariableDeclaration(declaration, offset);
    case "AssignmentStatement":
      return findInAssignmentStatement(declaration, offset);
    case "BreakStatement":
      return declaration.expression === undefined
        ? undefined
        : findInExpression(declaration.expression, offset);
    case "ContinueStatement":
      return undefined;
    case "ExpressionStatement":
      return findInExpression(declaration.expression, offset);
  }
}

function findInTypeDeclaration(
  declaration: TypeDeclaration,
  offset: number,
): HoverTarget | undefined {
  if (contains(declaration.nameSpan, offset)) {
    return target("Declaration", declaration.nodeId, declaration.nameSpan);
  }

  return findInTypeNode(declaration.value, offset);
}

function findInFunctionDeclaration(
  declaration: FunctionDeclaration,
  offset: number,
): HoverTarget | undefined {
  if (contains(declaration.nameSpan, offset)) {
    return target("Declaration", declaration.nodeId, declaration.nameSpan);
  }

  for (const param of declaration.params) {
    const found = findInParameter(param, offset);
    if (found !== undefined) {
      return found;
    }
  }

  return findInTypeNode(declaration.returnType, offset) ?? findInBlock(declaration.body, offset);
}

function findInVariableDeclaration(
  declaration: VariableDeclaration,
  offset: number,
): HoverTarget | undefined {
  if (contains(declaration.nameSpan, offset)) {
    return target("Declaration", declaration.nodeId, declaration.nameSpan);
  }

  return (
    (declaration.typeAnnotation === undefined
      ? undefined
      : findInTypeNode(declaration.typeAnnotation, offset)) ??
    findInExpression(declaration.initializer, offset)
  );
}

function findInParameter(
  param: FunctionDeclaration["params"][number],
  offset: number,
): HoverTarget | undefined {
  if (!contains(param.span, offset)) {
    return undefined;
  }

  if (contains(param.nameSpan, offset)) {
    return target("Parameter", param.nodeId, param.nameSpan);
  }

  return findInTypeNode(param.type, offset);
}

function findInAssignmentStatement(
  statement: AssignmentStatement,
  offset: number,
): HoverTarget | undefined {
  return findInExpression(statement.target, offset) ?? findInExpression(statement.value, offset);
}

function findInBlock(block: Block, offset: number): HoverTarget | undefined {
  if (!contains(block.span, offset)) {
    return undefined;
  }

  for (const statement of block.statements) {
    const found = findInStatement(statement, offset);
    if (found !== undefined) {
      return found;
    }
  }

  return block.finalExpression === undefined
    ? undefined
    : findInExpression(block.finalExpression, offset);
}

function findInStatement(statement: Statement, offset: number): HoverTarget | undefined {
  if (!contains(statement.span, offset)) {
    return undefined;
  }

  switch (statement.kind) {
    case "VariableDeclaration":
      return findInVariableDeclaration(statement, offset);
    case "AssignmentStatement":
      return findInAssignmentStatement(statement, offset);
    case "ExpressionStatement":
      return findInExpression(statement.expression, offset);
    case "ReturnStatement":
      return findInExpression(statement.expression, offset);
    case "BreakStatement":
      return statement.expression === undefined
        ? undefined
        : findInExpression(statement.expression, offset);
    case "ContinueStatement":
      return undefined;
  }
}

function findInTypeNode(typeNode: TypeNode, offset: number): HoverTarget | undefined {
  if (!contains(typeNode.span, offset)) {
    return undefined;
  }

  switch (typeNode.kind) {
    case "ArrayType":
      return findInTypeNode(typeNode.element, offset);
    case "ObjectType":
      for (const field of typeNode.fields) {
        const found = findInObjectTypeField(field, offset);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    case "EnumType":
      for (const variant of typeNode.variants) {
        if (contains(variant.nameSpan, offset)) {
          return target("EnumVariantDefinition", variant.nodeId, variant.nameSpan);
        }
      }
      return undefined;
    case "NamedType":
      return contains(typeNode.nameSpan, offset)
        ? target("TypeReference", typeNode.nodeId, typeNode.nameSpan)
        : undefined;
    case "PrimitiveType":
    case "UnknownType":
      return target("TypeReference", typeNode.nodeId, typeNode.span);
  }
}

function findInObjectTypeField(
  field: Extract<TypeNode, { readonly kind: "ObjectType" }>["fields"][number],
  offset: number,
): HoverTarget | undefined {
  if (!contains(field.span, offset)) {
    return undefined;
  }

  if (contains(field.nameSpan, offset)) {
    return target("FieldDefinition", field.nodeId, field.nameSpan);
  }

  return findInTypeNode(field.type, offset);
}

function findInExpression(expression: Expression, offset: number): HoverTarget | undefined {
  if (!contains(expression.span, offset)) {
    return undefined;
  }

  switch (expression.kind) {
    case "StringLiteral":
      for (const part of expression.parts) {
        if (part.kind === "StringInterpolation") {
          const found = findInExpression(part.expression, offset);
          if (found !== undefined) {
            return found;
          }
        }
      }
      return target("Expression", expression.nodeId, expression.span);
    case "ArrayLiteral":
      for (const element of expression.elements) {
        const found = findInExpression(element, offset);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    case "ObjectLiteral":
      for (const field of expression.fields) {
        const found = findInObjectLiteralField(field, offset);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    case "UnaryExpression":
      return findInExpression(expression.operand, offset);
    case "BinaryExpression":
      return (
        findInExpression(expression.left, offset) ?? findInExpression(expression.right, offset)
      );
    case "IfExpression":
      return (
        findInExpression(expression.condition, offset) ??
        findInBlock(expression.thenBlock, offset) ??
        (expression.elseBlock === undefined ? undefined : findInBlock(expression.elseBlock, offset))
      );
    case "WhileExpression":
      return (
        findInExpression(expression.condition, offset) ??
        findInLoopContinuation(expression, offset) ??
        findInBlock(expression.body, offset) ??
        (expression.elseBlock === undefined ? undefined : findInBlock(expression.elseBlock, offset))
      );
    case "MatchExpression":
      return findInMatchExpression(expression, offset);
    case "CallExpression":
      for (const arg of expression.args) {
        const found = findInExpression(arg, offset);
        if (found !== undefined) {
          return found;
        }
      }
      return findInExpression(expression.callee, offset);
    case "IndexExpression":
      return (
        findInExpression(expression.target, offset) ?? findInExpression(expression.index, offset)
      );
    case "MemberExpression":
      if (contains(expression.nameSpan, offset)) {
        return target("MemberName", expression.nodeId, expression.nameSpan);
      }
      return findInExpression(expression.target, offset);
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
      return target("Expression", expression.nodeId, expression.span);
    case "EnumVariantExpression":
      if (expression.enumNameSpan !== undefined && contains(expression.enumNameSpan, offset)) {
        return target("TypeReference", expression.nodeId, expression.enumNameSpan);
      }
      return contains(expression.variantNameSpan, offset)
        ? target("Expression", expression.nodeId, expression.variantNameSpan)
        : undefined;
  }
}

function findInObjectLiteralField(
  field: Extract<Expression, { readonly kind: "ObjectLiteral" }>["fields"][number],
  offset: number,
): HoverTarget | undefined {
  if (!contains(field.span, offset)) {
    return undefined;
  }

  if (contains(field.nameSpan, offset)) {
    return target("FieldDefinition", field.nodeId, field.nameSpan);
  }

  return findInExpression(field.value, offset);
}

function findInLoopContinuation(
  expression: Extract<Expression, { readonly kind: "WhileExpression" }>,
  offset: number,
): HoverTarget | undefined {
  if (expression.continuation === undefined) {
    return undefined;
  }

  return expression.continuation.kind === "AssignmentStatement"
    ? findInAssignmentStatement(expression.continuation, offset)
    : findInExpression(expression.continuation, offset);
}

function findInMatchExpression(
  expression: Extract<Expression, { readonly kind: "MatchExpression" }>,
  offset: number,
): HoverTarget | undefined {
  const scrutinee = findInExpression(expression.scrutinee, offset);
  if (scrutinee !== undefined) {
    return scrutinee;
  }

  for (const arm of expression.arms) {
    const found = findInMatchArm(arm, offset);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function findInMatchArm(arm: MatchArm, offset: number): HoverTarget | undefined {
  if (!contains(arm.span, offset)) {
    return undefined;
  }

  return findInMatchPattern(arm.pattern, offset) ?? findInExpression(arm.body, offset);
}

function findInMatchPattern(pattern: MatchPattern, offset: number): HoverTarget | undefined {
  if (!contains(pattern.span, offset)) {
    return undefined;
  }

  switch (pattern.kind) {
    case "EnumVariantPattern":
      if (pattern.enumNameSpan !== undefined && contains(pattern.enumNameSpan, offset)) {
        return target("TypeReference", pattern.nodeId, pattern.enumNameSpan);
      }
      return contains(pattern.variantNameSpan, offset)
        ? target("Expression", pattern.nodeId, pattern.variantNameSpan)
        : undefined;
    case "WildcardPattern":
      return undefined;
  }
}
