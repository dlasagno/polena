import type { AnalyzeResult, Program, ReferenceTarget, Span } from "@polena/compiler";

type TopLevelDeclaration = Program["declarations"][number];
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;
type Block = FunctionDeclaration["body"];
type Statement = Block["statements"][number];
type Expression = VariableDeclaration["initializer"];
type TypeNode = TypeDeclaration["value"];
type MatchArm = Extract<Expression, { readonly kind: "MatchExpression" }>["arms"][number];
type MatchPattern = MatchArm["pattern"];
type EnumPayloadPattern = NonNullable<
  Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>["payload"]
>[number];

type SemanticTokenType =
  | "namespace"
  | "type"
  | "typeParameter"
  | "parameter"
  | "variable"
  | "property"
  | "function"
  | "macro"
  | "enumMember"
  | "keyword";

type SemanticTokenModifier = "declaration" | "readonly";

type SemanticToken = {
  readonly span: Span;
  readonly type: SemanticTokenType;
  readonly modifiers?: readonly SemanticTokenModifier[];
};

export type SemanticTokens = {
  readonly data: number[];
};

export const semanticTokenTypes: readonly SemanticTokenType[] = [
  "namespace",
  "type",
  "typeParameter",
  "parameter",
  "variable",
  "property",
  "function",
  "macro",
  "enumMember",
  "keyword",
];

export const semanticTokenModifiers: readonly SemanticTokenModifier[] = ["declaration", "readonly"];

export const semanticTokensLegend = {
  tokenTypes: [...semanticTokenTypes],
  tokenModifiers: [...semanticTokenModifiers],
};

export function getSemanticTokens(analysis: AnalyzeResult): SemanticTokens {
  return encodeSemanticTokens(collectSemanticTokens(analysis));
}

function collectSemanticTokens(analysis: AnalyzeResult): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  for (const importDeclaration of analysis.program.imports) {
    tokens.push({
      span: importDeclaration.path.span,
      type: "namespace",
    });

    if (importDeclaration.alias !== undefined) {
      tokens.push({
        span: importDeclaration.alias.nameSpan,
        type: "namespace",
        modifiers: ["declaration"],
      });
    }

    for (const item of importDeclaration.items) {
      tokens.push({
        span: item.nameSpan,
        type: item.namespace === "type" ? "type" : "variable",
      });

      if (item.alias !== undefined) {
        tokens.push({
          span: item.alias.nameSpan,
          type: item.namespace === "type" ? "type" : "variable",
          modifiers: ["declaration"],
        });
      }
    }
  }

  for (const declaration of analysis.program.declarations) {
    collectTopLevelDeclarationTokens(declaration, analysis, tokens);
  }

  return tokens;
}

function collectTopLevelDeclarationTokens(
  declaration: TopLevelDeclaration,
  analysis: AnalyzeResult,
  tokens: SemanticToken[],
): void {
  switch (declaration.kind) {
    case "TypeDeclaration":
      tokens.push({
        span: declaration.nameSpan,
        type: "type",
        modifiers: ["declaration"],
      });
      collectTypeParameterTokens(declaration.typeParameters, tokens);
      collectTypeNodeTokens(declaration.value, analysis, tokens);
      return;
    case "FunctionDeclaration":
      tokens.push({
        span: declaration.nameSpan,
        type: "function",
        modifiers: ["declaration"],
      });
      collectTypeParameterTokens(declaration.typeParameters, tokens);
      for (const param of declaration.params) {
        tokens.push({
          span: param.nameSpan,
          type: "parameter",
          modifiers: ["declaration"],
        });
        collectTypeNodeTokens(param.type, analysis, tokens);
      }
      collectTypeNodeTokens(declaration.returnType, analysis, tokens);
      collectBlockTokens(declaration.body, analysis, tokens);
      return;
    case "VariableDeclaration":
      collectVariableDeclarationTokens(declaration, analysis, tokens);
      return;
    case "AssignmentStatement":
      collectExpressionTokens(declaration.target, analysis, tokens);
      collectExpressionTokens(declaration.value, analysis, tokens);
      return;
    case "BreakStatement":
      if (declaration.expression !== undefined) {
        collectExpressionTokens(declaration.expression, analysis, tokens);
      }
      return;
    case "ExpressionStatement":
      collectExpressionTokens(declaration.expression, analysis, tokens);
      return;
    case "ContinueStatement":
      return;
  }
}

function collectTypeParameterTokens(
  typeParameters: FunctionDeclaration["typeParameters"],
  tokens: SemanticToken[],
): void {
  for (const param of typeParameters) {
    tokens.push({
      span: param.nameSpan,
      type: "typeParameter",
      modifiers: ["declaration"],
    });
  }
}

function collectVariableDeclarationTokens(
  declaration: VariableDeclaration,
  analysis: AnalyzeResult,
  tokens: SemanticToken[],
): void {
  tokens.push({
    span: declaration.nameSpan,
    type: "variable",
    modifiers: declaration.mutability === "const" ? ["declaration", "readonly"] : ["declaration"],
  });

  if (declaration.typeAnnotation !== undefined) {
    collectTypeNodeTokens(declaration.typeAnnotation, analysis, tokens);
  }
  collectExpressionTokens(declaration.initializer, analysis, tokens);
}

function collectBlockTokens(block: Block, analysis: AnalyzeResult, tokens: SemanticToken[]): void {
  for (const statement of block.statements) {
    collectStatementTokens(statement, analysis, tokens);
  }

  if (block.finalExpression !== undefined) {
    collectExpressionTokens(block.finalExpression, analysis, tokens);
  }
}

function collectStatementTokens(
  statement: Statement,
  analysis: AnalyzeResult,
  tokens: SemanticToken[],
): void {
  switch (statement.kind) {
    case "VariableDeclaration":
      collectVariableDeclarationTokens(statement, analysis, tokens);
      return;
    case "AssignmentStatement":
      collectExpressionTokens(statement.target, analysis, tokens);
      collectExpressionTokens(statement.value, analysis, tokens);
      return;
    case "ExpressionStatement":
    case "ReturnStatement":
      collectExpressionTokens(statement.expression, analysis, tokens);
      return;
    case "BreakStatement":
      if (statement.expression !== undefined) {
        collectExpressionTokens(statement.expression, analysis, tokens);
      }
      return;
    case "ContinueStatement":
      return;
  }
}

function collectTypeNodeTokens(
  typeNode: TypeNode,
  analysis: AnalyzeResult,
  tokens: SemanticToken[],
): void {
  switch (typeNode.kind) {
    case "PrimitiveType":
      tokens.push({ span: typeNode.span, type: "keyword" });
      return;
    case "NamedType":
      tokens.push({
        span: typeNode.nameSpan,
        type: tokenTypeForReference(analysis.semantics.references.get(typeNode.nodeId)) ?? "type",
        modifiers: tokenModifiersForReference(analysis.semantics.references.get(typeNode.nodeId)),
      });
      for (const typeArgument of typeNode.typeArguments) {
        collectTypeNodeTokens(typeArgument, analysis, tokens);
      }
      return;
    case "ArrayType":
      collectTypeNodeTokens(typeNode.element, analysis, tokens);
      return;
    case "ObjectType":
      for (const field of typeNode.fields) {
        tokens.push({
          span: field.nameSpan,
          type: "property",
          modifiers: ["declaration"],
        });
        collectTypeNodeTokens(field.type, analysis, tokens);
      }
      return;
    case "EnumType":
      for (const variant of typeNode.variants) {
        tokens.push({
          span: variant.nameSpan,
          type: "enumMember",
          modifiers: ["declaration", "readonly"],
        });
        for (const payload of variant.payload) {
          collectTypeNodeTokens(payload, analysis, tokens);
        }
      }
      return;
    case "UnknownType":
    case "OpaqueType":
      tokens.push({ span: typeNode.span, type: "keyword" });
      return;
  }
}

function collectExpressionTokens(
  expression: Expression,
  analysis: AnalyzeResult,
  tokens: SemanticToken[],
): void {
  switch (expression.kind) {
    case "NameExpression":
      tokens.push({
        span: expression.span,
        type:
          tokenTypeForReference(analysis.semantics.references.get(expression.nodeId)) ?? "variable",
        modifiers: tokenModifiersForReference(analysis.semantics.references.get(expression.nodeId)),
      });
      return;
    case "MemberExpression":
      collectExpressionTokens(expression.target, analysis, tokens);
      tokens.push({
        span: expression.nameSpan,
        type: "property",
        modifiers: tokenModifiersForReference(analysis.semantics.references.get(expression.nodeId)),
      });
      return;
    case "EnumVariantExpression":
      if (expression.enumNameSpan !== undefined) {
        tokens.push({
          span: expression.enumNameSpan,
          type: "type",
          modifiers: tokenModifiersForReference(
            analysis.semantics.references.get(expression.nodeId),
          ),
        });
      }
      tokens.push({
        span: expression.variantNameSpan,
        type: "enumMember",
        modifiers: tokenModifiersForReference(analysis.semantics.references.get(expression.nodeId)),
      });
      return;
    case "CallExpression":
      collectExpressionTokens(expression.callee, analysis, tokens);
      for (const arg of expression.args) {
        collectExpressionTokens(arg, analysis, tokens);
      }
      return;
    case "IndexExpression":
      collectExpressionTokens(expression.target, analysis, tokens);
      collectExpressionTokens(expression.index, analysis, tokens);
      return;
    case "UnaryExpression":
      collectExpressionTokens(expression.operand, analysis, tokens);
      return;
    case "BinaryExpression":
      collectExpressionTokens(expression.left, analysis, tokens);
      collectExpressionTokens(expression.right, analysis, tokens);
      return;
    case "ArrayLiteral":
      for (const element of expression.elements) {
        collectExpressionTokens(element, analysis, tokens);
      }
      return;
    case "ObjectLiteral":
      for (const field of expression.fields) {
        tokens.push({
          span: field.nameSpan,
          type: "property",
          modifiers: tokenModifiersForReference(analysis.semantics.references.get(field.nodeId)),
        });
        collectExpressionTokens(field.value, analysis, tokens);
      }
      return;
    case "DirectiveExpression":
      tokens.push({ span: expression.nameSpan, type: "macro" });
      for (const operand of expression.operands) {
        if (operand.kind === "ExpressionOperand") {
          collectExpressionTokens(operand.expression, analysis, tokens);
        } else {
          collectTypeNodeTokens(operand.type, analysis, tokens);
        }
      }
      return;
    case "IfExpression":
      collectExpressionTokens(expression.condition, analysis, tokens);
      collectBlockTokens(expression.thenBlock, analysis, tokens);
      if (expression.elseBlock !== undefined) {
        collectBlockTokens(expression.elseBlock, analysis, tokens);
      }
      return;
    case "WhileExpression":
      collectExpressionTokens(expression.condition, analysis, tokens);
      if (expression.continuation !== undefined) {
        if (expression.continuation.kind === "AssignmentStatement") {
          collectStatementTokens(expression.continuation, analysis, tokens);
        } else {
          collectExpressionTokens(expression.continuation, analysis, tokens);
        }
      }
      collectBlockTokens(expression.body, analysis, tokens);
      if (expression.elseBlock !== undefined) {
        collectBlockTokens(expression.elseBlock, analysis, tokens);
      }
      return;
    case "MatchExpression":
      collectExpressionTokens(expression.scrutinee, analysis, tokens);
      for (const arm of expression.arms) {
        collectMatchArmTokens(arm, analysis, tokens);
      }
      return;
    case "StringLiteral":
      for (const part of expression.parts) {
        if (part.kind === "StringInterpolation") {
          collectExpressionTokens(part.expression, analysis, tokens);
        }
      }
      return;
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
      return;
  }
}

function collectMatchArmTokens(
  arm: MatchArm,
  analysis: AnalyzeResult,
  tokens: SemanticToken[],
): void {
  collectMatchPatternTokens(arm.pattern, analysis, tokens);
  collectExpressionTokens(arm.body, analysis, tokens);
}

function collectMatchPatternTokens(
  pattern: MatchPattern,
  analysis: AnalyzeResult,
  tokens: SemanticToken[],
): void {
  switch (pattern.kind) {
    case "EnumVariantPattern":
      if (pattern.enumNameSpan !== undefined) {
        tokens.push({
          span: pattern.enumNameSpan,
          type: "type",
          modifiers: tokenModifiersForReference(analysis.semantics.references.get(pattern.nodeId)),
        });
      }
      tokens.push({
        span: pattern.variantNameSpan,
        type: "enumMember",
        modifiers: tokenModifiersForReference(analysis.semantics.references.get(pattern.nodeId)),
      });
      for (const payloadPattern of pattern.payload ?? []) {
        collectEnumPayloadPatternTokens(payloadPattern, tokens);
      }
      return;
    case "WildcardPattern":
      return;
  }
}

function collectEnumPayloadPatternTokens(
  pattern: EnumPayloadPattern,
  tokens: SemanticToken[],
): void {
  switch (pattern.kind) {
    case "BindingPattern":
      tokens.push({
        span: pattern.nameSpan,
        type: "parameter",
        modifiers: ["declaration"],
      });
      return;
    case "WildcardPattern":
      return;
  }
}

function tokenTypeForReference(
  reference: ReferenceTarget | undefined,
): SemanticTokenType | undefined {
  switch (reference?.kind) {
    case "Function":
      return "function";
    case "TypeAlias":
      return "type";
    case "EnumVariant":
      return "enumMember";
    case "Field":
      return "property";
    case "Module":
      return "namespace";
    case "Imported":
      return "variable";
    case "Local":
      return "variable";
    case undefined:
      return undefined;
  }
}

function tokenModifiersForReference(
  reference: ReferenceTarget | undefined,
): SemanticTokenModifier[] | undefined {
  switch (reference?.kind) {
    case "EnumVariant":
    case "Field":
      return ["readonly"];
    default:
      return undefined;
  }
}

function encodeSemanticTokens(tokens: readonly SemanticToken[]): SemanticTokens {
  const sorted = [...tokens].sort(compareTokens);
  const data: number[] = [];
  let previousLine = 0;
  let previousCharacter = 0;
  let hasPrevious = false;

  for (const token of sorted) {
    if (
      token.span.start.line !== token.span.end.line ||
      token.span.start.column >= token.span.end.column
    ) {
      continue;
    }

    const line = token.span.start.line - 1;
    const character = token.span.start.column - 1;
    const deltaLine = hasPrevious ? line - previousLine : line;
    const deltaStart = deltaLine === 0 && hasPrevious ? character - previousCharacter : character;

    data.push(
      deltaLine,
      deltaStart,
      token.span.end.column - token.span.start.column,
      semanticTokenTypes.indexOf(token.type),
      encodeTokenModifiers(token.modifiers ?? []),
    );

    previousLine = line;
    previousCharacter = character;
    hasPrevious = true;
  }

  return { data };
}

function compareTokens(left: SemanticToken, right: SemanticToken): number {
  return (
    left.span.start.offset - right.span.start.offset ||
    left.span.end.offset - right.span.end.offset ||
    semanticTokenTypes.indexOf(left.type) - semanticTokenTypes.indexOf(right.type)
  );
}

function encodeTokenModifiers(modifiers: readonly SemanticTokenModifier[]): number {
  let encoded = 0;
  for (const modifier of modifiers) {
    const index = semanticTokenModifiers.indexOf(modifier);
    if (index >= 0) {
      encoded |= 1 << index;
    }
  }
  return encoded;
}
