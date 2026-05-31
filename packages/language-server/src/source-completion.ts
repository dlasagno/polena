import { formatType, type AnalyzeResult, type NodeId, type Program } from "@polena/compiler";
import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
} from "vscode-languageserver/node";
import type { Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

type TopLevelDeclaration = Program["declarations"][number];
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;
type Block = FunctionDeclaration["body"];
type Statement = Block["statements"][number];
type Expression = VariableDeclaration["initializer"];
type TypeNode = TypeDeclaration["value"];
type EnumVariantTypeNode = Extract<TypeNode, { readonly kind: "EnumType" }>["variants"][number];
type MatchArm = Extract<Expression, { readonly kind: "MatchExpression" }>["arms"][number];
type MatchPattern = MatchArm["pattern"];

const primitiveTypes = ["number", "bigint", "string", "boolean", "void", "unknown"] as const;
const topLevelKeywords = ["import", "export", "type", "fn", "const", "let"] as const;
const statementKeywords = [
  "const",
  "let",
  "return",
  "if",
  "while",
  "match",
  "break",
  "continue",
] as const;
const expressionKeywords = ["true", "false", "if", "while", "match"] as const;

type SourceCompletionContext = "type" | "top-level" | "statement" | "expression";

export function getSourceCompletions(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
): CompletionItem[] {
  const offset = document.offsetAt(position);
  const memberExpression = findMemberCompletionExpression(analysis.program, offset);
  if (memberExpression !== undefined) {
    return memberCompletions(analysis, memberExpression);
  }

  const enumExpression = findEnumVariantCompletionExpression(analysis.program, offset);
  if (enumExpression !== undefined) {
    return enumVariantCompletions(analysis, enumExpression.nodeId);
  }

  if (isAfterDot(document.getText(), offset)) {
    return [];
  }

  const context = sourceCompletionContext(document.getText(), analysis.program, offset);
  switch (context) {
    case "type":
      return uniqueCompletions(typeCompletions(analysis.program, offset));
    case "top-level":
      return uniqueCompletions([
        ...keywordCompletions(topLevelKeywords),
        ...visibleValueCompletions(analysis.program, offset),
        ...visibleTypeCompletions(analysis.program, offset),
      ]);
    case "statement":
      return uniqueCompletions([
        ...keywordCompletions(statementKeywords),
        ...visibleValueCompletions(analysis.program, offset),
        ...visibleTypeCompletions(analysis.program, offset),
      ]);
    case "expression":
      return uniqueCompletions([
        ...visibleValueCompletions(analysis.program, offset),
        ...keywordCompletions(expressionKeywords),
      ]);
  }
}

function memberCompletions(
  analysis: AnalyzeResult,
  expression: Extract<Expression, { readonly kind: "MemberExpression" }>,
): CompletionItem[] {
  const type = analysis.semantics.expressionTypes.get(expression.target.nodeId);
  if (type === undefined) {
    return [];
  }

  if (type.kind === "object") {
    return type.fields.map((field) => ({
      label: field.name,
      kind: CompletionItemKind.Field,
      detail: formatType(field.type),
    }));
  }

  if (type.kind === "array") {
    return [{ label: "length", kind: CompletionItemKind.Property, detail: "number" }];
  }

  return [];
}

function enumVariantCompletions(analysis: AnalyzeResult, nodeId: NodeId): CompletionItem[] {
  const type = analysis.semantics.expressionTypes.get(nodeId);
  if (type?.kind !== "enum") {
    return [];
  }

  return type.variants.map((variant) => ({
    label: variant.name,
    kind: CompletionItemKind.EnumMember,
    detail:
      variant.payload.length === 0
        ? type.name
        : `${type.name}.${variant.name}(${variant.payload.map(formatType).join(", ")})`,
  }));
}

function visibleValueCompletions(program: Program, offset: number): CompletionItem[] {
  const completions: CompletionItem[] = [];

  for (const declaration of program.imports) {
    for (const item of declaration.items) {
      if (item.namespace === "value" && item.span.start.offset <= offset) {
        completions.push({
          label: item.alias?.name ?? item.name,
          kind: CompletionItemKind.Value,
          detail: `imported from ${declaration.path.text}`,
        });
      }
    }
    if (declaration.alias !== undefined && declaration.span.start.offset <= offset) {
      completions.push({
        label: declaration.alias.name,
        kind: CompletionItemKind.Module,
        detail: declaration.path.text,
      });
    }
  }

  for (const declaration of program.declarations) {
    if (declaration.span.start.offset <= offset) {
      if (declaration.kind === "FunctionDeclaration") {
        completions.push({
          label: declaration.name,
          kind: CompletionItemKind.Function,
          detail: formatFunctionDetail(declaration),
        });
      } else if (declaration.kind === "VariableDeclaration") {
        completions.push({
          label: declaration.name,
          kind:
            declaration.mutability === "const"
              ? CompletionItemKind.Constant
              : CompletionItemKind.Variable,
        });
      }
    }
  }

  completions.push(...localValueCompletions(program, offset));
  return completions;
}

function typeCompletions(program: Program, offset: number): CompletionItem[] {
  return [
    ...visibleTypeCompletions(program, offset),
    ...primitiveTypes.map((name) => ({
      label: name,
      kind: CompletionItemKind.Keyword,
    })),
    {
      label: "[]",
      kind: CompletionItemKind.Keyword,
      detail: "array type",
      insertText: "[]$1",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "enum",
      kind: CompletionItemKind.Keyword,
      detail: "enum type",
      insertText: "enum { $1 }",
      insertTextFormat: InsertTextFormat.Snippet,
    },
    {
      label: "opaque",
      kind: CompletionItemKind.Keyword,
      detail: "opaque type",
    },
  ];
}

function keywordCompletions(keywords: readonly string[]): CompletionItem[] {
  return keywords.map(keywordCompletion);
}

function keywordCompletion(keyword: string): CompletionItem {
  switch (keyword) {
    case "fn":
      return {
        label: keyword,
        kind: CompletionItemKind.Keyword,
        insertText: `fn ${snippetPlaceholder("1:name")}(${snippetPlaceholder(
          "2",
        )}): ${snippetPlaceholder("3:void")} {\n  $0\n}`,
        insertTextFormat: InsertTextFormat.Snippet,
      };
    case "type":
      return {
        label: keyword,
        kind: CompletionItemKind.Keyword,
        insertText: `type ${snippetPlaceholder("1:Name")} = $0;`,
        insertTextFormat: InsertTextFormat.Snippet,
      };
    case "import":
      return {
        label: keyword,
        kind: CompletionItemKind.Keyword,
        insertText: `import @/${snippetPlaceholder("1:module")};`,
        insertTextFormat: InsertTextFormat.Snippet,
      };
    case "const":
    case "let":
      return {
        label: keyword,
        kind: CompletionItemKind.Keyword,
        insertText: `${keyword} ${snippetPlaceholder("1:name")} = $0;`,
        insertTextFormat: InsertTextFormat.Snippet,
      };
    case "if":
      return {
        label: keyword,
        kind: CompletionItemKind.Keyword,
        insertText: "if $1 {\n  $0\n}",
        insertTextFormat: InsertTextFormat.Snippet,
      };
    case "while":
      return {
        label: keyword,
        kind: CompletionItemKind.Keyword,
        insertText: "while $1 {\n  $0\n}",
        insertTextFormat: InsertTextFormat.Snippet,
      };
    case "match":
      return {
        label: keyword,
        kind: CompletionItemKind.Keyword,
        insertText: "match $1 {\n  $0\n}",
        insertTextFormat: InsertTextFormat.Snippet,
      };
    default:
      return { label: keyword, kind: CompletionItemKind.Keyword };
  }
}

function snippetPlaceholder(value: string): string {
  return `\${${value}}`;
}

function visibleTypeCompletions(program: Program, offset: number): CompletionItem[] {
  const completions: CompletionItem[] = [];

  for (const declaration of program.imports) {
    for (const item of declaration.items) {
      if (item.namespace === "type" && item.span.start.offset <= offset) {
        completions.push({
          label: item.alias?.name ?? item.name,
          kind: CompletionItemKind.TypeParameter,
          detail: `imported from ${declaration.path.text}`,
        });
      }
    }
  }

  for (const declaration of program.declarations) {
    if (declaration.kind === "TypeDeclaration" && declaration.span.start.offset <= offset) {
      completions.push({
        label: declaration.name,
        kind:
          declaration.value.kind === "EnumType"
            ? CompletionItemKind.Enum
            : CompletionItemKind.Struct,
        detail: "type",
      });
    }
  }

  return completions;
}

function localValueCompletions(program: Program, offset: number): CompletionItem[] {
  const completions: CompletionItem[] = [];

  for (const declaration of program.declarations) {
    if (declaration.kind !== "FunctionDeclaration" || !containsOffset(declaration.body, offset)) {
      continue;
    }

    for (const param of declaration.params) {
      completions.push({
        label: param.name,
        kind: CompletionItemKind.Variable,
        detail: formatTypeNode(param.type),
      });
    }
    completions.push(...localCompletionsInBlock(declaration.body, offset));
  }

  return completions;
}

function localCompletionsInBlock(block: Block, offset: number): CompletionItem[] {
  const completions: CompletionItem[] = [];
  for (const statement of block.statements) {
    if (statement.span.start.offset >= offset) {
      continue;
    }

    if (statement.kind === "VariableDeclaration") {
      completions.push({
        label: statement.name,
        kind:
          statement.mutability === "const"
            ? CompletionItemKind.Constant
            : CompletionItemKind.Variable,
      });
    }
    completions.push(...nestedLocalCompletionsInStatement(statement, offset));
  }

  if (block.finalExpression !== undefined) {
    completions.push(...nestedLocalCompletionsInExpression(block.finalExpression, offset));
  }

  return completions;
}

function nestedLocalCompletionsInStatement(statement: Statement, offset: number): CompletionItem[] {
  switch (statement.kind) {
    case "VariableDeclaration":
      return nestedLocalCompletionsInExpression(statement.initializer, offset);
    case "AssignmentStatement":
      return [
        ...nestedLocalCompletionsInExpression(statement.target, offset),
        ...nestedLocalCompletionsInExpression(statement.value, offset),
      ];
    case "ExpressionStatement":
    case "ReturnStatement":
      return nestedLocalCompletionsInExpression(statement.expression, offset);
    case "BreakStatement":
      return statement.expression === undefined
        ? []
        : nestedLocalCompletionsInExpression(statement.expression, offset);
    case "ContinueStatement":
      return [];
  }
}

function nestedLocalCompletionsInExpression(
  expression: Expression,
  offset: number,
): CompletionItem[] {
  if (!containsOffset(expression, offset)) {
    return [];
  }

  switch (expression.kind) {
    case "IfExpression":
      return [
        ...nestedLocalCompletionsInExpression(expression.condition, offset),
        ...localCompletionsInBlock(expression.thenBlock, offset),
        ...(expression.elseBlock === undefined
          ? []
          : localCompletionsInBlock(expression.elseBlock, offset)),
      ];
    case "WhileExpression":
      return [
        ...nestedLocalCompletionsInExpression(expression.condition, offset),
        ...(expression.continuation === undefined
          ? []
          : expression.continuation.kind === "AssignmentStatement"
            ? nestedLocalCompletionsInStatement(expression.continuation, offset)
            : nestedLocalCompletionsInExpression(expression.continuation, offset)),
        ...localCompletionsInBlock(expression.body, offset),
        ...(expression.elseBlock === undefined
          ? []
          : localCompletionsInBlock(expression.elseBlock, offset)),
      ];
    case "MatchExpression":
      return [
        ...nestedLocalCompletionsInExpression(expression.scrutinee, offset),
        ...expression.arms.flatMap((arm) => localCompletionsInMatchArm(arm, offset)),
      ];
    case "StringLiteral":
      return expression.parts.flatMap((part) =>
        part.kind === "StringInterpolation"
          ? nestedLocalCompletionsInExpression(part.expression, offset)
          : [],
      );
    case "ArrayLiteral":
      return expression.elements.flatMap((element) =>
        nestedLocalCompletionsInExpression(element, offset),
      );
    case "ObjectLiteral":
      return expression.fields.flatMap((field) =>
        nestedLocalCompletionsInExpression(field.value, offset),
      );
    case "AnonymousFunctionExpression":
      if (!containsOffset(expression.body, offset)) {
        return [];
      }
      return [
        ...expression.params.map((param) => ({
          label: param.name,
          kind: CompletionItemKind.Variable,
          detail: formatTypeNode(param.type),
        })),
        ...localCompletionsInBlock(expression.body, offset),
      ];
    case "DirectiveExpression":
      return expression.operands.flatMap((operand) =>
        operand.kind === "ExpressionOperand"
          ? nestedLocalCompletionsInExpression(operand.expression, offset)
          : [],
      );
    case "UnaryExpression":
      return nestedLocalCompletionsInExpression(expression.operand, offset);
    case "BinaryExpression":
      return [
        ...nestedLocalCompletionsInExpression(expression.left, offset),
        ...nestedLocalCompletionsInExpression(expression.right, offset),
      ];
    case "CallExpression":
      return [
        ...nestedLocalCompletionsInExpression(expression.callee, offset),
        ...expression.args.flatMap((arg) => nestedLocalCompletionsInExpression(arg, offset)),
      ];
    case "IndexExpression":
      return [
        ...nestedLocalCompletionsInExpression(expression.target, offset),
        ...nestedLocalCompletionsInExpression(expression.index, offset),
      ];
    case "MemberExpression":
      return nestedLocalCompletionsInExpression(expression.target, offset);
    case "PanicExpression":
      return nestedLocalCompletionsInExpression(expression.message, offset);
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "EnumVariantExpression":
    case "RecoveryExpression":
      return [];
  }
}

function localCompletionsInMatchArm(arm: MatchArm, offset: number): CompletionItem[] {
  if (!containsOffset(arm, offset)) {
    return [];
  }

  return [
    ...patternBindingCompletions(arm.pattern),
    ...nestedLocalCompletionsInExpression(arm.body, offset),
  ];
}

function patternBindingCompletions(pattern: MatchPattern): CompletionItem[] {
  if (pattern.kind !== "EnumVariantPattern") {
    return [];
  }

  return (pattern.payload ?? [])
    .filter((payloadPattern) => payloadPattern.kind === "BindingPattern")
    .map((payloadPattern) => ({
      label: payloadPattern.name,
      kind: CompletionItemKind.Variable,
    }));
}

function findMemberCompletionExpression(
  program: Program,
  offset: number,
): Extract<Expression, { readonly kind: "MemberExpression" }> | undefined {
  return findExpression(program, (expression) =>
    expression.kind === "MemberExpression" &&
    expression.target.span.end.offset < offset &&
    offset <= expression.nameSpan.end.offset
      ? expression
      : undefined,
  );
}

function findEnumVariantCompletionExpression(
  program: Program,
  offset: number,
): Extract<Expression, { readonly kind: "EnumVariantExpression" }> | undefined {
  return findExpression(program, (expression) =>
    expression.kind === "EnumVariantExpression" &&
    expression.variantNameSpan.start.offset <= offset &&
    offset <= expression.variantNameSpan.end.offset
      ? expression
      : undefined,
  );
}

function findExpression<T>(
  program: Program,
  predicate: (expression: Expression) => T | undefined,
): T | undefined {
  for (const declaration of program.declarations) {
    const found = findExpressionInTopLevelDeclaration(declaration, predicate);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function findExpressionInTopLevelDeclaration<T>(
  declaration: TopLevelDeclaration,
  predicate: (expression: Expression) => T | undefined,
): T | undefined {
  switch (declaration.kind) {
    case "TypeDeclaration":
    case "FunctionDeclaration":
      return declaration.kind === "FunctionDeclaration"
        ? findExpressionInBlock(declaration.body, predicate)
        : undefined;
    case "VariableDeclaration":
      return findExpressionInExpression(declaration.initializer, predicate);
    case "AssignmentStatement":
      return (
        findExpressionInExpression(declaration.target, predicate) ??
        findExpressionInExpression(declaration.value, predicate)
      );
    case "BreakStatement":
      return declaration.expression === undefined
        ? undefined
        : findExpressionInExpression(declaration.expression, predicate);
    case "ExpressionStatement":
      return findExpressionInExpression(declaration.expression, predicate);
    case "ContinueStatement":
      return undefined;
  }
}

function findExpressionInBlock<T>(
  block: Block,
  predicate: (expression: Expression) => T | undefined,
): T | undefined {
  for (const statement of block.statements) {
    const found = findExpressionInStatement(statement, predicate);
    if (found !== undefined) {
      return found;
    }
  }
  return block.finalExpression === undefined
    ? undefined
    : findExpressionInExpression(block.finalExpression, predicate);
}

function findExpressionInStatement<T>(
  statement: Statement,
  predicate: (expression: Expression) => T | undefined,
): T | undefined {
  switch (statement.kind) {
    case "VariableDeclaration":
      return findExpressionInExpression(statement.initializer, predicate);
    case "AssignmentStatement":
      return (
        findExpressionInExpression(statement.target, predicate) ??
        findExpressionInExpression(statement.value, predicate)
      );
    case "ExpressionStatement":
    case "ReturnStatement":
      return findExpressionInExpression(statement.expression, predicate);
    case "BreakStatement":
      return statement.expression === undefined
        ? undefined
        : findExpressionInExpression(statement.expression, predicate);
    case "ContinueStatement":
      return undefined;
  }
}

function findExpressionInExpression<T>(
  expression: Expression,
  predicate: (expression: Expression) => T | undefined,
): T | undefined {
  const direct = predicate(expression);
  if (direct !== undefined) {
    return direct;
  }

  switch (expression.kind) {
    case "StringLiteral":
      return findFirst(expression.parts, (part) =>
        part.kind === "StringInterpolation"
          ? findExpressionInExpression(part.expression, predicate)
          : undefined,
      );
    case "ArrayLiteral":
      return findFirst(expression.elements, (element) =>
        findExpressionInExpression(element, predicate),
      );
    case "ObjectLiteral":
      return findFirst(expression.fields, (field) =>
        findExpressionInExpression(field.value, predicate),
      );
    case "AnonymousFunctionExpression":
      return findExpressionInBlock(expression.body, predicate);
    case "DirectiveExpression":
      return findFirst(expression.operands, (operand) =>
        operand.kind === "ExpressionOperand"
          ? findExpressionInExpression(operand.expression, predicate)
          : undefined,
      );
    case "UnaryExpression":
      return findExpressionInExpression(expression.operand, predicate);
    case "BinaryExpression":
      return (
        findExpressionInExpression(expression.left, predicate) ??
        findExpressionInExpression(expression.right, predicate)
      );
    case "IfExpression":
      return (
        findExpressionInExpression(expression.condition, predicate) ??
        findExpressionInBlock(expression.thenBlock, predicate) ??
        (expression.elseBlock === undefined
          ? undefined
          : findExpressionInBlock(expression.elseBlock, predicate))
      );
    case "WhileExpression":
      return (
        findExpressionInExpression(expression.condition, predicate) ??
        (expression.continuation === undefined
          ? undefined
          : expression.continuation.kind === "AssignmentStatement"
            ? findExpressionInStatement(expression.continuation, predicate)
            : findExpressionInExpression(expression.continuation, predicate)) ??
        findExpressionInBlock(expression.body, predicate) ??
        (expression.elseBlock === undefined
          ? undefined
          : findExpressionInBlock(expression.elseBlock, predicate))
      );
    case "MatchExpression":
      return (
        findExpressionInExpression(expression.scrutinee, predicate) ??
        findFirst(expression.arms, (arm) => findExpressionInExpression(arm.body, predicate))
      );
    case "CallExpression":
      return (
        findExpressionInExpression(expression.callee, predicate) ??
        findFirst(expression.args, (arg) => findExpressionInExpression(arg, predicate))
      );
    case "IndexExpression":
      return (
        findExpressionInExpression(expression.target, predicate) ??
        findExpressionInExpression(expression.index, predicate)
      );
    case "MemberExpression":
      return findExpressionInExpression(expression.target, predicate);
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "EnumVariantExpression":
      return undefined;
  }
}

function uniqueCompletions(completions: readonly CompletionItem[]): CompletionItem[] {
  const seen = new Set<string>();
  const unique: CompletionItem[] = [];
  for (const completion of completions) {
    if (seen.has(completion.label)) {
      continue;
    }
    seen.add(completion.label);
    unique.push(completion);
  }
  return unique;
}

function sourceCompletionContext(
  source: string,
  program: Program,
  offset: number,
): SourceCompletionContext {
  if (isTypeCompletionContext(source, offset)) {
    return "type";
  }

  if (isInsideFunctionBlock(program, offset)) {
    return isStatementBoundary(source, offset) ? "statement" : "expression";
  }

  return isTopLevelBoundary(source, offset) ? "top-level" : "expression";
}

function isTypeCompletionContext(source: string, offset: number): boolean {
  const line = currentLinePrefix(source, offset);

  if (/^\s*(?:export\s+)?type\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*=\s*[\w$.[\]\s]*$/.test(line)) {
    return true;
  }

  if (/^\s*(?:export\s+)?(?:const|let)\s+[A-Za-z_$][\w$]*\s*:\s*[\w$.[\]\s]*$/.test(line)) {
    return true;
  }

  if (/\)\s*:\s*[\w$.[\]\s]*$/.test(line)) {
    return true;
  }

  if (/[,(]\s*[A-Za-z_$][\w$]*\s*:\s*[\w$.[\]\s]*$/.test(line)) {
    return true;
  }

  if (
    /^\s*[A-Za-z_$][\w$]*\s*:\s*[\w$.[\]\s]*$/.test(line) &&
    isInsideTypeDeclaration(source, offset)
  ) {
    return true;
  }

  return false;
}

function isInsideTypeDeclaration(source: string, offset: number): boolean {
  const before = source.slice(0, offset);
  const lastType = before.lastIndexOf("type ");
  if (lastType < 0) {
    return false;
  }

  const afterType = before.slice(lastType);
  return afterType.includes("=") && !afterType.includes(";");
}

function isInsideFunctionBlock(program: Program, offset: number): boolean {
  return program.declarations.some(
    (declaration) =>
      declaration.kind === "FunctionDeclaration" && containsOffset(declaration.body, offset),
  );
}

function isStatementBoundary(source: string, offset: number): boolean {
  const line = currentLinePrefix(source, offset);
  if (line.trim().length === 0) {
    return true;
  }

  const boundary = Math.max(line.lastIndexOf("{"), line.lastIndexOf(";"), line.lastIndexOf("}"));
  return boundary >= 0 && line.slice(boundary + 1).trim().length === 0;
}

function isTopLevelBoundary(source: string, offset: number): boolean {
  const before = source.slice(0, offset);
  const boundary = Math.max(
    before.lastIndexOf(";"),
    before.lastIndexOf("}"),
    before.lastIndexOf("\n"),
  );
  return before.slice(boundary + 1).trim().length === 0;
}

function isAfterDot(source: string, offset: number): boolean {
  return source.slice(0, offset).endsWith(".");
}

function currentLinePrefix(source: string, offset: number): string {
  const before = source.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return before.slice(lineStart);
}

function containsOffset(
  node: {
    readonly span: {
      readonly start: { readonly offset: number };
      readonly end: { readonly offset: number };
    };
  },
  offset: number,
): boolean {
  return node.span.start.offset <= offset && offset <= node.span.end.offset;
}

function formatFunctionDetail(declaration: FunctionDeclaration): string {
  const params = declaration.params
    .map((param) => `${param.name}: ${formatTypeNode(param.type)}`)
    .join(", ");
  return `(${params}): ${formatTypeNode(declaration.returnType)}`;
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
    case "FunctionType":
      return `fn${formatTypeParameters(typeNode.typeParameters)}(${typeNode.params
        .map(formatTypeNode)
        .join(", ")}) -> ${formatTypeNode(typeNode.returnType)}`;
    case "EnumType":
      return `enum { ${typeNode.variants.map(formatEnumVariantTypeNode).join(", ")} }`;
    case "NeverType":
      return "never";
    case "UnknownType":
      return "unknown";
    case "OpaqueType":
      return "opaque";
  }
}

function formatTypeParameters(typeParameters: readonly { readonly name: string }[]): string {
  if (typeParameters.length === 0) {
    return "";
  }

  return `<${typeParameters.map((param) => param.name).join(", ")}>`;
}

function formatEnumVariantTypeNode(variant: EnumVariantTypeNode): string {
  if (variant.payload.length === 0) {
    return variant.name;
  }

  return `${variant.name}(${variant.payload.map(formatTypeNode).join(", ")})`;
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
