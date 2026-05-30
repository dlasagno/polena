import {
  formatType,
  type AnalyzeResult,
  type ModuleAnalysis,
  type Program,
  type ReferenceTarget,
  type Span,
} from "@polena/compiler";
import type {
  ParameterInformation,
  Position,
  SignatureHelp,
  SignatureInformation,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

type TopLevelDeclaration = Program["declarations"][number];
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;
type Block = FunctionDeclaration["body"];
type Statement = Block["statements"][number];
type Expression = VariableDeclaration["initializer"];
type MatchArm = Extract<Expression, { readonly kind: "MatchExpression" }>["arms"][number];

export type SignatureHelpContext = {
  readonly analysesByModuleName?: ReadonlyMap<string, ModuleAnalysis>;
};

type FunctionType = Extract<
  AnalyzeResult["semantics"]["expressionTypes"] extends Map<number, infer Value> ? Value : never,
  { readonly kind: "function" }
>;

const emptySignatureHelpContext: SignatureHelpContext = {};

export function getSignatureHelp(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  context: SignatureHelpContext = emptySignatureHelpContext,
): SignatureHelp | null {
  const offset = document.offsetAt(position);
  const call = findCallAtOffset(analysis.program, offset);
  if (call === undefined) {
    return null;
  }

  const calleeType = analysis.semantics.expressionTypes.get(call.callee.nodeId);
  if (calleeType?.kind !== "function") {
    return null;
  }

  const signature = signatureForCall(analysis, call, calleeType, context);
  return {
    signatures: [signature],
    activeSignature: 0,
    activeParameter: activeParameter(document.getText(), call, offset, calleeType.params.length),
  };
}

function signatureForCall(
  analysis: AnalyzeResult,
  call: Extract<Expression, { readonly kind: "CallExpression" }>,
  calleeType: FunctionType,
  context: SignatureHelpContext,
): SignatureInformation {
  const declaration = functionDeclarationForCall(analysis, call, context);
  const name = functionNameForCall(call, declaration);
  const parameters = calleeType.params.map((type, index): ParameterInformation => {
    const param = declaration?.params[index];
    return {
      label:
        param === undefined
          ? `arg${index}: ${formatType(type)}`
          : `${param.name}: ${formatTypeNode(param.type)}`,
    };
  });

  return {
    label: `${name}(${parameters.map((param) => param.label).join(", ")}): ${formatType(
      calleeType.returnType,
    )}`,
    parameters,
    documentation: declaration?.doc,
  };
}

function functionDeclarationForCall(
  analysis: AnalyzeResult,
  call: Extract<Expression, { readonly kind: "CallExpression" }>,
  context: SignatureHelpContext,
): FunctionDeclaration | undefined {
  const reference = analysis.semantics.references.get(call.callee.nodeId);
  if (reference === undefined || reference.kind === "Module") {
    return undefined;
  }

  const definitionAnalysis = analysisForReference(reference, analysis, context);
  const declaration = findTopLevelDeclaration(
    definitionAnalysis.program,
    reference.definitionNodeId,
  );
  return declaration?.kind === "FunctionDeclaration" ? declaration : undefined;
}

function analysisForReference(
  reference: Exclude<ReferenceTarget, { readonly kind: "Module" }>,
  fallback: AnalyzeResult,
  context: SignatureHelpContext,
): AnalyzeResult {
  const moduleName = moduleNameForReference(reference);
  if (moduleName === undefined) {
    return fallback;
  }

  return context.analysesByModuleName?.get(moduleName)?.analysis ?? fallback;
}

function moduleNameForReference(
  reference: Exclude<ReferenceTarget, { readonly kind: "Module" }>,
): string | undefined {
  switch (reference.kind) {
    case "Imported":
      return reference.moduleName;
    case "TypeAlias":
    case "EnumVariant":
    case "Field":
      return reference.moduleName;
    case "Local":
    case "Function":
      return undefined;
  }
}

function functionNameForCall(
  call: Extract<Expression, { readonly kind: "CallExpression" }>,
  declaration: FunctionDeclaration | undefined,
): string {
  if (declaration !== undefined) {
    return declaration.name;
  }

  if (call.callee.kind === "NameExpression") {
    return call.callee.name;
  }
  if (call.callee.kind === "MemberExpression") {
    return call.callee.name;
  }
  return "fn";
}

function activeParameter(
  source: string,
  call: Extract<Expression, { readonly kind: "CallExpression" }>,
  offset: number,
  parameterCount: number,
): number {
  if (parameterCount === 0) {
    return 0;
  }

  const openParenOffset = call.callee.span.end.offset;
  const beforeCursor = source.slice(openParenOffset + 1, offset);
  const commaCount = [...beforeCursor].filter((char) => char === ",").length;
  return Math.min(commaCount, parameterCount - 1);
}

function findCallAtOffset(
  program: Program,
  offset: number,
): Extract<Expression, { readonly kind: "CallExpression" }> | undefined {
  return findFirst(program.declarations, (declaration) =>
    callInTopLevelDeclaration(declaration, offset),
  );
}

function callInTopLevelDeclaration(
  declaration: TopLevelDeclaration,
  offset: number,
): Extract<Expression, { readonly kind: "CallExpression" }> | undefined {
  switch (declaration.kind) {
    case "TypeDeclaration":
      return undefined;
    case "FunctionDeclaration":
      return callInBlock(declaration.body, offset);
    case "VariableDeclaration":
      return callInExpression(declaration.initializer, offset);
    case "AssignmentStatement":
      return (
        callInExpression(declaration.target, offset) ?? callInExpression(declaration.value, offset)
      );
    case "BreakStatement":
      return declaration.expression === undefined
        ? undefined
        : callInExpression(declaration.expression, offset);
    case "ExpressionStatement":
      return callInExpression(declaration.expression, offset);
    case "ContinueStatement":
      return undefined;
  }
}

function callInBlock(
  block: Block,
  offset: number,
): Extract<Expression, { readonly kind: "CallExpression" }> | undefined {
  if (!containsOffset(block.span, offset)) {
    return undefined;
  }

  return (
    findFirst(block.statements, (statement) => callInStatement(statement, offset)) ??
    (block.finalExpression === undefined
      ? undefined
      : callInExpression(block.finalExpression, offset))
  );
}

function callInStatement(
  statement: Statement,
  offset: number,
): Extract<Expression, { readonly kind: "CallExpression" }> | undefined {
  if (!containsOffset(statement.span, offset)) {
    return undefined;
  }

  switch (statement.kind) {
    case "VariableDeclaration":
      return callInExpression(statement.initializer, offset);
    case "AssignmentStatement":
      return (
        callInExpression(statement.target, offset) ?? callInExpression(statement.value, offset)
      );
    case "ExpressionStatement":
    case "ReturnStatement":
      return callInExpression(statement.expression, offset);
    case "BreakStatement":
      return statement.expression === undefined
        ? undefined
        : callInExpression(statement.expression, offset);
    case "ContinueStatement":
      return undefined;
  }
}

function callInExpression(
  expression: Expression,
  offset: number,
): Extract<Expression, { readonly kind: "CallExpression" }> | undefined {
  if (!containsOffset(expression.span, offset)) {
    return undefined;
  }

  switch (expression.kind) {
    case "StringLiteral":
      return findFirst(expression.parts, (part) =>
        part.kind === "StringInterpolation" ? callInExpression(part.expression, offset) : undefined,
      );
    case "ArrayLiteral":
      return findFirst(expression.elements, (element) => callInExpression(element, offset));
    case "ObjectLiteral":
      return findFirst(expression.fields, (field) => callInExpression(field.value, offset));
    case "DirectiveExpression":
      return findFirst(expression.operands, (operand) =>
        operand.kind === "ExpressionOperand"
          ? callInExpression(operand.expression, offset)
          : undefined,
      );
    case "UnaryExpression":
      return callInExpression(expression.operand, offset);
    case "BinaryExpression":
      return (
        callInExpression(expression.left, offset) ?? callInExpression(expression.right, offset)
      );
    case "IfExpression":
      return (
        callInExpression(expression.condition, offset) ??
        callInBlock(expression.thenBlock, offset) ??
        (expression.elseBlock === undefined ? undefined : callInBlock(expression.elseBlock, offset))
      );
    case "WhileExpression":
      return (
        callInExpression(expression.condition, offset) ??
        (expression.continuation === undefined
          ? undefined
          : expression.continuation.kind === "AssignmentStatement"
            ? callInStatement(expression.continuation, offset)
            : callInExpression(expression.continuation, offset)) ??
        callInBlock(expression.body, offset) ??
        (expression.elseBlock === undefined ? undefined : callInBlock(expression.elseBlock, offset))
      );
    case "MatchExpression":
      return (
        callInExpression(expression.scrutinee, offset) ??
        findFirst(expression.arms, (arm) => callInMatchArm(arm, offset))
      );
    case "CallExpression":
      return (
        callInExpression(expression.callee, offset) ??
        findFirst(expression.args, (arg) => callInExpression(arg, offset)) ??
        (expression.callee.span.end.offset < offset ? expression : undefined)
      );
    case "IndexExpression":
      return (
        callInExpression(expression.target, offset) ?? callInExpression(expression.index, offset)
      );
    case "MemberExpression":
      return callInExpression(expression.target, offset);
    case "PanicExpression":
      return callInExpression(expression.message, offset);
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "EnumVariantExpression":
      return undefined;
  }
}

function callInMatchArm(
  arm: MatchArm,
  offset: number,
): Extract<Expression, { readonly kind: "CallExpression" }> | undefined {
  return containsOffset(arm.span, offset) ? callInExpression(arm.body, offset) : undefined;
}

function findTopLevelDeclaration(
  program: Program,
  nodeId: number,
): TopLevelDeclaration | undefined {
  return program.declarations.find((declaration) => declaration.nodeId === nodeId);
}

function containsOffset(span: Span, offset: number): boolean {
  return span.start.offset <= offset && offset <= span.end.offset;
}

function formatTypeNode(typeNode: TypeDeclaration["value"]): string {
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
      return `enum { ${typeNode.variants
        .map((variant) =>
          variant.payload.length === 0
            ? variant.name
            : `${variant.name}(${variant.payload.map(formatTypeNode).join(", ")})`,
        )
        .join(", ")} }`;
    case "NeverType":
      return "never";
    case "UnknownType":
      return "unknown";
    case "OpaqueType":
      return "opaque";
  }
}

function findFirst<T, U>(
  values: readonly T[],
  callback: (value: T) => U | undefined,
): U | undefined {
  for (const value of values) {
    const found = callback(value);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
