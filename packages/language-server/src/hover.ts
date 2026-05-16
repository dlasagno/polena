import {
  findHoverTarget,
  formatType,
  type AnalyzeResult,
  type HoverTarget,
  type ModuleAnalysis,
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
  context: HoverContext = emptyHoverContext,
): Hover | null {
  const target = findHoverTarget(analysis.program, document.offsetAt(position));
  if (target === undefined) {
    return null;
  }

  const value = renderHover(analysis, target, context);
  if (value === undefined) {
    return null;
  }

  return {
    range: spanToRange(target.span),
    contents: {
      kind: "markdown",
      value,
    },
  };
}

type HoverContext = {
  readonly analysesByModuleName?: ReadonlyMap<string, ModuleAnalysis>;
};

const emptyHoverContext: HoverContext = {};

function renderHover(
  analysis: AnalyzeResult,
  target: HoverTarget,
  context: HoverContext,
): string | undefined {
  switch (target.kind) {
    case "ModuleDoc":
      return analysis.program.doc;
    case "ModuleReference":
      return renderModuleReferenceHover(target, context);
    case "ImportMember":
      return renderImportMemberHover(target, context);
    case "Expression":
      return renderExpressionHover(analysis, target.nodeId, context);
    case "MemberName":
      return renderReferenceHover(analysis, target.nodeId, context);
    case "TypeReference":
      return (
        renderTypeReferenceHover(analysis, target.nodeId, context) ??
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

function renderModuleReferenceHover(
  target: HoverTarget,
  context: HoverContext,
): string | undefined {
  const moduleName = target.moduleName;
  if (moduleName === undefined) {
    return undefined;
  }

  return renderModuleHover(moduleName, context);
}

function renderModuleHover(moduleName: string, context: HoverContext): string {
  const moduleDoc = context.analysesByModuleName?.get(moduleName)?.analysis.program.doc;
  return renderCodeHover(`import ${moduleName};`, moduleDoc);
}

function renderImportMemberHover(target: HoverTarget, context: HoverContext): string | undefined {
  const moduleName = target.moduleName;
  const exportName = target.exportName;
  const namespace = target.importNamespace;
  if (moduleName === undefined || exportName === undefined || namespace === undefined) {
    return undefined;
  }

  const moduleAnalysis = context.analysesByModuleName?.get(moduleName)?.analysis;
  const declaration =
    moduleAnalysis === undefined
      ? undefined
      : findExportedDeclaration(moduleAnalysis.program, exportName, namespace);
  if (moduleAnalysis !== undefined && declaration !== undefined) {
    return renderNodeHover(moduleAnalysis, declaration.nodeId);
  }

  return renderCodeHover(namespace === "type" ? `type ${exportName}` : exportName, undefined);
}

function findExportedDeclaration(
  program: Program,
  exportName: string,
  namespace: "type" | "value",
): TypeDeclaration | FunctionDeclaration | VariableDeclaration | undefined {
  for (const declaration of program.declarations) {
    if (!("exported" in declaration) || !declaration.exported || declaration.name !== exportName) {
      continue;
    }

    if (namespace === "type" && declaration.kind === "TypeDeclaration") {
      return declaration;
    }
    if (
      namespace === "value" &&
      (declaration.kind === "FunctionDeclaration" || declaration.kind === "VariableDeclaration")
    ) {
      return declaration;
    }
  }

  return undefined;
}

function renderExpressionHover(
  analysis: AnalyzeResult,
  nodeId: NodeId,
  context: HoverContext,
): string | undefined {
  const reference = analysis.semantics.references.get(nodeId);
  const referenceHover =
    reference === undefined ? undefined : renderReference(reference, analysis, context);
  if (referenceHover !== undefined) {
    return referenceHover;
  }

  const type = analysis.semantics.expressionTypes.get(nodeId);
  if (type === undefined || type.kind === "unknown") {
    return undefined;
  }

  return renderCodeHover(formatType(type), undefined);
}

function renderReferenceHover(
  analysis: AnalyzeResult,
  nodeId: NodeId,
  context: HoverContext,
): string | undefined {
  const reference = analysis.semantics.references.get(nodeId);
  return reference === undefined ? undefined : renderReference(reference, analysis, context);
}

function renderTypeReferenceHover(
  analysis: AnalyzeResult,
  nodeId: NodeId,
  context: HoverContext,
): string | undefined {
  const reference = analysis.semantics.references.get(nodeId);
  if (reference?.kind !== "TypeAlias") {
    return undefined;
  }

  return renderNodeHover(
    resolveReferenceAnalysis(reference, analysis, context),
    reference.definitionNodeId,
  );
}

function renderReference(
  reference: ReferenceTarget,
  analysis: AnalyzeResult,
  context: HoverContext,
): string | undefined {
  const definitionAnalysis = resolveReferenceAnalysis(reference, analysis, context);
  switch (reference.kind) {
    case "Local":
    case "Function":
      return renderNodeHover(definitionAnalysis, reference.definitionNodeId);
    case "Prelude":
      return renderCodeHover(reference.name, undefined);
    case "TypeAlias":
      return renderNodeHover(definitionAnalysis, reference.definitionNodeId);
    case "EnumVariant":
      return renderNodeHover(definitionAnalysis, reference.definitionNodeId);
    case "Field": {
      const node = findAstNode(definitionAnalysis.program, reference.definitionNodeId);
      if (node?.kind === "ObjectTypeField" || node?.kind === "ObjectLiteralField") {
        return renderFieldHover(definitionAnalysis, node);
      }

      return renderNodeHover(definitionAnalysis, reference.definitionNodeId);
    }
    case "Imported":
      return renderNodeHover(definitionAnalysis, reference.definitionNodeId);
    case "Module":
      return renderModuleHover(reference.moduleName, context);
  }
}

function resolveReferenceAnalysis(
  reference: ReferenceTarget,
  fallback: AnalyzeResult,
  context: HoverContext,
): AnalyzeResult {
  const moduleName = moduleNameForReference(reference);
  if (moduleName === undefined) {
    return fallback;
  }

  return context.analysesByModuleName?.get(moduleName)?.analysis ?? fallback;
}

function moduleNameForReference(reference: ReferenceTarget): string | undefined {
  switch (reference.kind) {
    case "Imported":
    case "Module":
      return reference.moduleName;
    case "TypeAlias":
    case "EnumVariant":
    case "Field":
      return reference.moduleName;
    case "Local":
    case "Function":
    case "Prelude":
      return undefined;
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
      return renderCodeHover(`type ${node.name} = ${formatTypeNode(node.value)}`, node.doc);
    case "Parameter":
      return renderCodeHover(`${node.name}: ${formatTypeNode(node.type)}`, undefined);
    case "BindingPattern": {
      const type = analysis.semantics.patternBindingTypes.get(node.nodeId);
      const code =
        type === undefined || type.kind === "unknown"
          ? node.name
          : `${node.name}: ${formatType(type)}`;
      return renderCodeHover(code, undefined);
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
      return renderCodeHover(formatTypeNode(node), undefined);
    default:
      return undefined;
  }
}

function renderCodeHover(code: string, doc: string | undefined): string {
  const renderedCode = `\`\`\`polena\n${code}\n\`\`\``;
  return doc === undefined || doc.length === 0 ? renderedCode : `${renderedCode}\n\n${doc}`;
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

  return renderCodeHover(
    `${declaration.mutability} ${declaration.name}: ${renderedType}`,
    declaration.doc,
  );
}

function renderFunctionHover(declaration: FunctionDeclaration): string {
  const params = declaration.params
    .map((param) => `${param.name}: ${formatTypeNode(param.type)}`)
    .join(", ");
  return renderCodeHover(
    `fn ${declaration.name}(${params}): ${formatTypeNode(declaration.returnType)}`,
    declaration.doc,
  );
}

function renderFieldHover(
  analysis: AnalyzeResult,
  field: ObjectTypeField | ObjectLiteralField,
): string | undefined {
  if (field.kind === "ObjectTypeField") {
    return renderCodeHover(`${field.name}: ${formatTypeNode(field.type)}`, field.doc);
  }

  const type = analysis.semantics.expressionTypes.get(field.value.nodeId);
  if (type === undefined || type.kind === "unknown") {
    return renderCodeHover(field.name, undefined);
  }

  return renderCodeHover(`${field.name}: ${formatType(type)}`, undefined);
}

function renderEnumVariantHover(
  program: Program,
  variant: EnumVariantTypeNode,
): string | undefined {
  const typeDeclaration = findEnumTypeDeclaration(program, variant.nodeId);
  const code =
    typeDeclaration === undefined
      ? variant.name
      : `${typeDeclaration.name}.${formatEnumVariantTypeNode(variant)}: ${typeDeclaration.name}`;
  return renderCodeHover(code, variant.doc);
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
            ? findAstNodeInStatement(expression.continuation, nodeId)
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
