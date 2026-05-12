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

export function findNodeAt(program: Program, offset: number): NodeId | undefined {
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

function choose(
  nodeId: NodeId,
  span: Span,
  offset: number,
  children: readonly (NodeId | undefined)[],
) {
  if (!contains(span, offset)) {
    return undefined;
  }

  for (const child of children) {
    if (child !== undefined) {
      return child;
    }
  }

  return nodeId;
}

function findInTopLevelDeclaration(
  declaration: TopLevelDeclaration,
  offset: number,
): NodeId | undefined {
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
      return choose(declaration.nodeId, declaration.span, offset, [
        declaration.expression === undefined
          ? undefined
          : findInExpression(declaration.expression, offset),
      ]);
    case "ContinueStatement":
      return contains(declaration.span, offset) ? declaration.nodeId : undefined;
    case "ExpressionStatement":
      return choose(declaration.nodeId, declaration.span, offset, [
        findInExpression(declaration.expression, offset),
      ]);
  }
}

function findInTypeDeclaration(declaration: TypeDeclaration, offset: number): NodeId | undefined {
  return choose(declaration.nodeId, declaration.span, offset, [
    findInTypeNode(declaration.value, offset),
  ]);
}

function findInFunctionDeclaration(
  declaration: FunctionDeclaration,
  offset: number,
): NodeId | undefined {
  return choose(declaration.nodeId, declaration.span, offset, [
    ...declaration.params.map((param) =>
      choose(param.nodeId, param.span, offset, [findInTypeNode(param.type, offset)]),
    ),
    findInTypeNode(declaration.returnType, offset),
    findInBlock(declaration.body, offset),
  ]);
}

function findInVariableDeclaration(
  declaration: VariableDeclaration,
  offset: number,
): NodeId | undefined {
  return choose(declaration.nodeId, declaration.span, offset, [
    declaration.typeAnnotation === undefined
      ? undefined
      : findInTypeNode(declaration.typeAnnotation, offset),
    findInExpression(declaration.initializer, offset),
  ]);
}

function findInAssignmentStatement(
  statement: AssignmentStatement,
  offset: number,
): NodeId | undefined {
  return choose(statement.nodeId, statement.span, offset, [
    findInExpression(statement.target, offset),
    findInExpression(statement.value, offset),
  ]);
}

function findInBlock(block: Block, offset: number): NodeId | undefined {
  return choose(block.nodeId, block.span, offset, [
    ...block.statements.map((statement) => findInStatement(statement, offset)),
    block.finalExpression === undefined
      ? undefined
      : findInExpression(block.finalExpression, offset),
  ]);
}

function findInStatement(statement: Statement, offset: number): NodeId | undefined {
  switch (statement.kind) {
    case "VariableDeclaration":
      return findInVariableDeclaration(statement, offset);
    case "AssignmentStatement":
      return findInAssignmentStatement(statement, offset);
    case "ExpressionStatement":
      return choose(statement.nodeId, statement.span, offset, [
        findInExpression(statement.expression, offset),
      ]);
    case "ReturnStatement":
      return choose(statement.nodeId, statement.span, offset, [
        findInExpression(statement.expression, offset),
      ]);
    case "BreakStatement":
      return choose(statement.nodeId, statement.span, offset, [
        statement.expression === undefined
          ? undefined
          : findInExpression(statement.expression, offset),
      ]);
    case "ContinueStatement":
      return contains(statement.span, offset) ? statement.nodeId : undefined;
  }
}

function findInTypeNode(typeNode: TypeNode, offset: number): NodeId | undefined {
  switch (typeNode.kind) {
    case "ArrayType":
      return choose(typeNode.nodeId, typeNode.span, offset, [
        findInTypeNode(typeNode.element, offset),
      ]);
    case "ObjectType":
      return choose(typeNode.nodeId, typeNode.span, offset, [
        ...typeNode.fields.map((field) =>
          choose(field.nodeId, field.span, offset, [findInTypeNode(field.type, offset)]),
        ),
      ]);
    case "EnumType":
      return choose(typeNode.nodeId, typeNode.span, offset, [
        ...typeNode.variants.map((variant) =>
          contains(variant.span, offset) ? variant.nodeId : undefined,
        ),
      ]);
    case "PrimitiveType":
    case "NamedType":
    case "UnknownType":
      return contains(typeNode.span, offset) ? typeNode.nodeId : undefined;
  }
}

function findInExpression(expression: Expression, offset: number): NodeId | undefined {
  switch (expression.kind) {
    case "StringLiteral":
      return choose(expression.nodeId, expression.span, offset, [
        ...expression.parts.map((part) =>
          part.kind === "StringInterpolation"
            ? findInExpression(part.expression, offset)
            : undefined,
        ),
      ]);
    case "ArrayLiteral":
      return choose(expression.nodeId, expression.span, offset, [
        ...expression.elements.map((element) => findInExpression(element, offset)),
      ]);
    case "ObjectLiteral":
      return choose(expression.nodeId, expression.span, offset, [
        ...expression.fields.map((field) =>
          choose(field.nodeId, field.span, offset, [findInExpression(field.value, offset)]),
        ),
      ]);
    case "UnaryExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.operand, offset),
      ]);
    case "BinaryExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.left, offset),
        findInExpression(expression.right, offset),
      ]);
    case "IfExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.condition, offset),
        findInBlock(expression.thenBlock, offset),
        expression.elseBlock === undefined ? undefined : findInBlock(expression.elseBlock, offset),
      ]);
    case "WhileExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.condition, offset),
        expression.continuation === undefined
          ? undefined
          : expression.continuation.kind === "AssignmentStatement"
            ? findInAssignmentStatement(expression.continuation, offset)
            : findInExpression(expression.continuation, offset),
        findInBlock(expression.body, offset),
        expression.elseBlock === undefined ? undefined : findInBlock(expression.elseBlock, offset),
      ]);
    case "MatchExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.scrutinee, offset),
        ...expression.arms.map((arm) => findInMatchArm(arm, offset)),
      ]);
    case "CallExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.callee, offset),
        ...expression.args.map((arg) => findInExpression(arg, offset)),
      ]);
    case "IndexExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.target, offset),
        findInExpression(expression.index, offset),
      ]);
    case "MemberExpression":
      return choose(expression.nodeId, expression.span, offset, [
        findInExpression(expression.target, offset),
      ]);
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "EnumVariantExpression":
      return contains(expression.span, offset) ? expression.nodeId : undefined;
  }
}

function findInMatchArm(arm: MatchArm, offset: number): NodeId | undefined {
  return choose(arm.nodeId, arm.span, offset, [
    findInMatchPattern(arm.pattern, offset),
    findInExpression(arm.body, offset),
  ]);
}

function findInMatchPattern(pattern: MatchPattern, offset: number): NodeId | undefined {
  return contains(pattern.span, offset) ? pattern.nodeId : undefined;
}
