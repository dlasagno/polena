import {
  findHoverTarget,
  type AnalyzeResult,
  type HoverTarget,
  type ModuleAnalysis,
  type Program,
  type ReferenceTarget,
  type Span,
} from "@polena/compiler";
import { normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { Location, type Position, type Range } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

type TopLevelDeclaration = Program["declarations"][number];
type FunctionDeclaration = Extract<TopLevelDeclaration, { readonly kind: "FunctionDeclaration" }>;
type TypeDeclaration = Extract<TopLevelDeclaration, { readonly kind: "TypeDeclaration" }>;
type VariableDeclaration = Extract<TopLevelDeclaration, { readonly kind: "VariableDeclaration" }>;

export type DefinitionContext = {
  readonly analysesByModuleName?: ReadonlyMap<string, ModuleAnalysis>;
};

const emptyDefinitionContext: DefinitionContext = {};

export function getDefinition(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  context: DefinitionContext = emptyDefinitionContext,
): Location | null {
  const target = findHoverTarget(analysis.program, document.offsetAt(position));
  if (target === undefined) {
    return null;
  }

  return definitionForTarget(document.uri, analysis, target, context);
}

function definitionForTarget(
  currentUri: string,
  analysis: AnalyzeResult,
  target: HoverTarget,
  context: DefinitionContext,
): Location | null {
  switch (target.kind) {
    case "ModuleDoc":
      return null;
    case "ModuleReference":
      return moduleLocation(target.moduleName, context);
    case "ImportMember":
      return importMemberLocation(target, context);
    case "Expression":
    case "MemberName":
    case "TypeReference":
      return referenceLocation(currentUri, analysis, target.nodeId, context);
    case "Declaration":
    case "Parameter":
    case "PatternBinding":
    case "FieldDefinition":
    case "EnumVariantDefinition":
      return Location.create(currentUri, spanToRange(target.span));
  }
}

function referenceLocation(
  currentUri: string,
  analysis: AnalyzeResult,
  nodeId: number,
  context: DefinitionContext,
): Location | null {
  const reference = analysis.semantics.references.get(nodeId);
  if (reference === undefined) {
    return null;
  }

  switch (reference.kind) {
    case "Module":
      return moduleLocation(reference.moduleName, context);
    case "Local":
    case "Function":
      return Location.create(currentUri, spanToRange(reference.nameSpan));
    case "TypeAlias":
    case "EnumVariant":
    case "Field":
    case "Imported":
      return Location.create(
        uriForReference(reference, currentUri, context),
        spanToRange(reference.nameSpan),
      );
  }
}

function importMemberLocation(target: HoverTarget, context: DefinitionContext): Location | null {
  const moduleName = target.moduleName;
  const exportName = target.exportName;
  const namespace = target.importNamespace;
  if (moduleName === undefined || exportName === undefined || namespace === undefined) {
    return null;
  }

  const moduleAnalysis = context.analysesByModuleName?.get(moduleName);
  if (moduleAnalysis === undefined) {
    return null;
  }

  const declaration = findExportedDeclaration(
    moduleAnalysis.analysis.program,
    exportName,
    namespace,
  );
  if (declaration === undefined) {
    return null;
  }

  return Location.create(uriForModuleAnalysis(moduleAnalysis), spanToRange(declaration.nameSpan));
}

function moduleLocation(
  moduleName: string | undefined,
  context: DefinitionContext,
): Location | null {
  if (moduleName === undefined) {
    return null;
  }

  const moduleAnalysis = context.analysesByModuleName?.get(moduleName);
  if (moduleAnalysis === undefined) {
    return null;
  }

  return Location.create(
    uriForModuleAnalysis(moduleAnalysis),
    spanToRange(moduleDefinitionSpan(moduleAnalysis.analysis.program)),
  );
}

function moduleDefinitionSpan(program: Program): Span {
  return (
    program.docSpan ?? program.declarations[0]?.span ?? program.imports[0]?.span ?? program.span
  );
}

function uriForReference(
  reference: ReferenceTarget,
  currentUri: string,
  context: DefinitionContext,
): string {
  const moduleName = moduleNameForReference(reference);
  if (moduleName === undefined) {
    return currentUri;
  }

  const moduleAnalysis = context.analysesByModuleName?.get(moduleName);
  return moduleAnalysis === undefined ? currentUri : uriForModuleAnalysis(moduleAnalysis);
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
      return undefined;
  }
}

function uriForModuleAnalysis(moduleAnalysis: ModuleAnalysis): string {
  return pathToFileURL(normalize(moduleAnalysis.path)).href;
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
