import {
  findHoverTarget,
  formatType,
  type AnalyzeResult,
  type HoverTarget,
  type NodeId,
  type Program,
  type ReferenceTarget,
  type Span,
} from "@polena/compiler";
import type { Hover, Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

type TopLevelDeclaration = Program["declarations"][number];
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;
type Block = FunctionDeclaration["body"];
type Statement = Block["statements"][number];
type Expression = VariableDeclaration["initializer"];
type TypeNode = TypeDeclaration["value"];
type Parameter = FunctionDeclaration["params"][number];
type ObjectTypeField = Extract<TypeNode, { readonly kind: "ObjectType" }>["fields"][number];
type EnumVariantTypeNode = Extract<TypeNode, { readonly kind: "EnumType" }>["variants"][number];
type ObjectLiteralField = Extract<Expression, { readonly kind: "ObjectLiteral" }>["fields"][number];
type MatchArm = Extract<Expression, { readonly kind: "MatchExpression" }>["arms"][number];
type MatchPattern = MatchArm["pattern"];
type EnumPayloadPattern = NonNullable<
  Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>["payload"]
>[number];

export function getHover(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
): Hover | null {
  const target = findHoverTarget(analysis.program, document.offsetAt(position));
  if (target === undefined) {
    return null;
  }

  const value = renderHover(analysis, target);
  if (value === undefined) {
    return null;
  }

  return {
    range: spanToRange(target.span),
    contents: {
      kind: "markdown",
      value: `\`\`\`polena\n${value}\n\`\`\``,
    },
  };
}

function renderHover(analysis: AnalyzeResult, target: HoverTarget): string | undefined {
  switch (target.kind) {
    case "Expression":
      return renderExpressionHover(analysis, target.nodeId);
    case "MemberName":
      return renderReferenceHover(analysis, target.nodeId);
    case "TypeReference":
      return (
        renderTypeReferenceHover(analysis, target.nodeId) ??
        renderNodeHover(analysis, target.nodeId)
      );
    case "Declaration":
    case "Parameter":
    case "PatternBinding":
    case "FieldDefinition":
    case "EnumVariantDefinition":
      return renderNodeHover(analysis, target.nodeId);
  }
}

function renderExpressionHover(analysis: AnalyzeResult, nodeId: NodeId): string | undefined {
  const reference = analysis.semantics.references.get(nodeId);
  const referenceHover = reference === undefined ? undefined : renderReference(reference, analysis);
  if (referenceHover !== undefined) {
    return referenceHover;
  }

  const type = analysis.semantics.expressionTypes.get(nodeId);
  if (type === undefined || type.kind === "unknown") {
    return undefined;
  }

  return formatType(type);
}

function renderReferenceHover(analysis: AnalyzeResult, nodeId: NodeId): string | undefined {
  const reference = analysis.semantics.references.get(nodeId);
  return reference === undefined ? undefined : renderReference(reference, analysis);
}

function renderTypeReferenceHover(analysis: AnalyzeResult, nodeId: NodeId): string | undefined {
  const reference = analysis.semantics.references.get(nodeId);
  if (reference?.kind !== "TypeAlias") {
    return undefined;
  }

  return renderNodeHover(analysis, reference.definitionNodeId);
}

function renderReference(reference: ReferenceTarget, analysis: AnalyzeResult): string | undefined {
  switch (reference.kind) {
    case "Local":
    case "Function":
      return renderNodeHover(analysis, reference.definitionNodeId);
    case "Prelude":
      return reference.name;
    case "TypeAlias":
      return renderNodeHover(analysis, reference.definitionNodeId);
    case "EnumVariant":
      return `${reference.enumName}.${reference.variantName}: ${reference.enumName}`;
    case "Field": {
      const node = findAstNode(analysis.program, reference.definitionNodeId);
      return node?.kind === "ObjectTypeField" || node?.kind === "ObjectLiteralField"
        ? renderFieldHover(analysis, node)
        : reference.name;
    }
  }
}

function renderNodeHover(analysis: AnalyzeResult, nodeId: NodeId): string | undefined {
  const node = findAstNode(analysis.program, nodeId);
  if (node === undefined) {
    return undefined;
  }

  switch (node.kind) {
    case "VariableDeclaration":
      return renderVariableHover(analysis, node);
    case "FunctionDeclaration":
      return renderFunctionHover(node);
    case "TypeDeclaration":
      return `type ${node.name} = ${formatTypeNode(node.value)}`;
    case "Parameter":
      return `${node.name}: ${formatTypeNode(node.type)}`;
    case "BindingPattern": {
      const type = analysis.semantics.patternBindingTypes.get(node.nodeId);
      return type === undefined || type.kind === "unknown"
        ? node.name
        : `${node.name}: ${formatType(type)}`;
    }
    case "ObjectTypeField":
    case "ObjectLiteralField":
      return renderFieldHover(analysis, node);
    case "EnumVariantType":
      return renderEnumVariantHover(analysis.program, node);
    case "PrimitiveType":
    case "NamedType":
    case "ArrayType":
    case "ObjectType":
    case "EnumType":
    case "UnknownType":
      return formatTypeNode(node);
    default:
      return undefined;
  }
}

function renderVariableHover(analysis: AnalyzeResult, declaration: VariableDeclaration): string {
  const type =
    declaration.typeAnnotation === undefined
      ? analysis.semantics.expressionTypes.get(declaration.initializer.nodeId)
      : undefined;
  const renderedType =
    declaration.typeAnnotation === undefined
      ? type === undefined || type.kind === "unknown"
        ? "unknown"
        : formatType(type)
      : formatTypeNode(declaration.typeAnnotation);

  return `${declaration.mutability} ${declaration.name}: ${renderedType}`;
}

function renderFunctionHover(declaration: FunctionDeclaration): string {
  const params = declaration.params
    .map((param) => `${param.name}: ${formatTypeNode(param.type)}`)
    .join(", ");
  return `fn ${declaration.name}(${params}): ${formatTypeNode(declaration.returnType)}`;
}

function renderFieldHover(
  analysis: AnalyzeResult,
  field: ObjectTypeField | ObjectLiteralField,
): string | undefined {
  if (field.kind === "ObjectTypeField") {
    return `${field.name}: ${formatTypeNode(field.type)}`;
  }

  const type = analysis.semantics.expressionTypes.get(field.value.nodeId);
  if (type === undefined || type.kind === "unknown") {
    return field.name;
  }

  return `${field.name}: ${formatType(type)}`;
}

function renderEnumVariantHover(
  program: Program,
  variant: EnumVariantTypeNode,
): string | undefined {
  const typeDeclaration = findEnumTypeDeclaration(program, variant.nodeId);
  return typeDeclaration === undefined
    ? variant.name
    : `${typeDeclaration.name}.${formatEnumVariantTypeNode(variant)}: ${typeDeclaration.name}`;
}

function formatTypeNode(typeNode: TypeNode): string {
  switch (typeNode.kind) {
    case "PrimitiveType":
      return typeNode.name;
    case "ArrayType":
      return `[]${formatTypeNode(typeNode.element)}`;
    case "NamedType":
      return typeNode.name;
    case "ObjectType":
      return `{ ${typeNode.fields
        .map((field) => `${field.name}: ${formatTypeNode(field.type)}`)
        .join(", ")} }`;
    case "EnumType":
      return `enum { ${typeNode.variants.map(formatEnumVariantTypeNode).join(", ")} }`;
    case "UnknownType":
      return "unknown";
  }
}

function formatEnumVariantTypeNode(variant: EnumVariantTypeNode): string {
  if (variant.payload.length === 0) {
    return variant.name;
  }

  return `${variant.name}(${variant.payload.map(formatTypeNode).join(", ")})`;
}

type AstNode =
  | Program
  | TopLevelDeclaration
  | Statement
  | Block
  | Expression
  | TypeNode
  | Parameter
  | ObjectTypeField
  | ObjectLiteralField
  | EnumVariantTypeNode
  | EnumPayloadPattern
  | MatchArm
  | MatchPattern;

function findAstNode(program: Program, nodeId: NodeId): AstNode | undefined {
  if (program.nodeId === nodeId) {
    return program;
  }

  for (const declaration of program.declarations) {
    const found = findAstNodeInTopLevelDeclaration(declaration, nodeId);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function findAstNodeInTopLevelDeclaration(
  declaration: TopLevelDeclaration,
  nodeId: NodeId,
): AstNode | undefined {
  if (declaration.nodeId === nodeId) {
    return declaration;
  }

  switch (declaration.kind) {
    case "TypeDeclaration":
      return findAstNodeInTypeNode(declaration.value, nodeId);
    case "FunctionDeclaration":
      for (const param of declaration.params) {
        if (param.nodeId === nodeId) {
          return param;
        }
        const paramType = findAstNodeInTypeNode(param.type, nodeId);
        if (paramType !== undefined) {
          return paramType;
        }
      }
      return (
        findAstNodeInTypeNode(declaration.returnType, nodeId) ??
        findAstNodeInBlock(declaration.body, nodeId)
      );
    case "VariableDeclaration":
      return (
        (declaration.typeAnnotation === undefined
          ? undefined
          : findAstNodeInTypeNode(declaration.typeAnnotation, nodeId)) ??
        findAstNodeInExpression(declaration.initializer, nodeId)
      );
    case "AssignmentStatement":
      return (
        findAstNodeInExpression(declaration.target, nodeId) ??
        findAstNodeInExpression(declaration.value, nodeId)
      );
    case "BreakStatement":
      return declaration.expression === undefined
        ? undefined
        : findAstNodeInExpression(declaration.expression, nodeId);
    case "ExpressionStatement":
      return findAstNodeInExpression(declaration.expression, nodeId);
    case "ContinueStatement":
      return undefined;
  }
}

function findAstNodeInBlock(block: Block, nodeId: NodeId): AstNode | undefined {
  if (block.nodeId === nodeId) {
    return block;
  }

  for (const statement of block.statements) {
    const found = findAstNodeInStatement(statement, nodeId);
    if (found !== undefined) {
      return found;
    }
  }

  return block.finalExpression === undefined
    ? undefined
    : findAstNodeInExpression(block.finalExpression, nodeId);
}

function findAstNodeInStatement(statement: Statement, nodeId: NodeId): AstNode | undefined {
  if (statement.nodeId === nodeId) {
    return statement;
  }

  switch (statement.kind) {
    case "VariableDeclaration":
      return (
        (statement.typeAnnotation === undefined
          ? undefined
          : findAstNodeInTypeNode(statement.typeAnnotation, nodeId)) ??
        findAstNodeInExpression(statement.initializer, nodeId)
      );
    case "AssignmentStatement":
      return (
        findAstNodeInExpression(statement.target, nodeId) ??
        findAstNodeInExpression(statement.value, nodeId)
      );
    case "ExpressionStatement":
      return findAstNodeInExpression(statement.expression, nodeId);
    case "ReturnStatement":
      return findAstNodeInExpression(statement.expression, nodeId);
    case "BreakStatement":
      return statement.expression === undefined
        ? undefined
        : findAstNodeInExpression(statement.expression, nodeId);
    case "ContinueStatement":
      return undefined;
  }
}

function findAstNodeInTypeNode(typeNode: TypeNode, nodeId: NodeId): AstNode | undefined {
  if (typeNode.nodeId === nodeId) {
    return typeNode;
  }

  switch (typeNode.kind) {
    case "ArrayType":
      return findAstNodeInTypeNode(typeNode.element, nodeId);
    case "ObjectType":
      for (const field of typeNode.fields) {
        if (field.nodeId === nodeId) {
          return field;
        }
        const found = findAstNodeInTypeNode(field.type, nodeId);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    case "EnumType":
      return findFirst(typeNode.variants, (variant) => {
        if (variant.nodeId === nodeId) {
          return variant;
        }

        return findFirst(variant.payload, (payloadType) =>
          findAstNodeInTypeNode(payloadType, nodeId),
        );
      });
    case "PrimitiveType":
    case "NamedType":
    case "UnknownType":
      return undefined;
  }
}

function findAstNodeInExpression(expression: Expression, nodeId: NodeId): AstNode | undefined {
  if (expression.nodeId === nodeId) {
    return expression;
  }

  switch (expression.kind) {
    case "StringLiteral":
      for (const part of expression.parts) {
        if (part.kind === "StringInterpolation") {
          const found = findAstNodeInExpression(part.expression, nodeId);
          if (found !== undefined) {
            return found;
          }
        }
      }
      return undefined;
    case "ArrayLiteral":
      return findFirst(expression.elements, (element) => findAstNodeInExpression(element, nodeId));
    case "ObjectLiteral":
      return findFirst(expression.fields, (field) => {
        if (field.nodeId === nodeId) {
          return field;
        }
        return findAstNodeInExpression(field.value, nodeId);
      });
    case "UnaryExpression":
      return findAstNodeInExpression(expression.operand, nodeId);
    case "BinaryExpression":
      return (
        findAstNodeInExpression(expression.left, nodeId) ??
        findAstNodeInExpression(expression.right, nodeId)
      );
    case "IfExpression":
      return (
        findAstNodeInExpression(expression.condition, nodeId) ??
        findAstNodeInBlock(expression.thenBlock, nodeId) ??
        (expression.elseBlock === undefined
          ? undefined
          : findAstNodeInBlock(expression.elseBlock, nodeId))
      );
    case "WhileExpression":
      return (
        findAstNodeInExpression(expression.condition, nodeId) ??
        (expression.continuation === undefined
          ? undefined
          : expression.continuation.kind === "AssignmentStatement"
            ? findAstNodeInTopLevelDeclaration(expression.continuation, nodeId)
            : findAstNodeInExpression(expression.continuation, nodeId)) ??
        findAstNodeInBlock(expression.body, nodeId) ??
        (expression.elseBlock === undefined
          ? undefined
          : findAstNodeInBlock(expression.elseBlock, nodeId))
      );
    case "MatchExpression":
      return (
        findAstNodeInExpression(expression.scrutinee, nodeId) ??
        findFirst(expression.arms, (arm) => {
          if (arm.nodeId === nodeId) {
            return arm;
          }
          if (arm.pattern.nodeId === nodeId) {
            return arm.pattern;
          }
          return (
            findAstNodeInMatchPattern(arm.pattern, nodeId) ??
            findAstNodeInExpression(arm.body, nodeId)
          );
        })
      );
    case "CallExpression":
      return (
        findAstNodeInExpression(expression.callee, nodeId) ??
        findFirst(expression.args, (arg) => findAstNodeInExpression(arg, nodeId))
      );
    case "IndexExpression":
      return (
        findAstNodeInExpression(expression.target, nodeId) ??
        findAstNodeInExpression(expression.index, nodeId)
      );
    case "MemberExpression":
      return findAstNodeInExpression(expression.target, nodeId);
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "EnumVariantExpression":
      return undefined;
  }
}

function findAstNodeInMatchPattern(pattern: MatchPattern, nodeId: NodeId): AstNode | undefined {
  if (pattern.kind !== "EnumVariantPattern") {
    return undefined;
  }

  return findFirst(pattern.payload ?? [], (payloadPattern) =>
    payloadPattern.nodeId === nodeId ? payloadPattern : undefined,
  );
}

function findEnumTypeDeclaration(
  program: Program,
  variantNodeId: NodeId,
): TypeDeclaration | undefined {
  for (const declaration of program.declarations) {
    if (declaration.kind !== "TypeDeclaration" || declaration.value.kind !== "EnumType") {
      continue;
    }

    if (declaration.value.variants.some((variant) => variant.nodeId === variantNodeId)) {
      return declaration;
    }
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

function spanToRange(span: Span): Hover["range"] {
  return {
    start: {
      line: span.start.line - 1,
      character: span.start.column - 1,
    },
    end: {
      line: span.end.line - 1,
      character: span.end.column - 1,
    },
  };
}
