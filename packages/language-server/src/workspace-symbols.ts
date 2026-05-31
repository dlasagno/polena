import {
  formatType,
  type AnalyzeResult,
  type ModuleAnalysis,
  type Program,
  type Span,
} from "@polena/compiler";
import { normalize } from "node:path";
import { pathToFileURL } from "node:url";
import {
  SymbolInformation,
  SymbolKind,
  type Location,
  type Range,
} from "vscode-languageserver/node";

type TopLevelDeclaration = Program["declarations"][number];
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;
type TypeNode = TypeDeclaration["value"];

export type WorkspaceSymbolSource = {
  readonly uri: string;
  readonly moduleName?: string;
  readonly analysis: AnalyzeResult;
};

export function getWorkspaceSymbols(
  query: string,
  sources: readonly WorkspaceSymbolSource[],
): SymbolInformation[] {
  const normalizedQuery = query.trim().toLowerCase();
  const symbols: SymbolInformation[] = [];

  for (const source of sources) {
    for (const declaration of source.analysis.program.declarations) {
      const symbol = workspaceSymbolForDeclaration(source, declaration, source.analysis);
      if (symbol === undefined) {
        continue;
      }
      if (normalizedQuery.length > 0 && !symbol.name.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      symbols.push(symbol);
    }
  }

  return symbols.sort(compareWorkspaceSymbols);
}

export function workspaceSymbolSourcesFromModules(
  modules: Iterable<ModuleAnalysis>,
): WorkspaceSymbolSource[] {
  return [...modules].map((moduleAnalysis) => ({
    uri: pathToFileURL(normalize(moduleAnalysis.path)).href,
    moduleName: moduleAnalysis.moduleName,
    analysis: moduleAnalysis.analysis,
  }));
}

function workspaceSymbolForDeclaration(
  source: WorkspaceSymbolSource,
  declaration: TopLevelDeclaration,
  analysis: AnalyzeResult,
): SymbolInformation | undefined {
  switch (declaration.kind) {
    case "TypeDeclaration":
      return createSymbol(
        declaration.name,
        declaration.value.kind === "EnumType" ? SymbolKind.Enum : SymbolKind.Struct,
        source,
        declaration.nameSpan,
        `= ${formatTypeNode(declaration.value)}`,
      );
    case "FunctionDeclaration":
      return createSymbol(
        declaration.name,
        SymbolKind.Function,
        source,
        declaration.nameSpan,
        formatFunctionDetail(declaration),
      );
    case "VariableDeclaration":
      return createSymbol(
        declaration.name,
        declaration.mutability === "const" ? SymbolKind.Constant : SymbolKind.Variable,
        source,
        declaration.nameSpan,
        formatVariableDetail(declaration, analysis),
      );
    case "AssignmentStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "ExpressionStatement":
      return undefined;
  }
}

function createSymbol(
  name: string,
  kind: SymbolKind,
  source: WorkspaceSymbolSource,
  nameSpan: Span,
  detail: string,
): SymbolInformation {
  const symbol = SymbolInformation.create(
    name,
    kind,
    spanToRange(nameSpan),
    source.uri,
    source.moduleName,
  );
  return { ...symbol, containerName: source.moduleName ?? detail };
}

function compareWorkspaceSymbols(left: SymbolInformation, right: SymbolInformation): number {
  return (
    left.name.localeCompare(right.name) ||
    (left.containerName ?? "").localeCompare(right.containerName ?? "") ||
    left.location.uri.localeCompare(right.location.uri) ||
    compareRanges(left.location.range, right.location.range)
  );
}

function compareRanges(left: Range, right: Range): number {
  return (
    left.start.line - right.start.line ||
    left.start.character - right.start.character ||
    left.end.line - right.end.line ||
    left.end.character - right.end.character
  );
}

function formatFunctionDetail(declaration: FunctionDeclaration): string {
  const params = declaration.params
    .map((param) => `${param.name}: ${formatOptionalTypeNode(param.type)}`)
    .join(", ");
  return `(${params}): ${formatTypeNode(declaration.returnType)}`;
}

function formatOptionalTypeNode(typeNode: TypeNode | undefined): string {
  return typeNode === undefined ? "unknown" : formatTypeNode(typeNode);
}

function formatVariableDetail(declaration: VariableDeclaration, analysis: AnalyzeResult): string {
  if (declaration.typeAnnotation !== undefined) {
    return `: ${formatTypeNode(declaration.typeAnnotation)}`;
  }

  const type = analysis.semantics.expressionTypes.get(declaration.initializer.nodeId);
  if (type === undefined || type.kind === "unknown") {
    return ": unknown";
  }

  return `: ${formatType(type)}`;
}

function formatTypeNode(typeNode: TypeNode): string {
  switch (typeNode.kind) {
    case "PrimitiveType":
      return typeNode.name;
    case "ArrayType":
      return `[]${formatTypeNode(typeNode.element)}`;
    case "OptionalType":
      return `?${formatTypeNode(typeNode.value)}`;
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

function formatTypeParameters(typeParameters: readonly { readonly name: string }[]): string {
  if (typeParameters.length === 0) {
    return "";
  }

  return `<${typeParameters.map((param) => param.name).join(", ")}>`;
}

function spanToRange(span: Span): Location["range"] {
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
