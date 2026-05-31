import {
  findHoverTarget,
  type AnalyzeResult,
  type HoverTarget,
  type ModuleAnalysis,
  type NodeId,
  type Program,
  type ReferenceTarget,
  type Span,
} from "@polena/compiler";
import { normalize } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DocumentHighlight,
  DocumentHighlightKind,
  Location,
  type Position,
  type Range,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

type TopLevelDeclaration = Program["declarations"][number];
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;
type ImportDeclaration = Program["imports"][number];
type TypeNode = TypeDeclaration["value"];
type ObjectTypeField = Extract<TypeNode, { readonly kind: "ObjectType" }>["fields"][number];
type EnumVariantTypeNode = Extract<TypeNode, { readonly kind: "EnumType" }>["variants"][number];
type Block = FunctionDeclaration["body"];
type Statement = Block["statements"][number];
type Expression = VariableDeclaration["initializer"];
type ObjectLiteralField = Extract<Expression, { readonly kind: "ObjectLiteral" }>["fields"][number];
type MatchArm = Extract<Expression, { readonly kind: "MatchExpression" }>["arms"][number];
type MatchPattern = MatchArm["pattern"];

export type ReferencesContext = {
  readonly currentModuleName?: string;
  readonly analysesByModuleName?: ReadonlyMap<string, ModuleAnalysis>;
};

const emptyReferencesContext: ReferencesContext = {};

type AnalysisEntry = {
  readonly uri: string;
  readonly moduleName?: string;
  readonly analysis: AnalyzeResult;
};

type SymbolIdentity =
  | {
      readonly kind: "Definition";
      readonly moduleKey: string;
      readonly definitionNodeId: NodeId;
    }
  | {
      readonly kind: "Module";
      readonly moduleName: string;
    };

export function getReferences(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  options: { readonly includeDeclaration: boolean },
  context: ReferencesContext = emptyReferencesContext,
): Location[] {
  const identity = identityAtPosition(document, analysis, position, context);
  if (identity === undefined) {
    return [];
  }

  return locationsForIdentity(document, analysis, identity, options, context);
}

export function getDocumentHighlights(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  context: ReferencesContext = emptyReferencesContext,
): DocumentHighlight[] {
  const identity = identityAtPosition(document, analysis, position, context);
  if (identity === undefined) {
    return [];
  }

  return locationsForIdentity(document, analysis, identity, { includeDeclaration: true }, context)
    .filter((location) => location.uri === document.uri)
    .sort(compareLocations)
    .map((location) => DocumentHighlight.create(location.range, DocumentHighlightKind.Text));
}

function identityAtPosition(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  context: ReferencesContext,
): SymbolIdentity | undefined {
  const target = findHoverTarget(analysis.program, document.offsetAt(position));
  if (target === undefined) {
    return undefined;
  }

  return identityForTarget(document.uri, analysis, target, context);
}

function identityForTarget(
  currentUri: string,
  analysis: AnalyzeResult,
  target: HoverTarget,
  context: ReferencesContext,
): SymbolIdentity | undefined {
  switch (target.kind) {
    case "ModuleDoc":
      return undefined;
    case "ModuleReference":
      return target.moduleName === undefined
        ? undefined
        : { kind: "Module", moduleName: target.moduleName };
    case "ImportMember":
      return importedMemberIdentity(target, context);
    case "Expression":
    case "MemberName":
    case "TypeReference": {
      const reference = analysis.semantics.references.get(target.nodeId);
      return reference === undefined
        ? undefined
        : identityForReference(reference, moduleKeyForCurrent(currentUri, context));
    }
    case "Declaration":
    case "Parameter":
    case "PatternBinding":
    case "FieldDefinition":
    case "EnumVariantDefinition":
      return {
        kind: "Definition",
        moduleKey: moduleKeyForCurrent(currentUri, context),
        definitionNodeId: target.nodeId,
      };
  }
}

function importedMemberIdentity(
  target: HoverTarget,
  context: ReferencesContext,
): SymbolIdentity | undefined {
  const moduleName = target.moduleName;
  const exportName = target.exportName;
  const namespace = target.importNamespace;
  if (moduleName === undefined || exportName === undefined || namespace === undefined) {
    return undefined;
  }

  const moduleAnalysis = context.analysesByModuleName?.get(moduleName);
  if (moduleAnalysis === undefined) {
    return undefined;
  }

  const declaration = findExportedDeclaration(
    moduleAnalysis.analysis.program,
    exportName,
    namespace,
  );
  return declaration === undefined
    ? undefined
    : {
        kind: "Definition",
        moduleKey: moduleName,
        definitionNodeId: declaration.nodeId,
      };
}

function locationsForIdentity(
  document: TextDocument,
  analysis: AnalyzeResult,
  identity: SymbolIdentity,
  options: { readonly includeDeclaration: boolean },
  context: ReferencesContext,
): Location[] {
  const entries = analysisEntries(document.uri, analysis, context);
  const locations: Location[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (options.includeDeclaration) {
      for (const span of declarationSpans(entry, identity)) {
        pushLocation(locations, seen, entry.uri, span);
      }
    }

    for (const span of importOccurrenceSpans(entry, identity, context)) {
      pushLocation(locations, seen, entry.uri, span);
    }

    for (const [nodeId, reference] of entry.analysis.semantics.references) {
      if (!sameIdentity(identityForReference(reference, moduleKeyForEntry(entry)), identity)) {
        continue;
      }

      const span = referenceOccurrenceSpan(entry.analysis.program, nodeId);
      if (span !== undefined) {
        pushLocation(locations, seen, entry.uri, span);
      }
    }
  }

  return locations;
}

function analysisEntries(
  currentUri: string,
  analysis: AnalyzeResult,
  context: ReferencesContext,
): readonly AnalysisEntry[] {
  if (context.analysesByModuleName === undefined) {
    return [{ uri: currentUri, moduleName: context.currentModuleName, analysis }];
  }

  return [...context.analysesByModuleName.values()].map((moduleAnalysis) => ({
    uri: uriForModuleAnalysis(moduleAnalysis),
    moduleName: moduleAnalysis.moduleName,
    analysis: moduleAnalysis.analysis,
  }));
}

function declarationSpans(entry: AnalysisEntry, identity: SymbolIdentity): readonly Span[] {
  if (identity.kind === "Module") {
    if (entry.moduleName !== identity.moduleName) {
      return [];
    }
    return [moduleDefinitionSpan(entry.analysis.program)];
  }

  if (moduleKeyForEntry(entry) !== identity.moduleKey) {
    return [];
  }

  return entry.analysis.semantics.definitions
    .filter((definition) => definition.nodeId === identity.definitionNodeId)
    .map((definition) => definition.nameSpan);
}

function importOccurrenceSpans(
  entry: AnalysisEntry,
  identity: SymbolIdentity,
  context: ReferencesContext,
): readonly Span[] {
  const spans: Span[] = [];
  for (const declaration of entry.analysis.program.imports) {
    if (identity.kind === "Module") {
      if (declaration.path.text === identity.moduleName) {
        spans.push(declaration.path.span);
        if (declaration.alias !== undefined) {
          spans.push(declaration.alias.nameSpan);
        }
      }
      continue;
    }

    const importedModule = context.analysesByModuleName?.get(declaration.path.text);
    if (importedModule === undefined || importedModule.moduleName !== identity.moduleKey) {
      continue;
    }

    for (const item of declaration.items) {
      const importedDeclaration = findExportedDeclaration(
        importedModule.analysis.program,
        item.name,
        item.namespace,
      );
      if (importedDeclaration?.nodeId !== identity.definitionNodeId) {
        continue;
      }

      spans.push(item.nameSpan);
      if (item.alias !== undefined) {
        spans.push(item.alias.nameSpan);
      }
    }
  }
  return spans;
}

function identityForReference(
  reference: ReferenceTarget,
  currentModuleKey: string,
): SymbolIdentity | undefined {
  switch (reference.kind) {
    case "Module":
      return { kind: "Module", moduleName: reference.moduleName };
    case "Local":
    case "Function":
      return {
        kind: "Definition",
        moduleKey: currentModuleKey,
        definitionNodeId: reference.definitionNodeId,
      };
    case "TypeAlias":
    case "EnumVariant":
    case "Field":
      return {
        kind: "Definition",
        moduleKey: reference.moduleName ?? currentModuleKey,
        definitionNodeId: reference.definitionNodeId,
      };
    case "Imported":
      return {
        kind: "Definition",
        moduleKey: reference.moduleName,
        definitionNodeId: reference.definitionNodeId,
      };
  }
}

function sameIdentity(left: SymbolIdentity | undefined, right: SymbolIdentity): boolean {
  if (left === undefined || left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "Module" && right.kind === "Module") {
    return left.moduleName === right.moduleName;
  }

  if (left.kind === "Definition" && right.kind === "Definition") {
    return left.moduleKey === right.moduleKey && left.definitionNodeId === right.definitionNodeId;
  }

  return false;
}

function moduleKeyForCurrent(currentUri: string, context: ReferencesContext): string {
  return context.currentModuleName ?? currentUri;
}

function moduleKeyForEntry(entry: AnalysisEntry): string {
  return entry.moduleName ?? entry.uri;
}

function moduleDefinitionSpan(program: Program): Span {
  return (
    program.docSpan ?? program.declarations[0]?.span ?? program.imports[0]?.span ?? program.span
  );
}

function uriForModuleAnalysis(moduleAnalysis: ModuleAnalysis): string {
  return pathToFileURL(normalize(moduleAnalysis.path)).href;
}

function pushLocation(locations: Location[], seen: Set<string>, uri: string, span: Span): void {
  const range = spanToRange(span);
  const key = `${uri}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  locations.push(Location.create(uri, range));
}

function compareLocations(left: Location, right: Location): number {
  return (
    left.range.start.line - right.range.start.line ||
    left.range.start.character - right.range.start.character ||
    left.range.end.line - right.range.end.line ||
    left.range.end.character - right.range.end.character
  );
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

function referenceOccurrenceSpan(program: Program, nodeId: NodeId): Span | undefined {
  return (
    spanForImportNode(program.imports, nodeId) ??
    findFirst(program.declarations, (declaration) =>
      spanForTopLevelDeclaration(declaration, nodeId),
    )
  );
}

function spanForImportNode(
  imports: readonly ImportDeclaration[],
  nodeId: NodeId,
): Span | undefined {
  for (const declaration of imports) {
    if (declaration.path.nodeId === nodeId) {
      return declaration.path.span;
    }
    if (declaration.nodeId === nodeId && declaration.alias !== undefined) {
      return declaration.alias.nameSpan;
    }
    for (const item of declaration.items) {
      if (item.nodeId === nodeId) {
        return item.alias?.nameSpan ?? item.nameSpan;
      }
    }
  }
  return undefined;
}

function spanForTopLevelDeclaration(
  declaration: TopLevelDeclaration,
  nodeId: NodeId,
): Span | undefined {
  switch (declaration.kind) {
    case "TypeDeclaration":
      return spanForTypeNode(declaration.value, nodeId);
    case "FunctionDeclaration":
      return (
        findFirst(declaration.params, (param) =>
          param.type === undefined ? undefined : spanForTypeNode(param.type, nodeId),
        ) ??
        spanForTypeNode(declaration.returnType, nodeId) ??
        spanForBlock(declaration.body, nodeId)
      );
    case "VariableDeclaration":
      return (
        (declaration.typeAnnotation === undefined
          ? undefined
          : spanForTypeNode(declaration.typeAnnotation, nodeId)) ??
        spanForExpression(declaration.initializer, nodeId)
      );
    case "AssignmentStatement":
      return (
        spanForExpression(declaration.target, nodeId) ??
        spanForExpression(declaration.value, nodeId)
      );
    case "BreakStatement":
      return declaration.expression === undefined
        ? undefined
        : spanForExpression(declaration.expression, nodeId);
    case "ExpressionStatement":
      return spanForExpression(declaration.expression, nodeId);
    case "ContinueStatement":
      return undefined;
  }
}

function spanForBlock(block: Block, nodeId: NodeId): Span | undefined {
  return (
    findFirst(block.statements, (statement) => spanForStatement(statement, nodeId)) ??
    (block.finalExpression === undefined
      ? undefined
      : spanForExpression(block.finalExpression, nodeId))
  );
}

function spanForStatement(statement: Statement, nodeId: NodeId): Span | undefined {
  switch (statement.kind) {
    case "VariableDeclaration":
      return spanForTopLevelDeclaration(statement, nodeId);
    case "AssignmentStatement":
      return (
        spanForExpression(statement.target, nodeId) ?? spanForExpression(statement.value, nodeId)
      );
    case "ExpressionStatement":
      return spanForExpression(statement.expression, nodeId);
    case "ReturnStatement":
      return spanForExpression(statement.expression, nodeId);
    case "BreakStatement":
      return statement.expression === undefined
        ? undefined
        : spanForExpression(statement.expression, nodeId);
    case "ContinueStatement":
      return undefined;
  }
}

function spanForTypeNode(typeNode: TypeNode, nodeId: NodeId): Span | undefined {
  if (typeNode.nodeId === nodeId) {
    return typeNode.kind === "NamedType" ? typeNode.nameSpan : typeNode.span;
  }

  switch (typeNode.kind) {
    case "ArrayType":
      return spanForTypeNode(typeNode.element, nodeId);
    case "OptionalType":
      return spanForTypeNode(typeNode.value, nodeId);
    case "FunctionType":
      return (
        findFirst(typeNode.params, (param) => spanForTypeNode(param, nodeId)) ??
        spanForTypeNode(typeNode.returnType, nodeId)
      );
    case "NamedType":
      return findFirst(typeNode.typeArguments, (typeArgument) =>
        spanForTypeNode(typeArgument, nodeId),
      );
    case "ObjectType":
      return findFirst(typeNode.fields, (field) => spanForObjectTypeField(field, nodeId));
    case "EnumType":
      return findFirst(typeNode.variants, (variant) => spanForEnumVariant(variant, nodeId));
    case "PrimitiveType":
    case "NeverType":
    case "UnknownType":
    case "OpaqueType":
      return undefined;
  }
}

function spanForObjectTypeField(field: ObjectTypeField, nodeId: NodeId): Span | undefined {
  if (field.nodeId === nodeId) {
    return field.nameSpan;
  }

  return spanForTypeNode(field.type, nodeId);
}

function spanForEnumVariant(variant: EnumVariantTypeNode, nodeId: NodeId): Span | undefined {
  if (variant.nodeId === nodeId) {
    return variant.nameSpan;
  }

  return findFirst(variant.payload, (payloadType) => spanForTypeNode(payloadType, nodeId));
}

function spanForExpression(expression: Expression, nodeId: NodeId): Span | undefined {
  if (expression.nodeId === nodeId) {
    return spanForDirectExpression(expression);
  }

  switch (expression.kind) {
    case "StringLiteral":
      return findFirst(expression.parts, (part) =>
        part.kind === "StringInterpolation"
          ? spanForExpression(part.expression, nodeId)
          : undefined,
      );
    case "ArrayLiteral":
      return findFirst(expression.elements, (element) => spanForExpression(element, nodeId));
    case "ObjectLiteral":
      return findFirst(expression.fields, (field) => spanForObjectLiteralField(field, nodeId));
    case "AnonymousFunctionExpression":
      return (
        findFirst(expression.params, (param) =>
          param.type === undefined ? undefined : spanForTypeNode(param.type, nodeId),
        ) ??
        (expression.returnType === undefined
          ? undefined
          : spanForTypeNode(expression.returnType, nodeId)) ??
        spanForBlock(expression.body, nodeId)
      );
    case "DirectiveExpression":
      return findFirst(expression.operands, (operand) =>
        operand.kind === "ExpressionOperand"
          ? spanForExpression(operand.expression, nodeId)
          : spanForTypeNode(operand.type, nodeId),
      );
    case "UnaryExpression":
      return spanForExpression(expression.operand, nodeId);
    case "BinaryExpression":
      return (
        spanForExpression(expression.left, nodeId) ?? spanForExpression(expression.right, nodeId)
      );
    case "IfExpression":
      return (
        spanForExpression(expression.condition, nodeId) ??
        spanForBlock(expression.thenBlock, nodeId) ??
        (expression.elseBlock === undefined
          ? undefined
          : spanForBlock(expression.elseBlock, nodeId))
      );
    case "WhileExpression":
      return (
        spanForExpression(expression.condition, nodeId) ??
        (expression.continuation === undefined
          ? undefined
          : expression.continuation.kind === "AssignmentStatement"
            ? spanForStatement(expression.continuation, nodeId)
            : spanForExpression(expression.continuation, nodeId)) ??
        spanForBlock(expression.body, nodeId) ??
        (expression.elseBlock === undefined
          ? undefined
          : spanForBlock(expression.elseBlock, nodeId))
      );
    case "MatchExpression":
      return (
        spanForExpression(expression.scrutinee, nodeId) ??
        findFirst(expression.arms, (arm) => spanForMatchArm(arm, nodeId))
      );
    case "CallExpression":
      return (
        spanForExpression(expression.callee, nodeId) ??
        findFirst(expression.typeArguments, (typeArgument) =>
          spanForTypeNode(typeArgument, nodeId),
        ) ??
        findFirst(expression.args, (arg) => spanForExpression(arg, nodeId))
      );
    case "IndexExpression":
      return (
        spanForExpression(expression.target, nodeId) ?? spanForExpression(expression.index, nodeId)
      );
    case "PanicExpression":
      return spanForExpression(expression.message, nodeId);
    case "MemberExpression":
      return spanForExpression(expression.target, nodeId);
    case "EnumVariantExpression":
    case "NumberLiteral":
    case "BigIntLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "RecoveryExpression":
      return undefined;
  }
}

function spanForDirectExpression(expression: Expression): Span {
  switch (expression.kind) {
    case "NameExpression":
      return expression.span;
    case "MemberExpression":
      return expression.nameSpan;
    case "EnumVariantExpression":
      return expression.variantNameSpan;
    case "NumberLiteral":
    case "BigIntLiteral":
    case "StringLiteral":
    case "BooleanLiteral":
    case "RecoveryExpression":
    case "ArrayLiteral":
    case "ObjectLiteral":
    case "AnonymousFunctionExpression":
    case "DirectiveExpression":
    case "PanicExpression":
    case "UnaryExpression":
    case "BinaryExpression":
    case "IfExpression":
    case "WhileExpression":
    case "MatchExpression":
    case "CallExpression":
    case "IndexExpression":
      return expression.span;
  }
}

function spanForObjectLiteralField(field: ObjectLiteralField, nodeId: NodeId): Span | undefined {
  if (field.nodeId === nodeId) {
    return field.nameSpan;
  }

  return spanForExpression(field.value, nodeId);
}

function spanForMatchArm(arm: MatchArm, nodeId: NodeId): Span | undefined {
  return spanForMatchPattern(arm.pattern, nodeId) ?? spanForExpression(arm.body, nodeId);
}

function spanForMatchPattern(pattern: MatchPattern, nodeId: NodeId): Span | undefined {
  if (pattern.nodeId === nodeId) {
    return pattern.kind === "EnumVariantPattern" ? pattern.variantNameSpan : pattern.span;
  }

  if (pattern.kind !== "EnumVariantPattern") {
    return undefined;
  }

  return findFirst(pattern.payload ?? [], (payloadPattern) => {
    if (payloadPattern.nodeId !== nodeId) {
      return undefined;
    }
    return payloadPattern.kind === "BindingPattern" ? payloadPattern.nameSpan : payloadPattern.span;
  });
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

function spanToRange(span: Span): Range {
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
