import { formatType, type AnalyzeResult, type Program, type Span } from "@polena/compiler";
import { DocumentSymbol, SymbolKind } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

type TopLevelDeclaration = Program["declarations"][number];
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;
type TypeNode = TypeDeclaration["value"];
type ObjectTypeField = Extract<TypeNode, { readonly kind: "ObjectType" }>["fields"][number];
type EnumVariantTypeNode = Extract<TypeNode, { readonly kind: "EnumType" }>["variants"][number];

export function getDocumentSymbols(
  _document: TextDocument,
  analysis: AnalyzeResult,
): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  for (const declaration of analysis.program.declarations) {
    const symbol = documentSymbolForTopLevelDeclaration(declaration, analysis);
    if (symbol !== undefined) {
      symbols.push(symbol);
    }
  }

  return symbols;
}

function documentSymbolForTopLevelDeclaration(
  declaration: TopLevelDeclaration,
  analysis: AnalyzeResult,
): DocumentSymbol | undefined {
  switch (declaration.kind) {
    case "TypeDeclaration":
      return documentSymbolForTypeDeclaration(declaration);
    case "FunctionDeclaration":
      return DocumentSymbol.create(
        declaration.name,
        formatFunctionDetail(declaration),
        SymbolKind.Function,
        spanToRange(declaration.span),
        spanToRange(declaration.nameSpan),
      );
    case "VariableDeclaration":
      return DocumentSymbol.create(
        declaration.name,
        formatVariableDetail(declaration, analysis),
        declaration.mutability === "const" ? SymbolKind.Constant : SymbolKind.Variable,
        spanToRange(declaration.span),
        spanToRange(declaration.nameSpan),
      );
    case "AssignmentStatement":
    case "BreakStatement":
    case "ContinueStatement":
    case "ExpressionStatement":
      return undefined;
  }
}

function documentSymbolForTypeDeclaration(declaration: TypeDeclaration): DocumentSymbol {
  const children = childrenForTypeDeclaration(declaration);
  return DocumentSymbol.create(
    declaration.name,
    `= ${formatTypeNode(declaration.value)}`,
    declaration.value.kind === "EnumType" ? SymbolKind.Enum : SymbolKind.Struct,
    spanToRange(declaration.span),
    spanToRange(declaration.nameSpan),
    children.length === 0 ? undefined : children,
  );
}

function childrenForTypeDeclaration(declaration: TypeDeclaration): DocumentSymbol[] {
  switch (declaration.value.kind) {
    case "ObjectType":
      return declaration.value.fields.map(documentSymbolForObjectTypeField);
    case "EnumType":
      return declaration.value.variants.map((variant) =>
        documentSymbolForEnumVariant(declaration, variant),
      );
    case "PrimitiveType":
    case "ArrayType":
    case "NamedType":
    case "UnknownType":
      return [];
  }
}

function documentSymbolForObjectTypeField(field: ObjectTypeField): DocumentSymbol {
  return DocumentSymbol.create(
    field.name,
    `: ${formatTypeNode(field.type)}`,
    SymbolKind.Field,
    spanToRange(field.span),
    spanToRange(field.nameSpan),
  );
}

function documentSymbolForEnumVariant(
  declaration: TypeDeclaration,
  variant: EnumVariantTypeNode,
): DocumentSymbol {
  return DocumentSymbol.create(
    variant.name,
    `${declaration.name}.${formatEnumVariantTypeNode(variant)}`,
    SymbolKind.EnumMember,
    spanToRange(variant.span),
    spanToRange(variant.nameSpan),
  );
}

function formatFunctionDetail(declaration: FunctionDeclaration): string {
  const params = declaration.params
    .map((param) => `${param.name}: ${formatTypeNode(param.type)}`)
    .join(", ");
  return `(${params}): ${formatTypeNode(declaration.returnType)}`;
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

function spanToRange(span: Span): DocumentSymbol["range"] {
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
