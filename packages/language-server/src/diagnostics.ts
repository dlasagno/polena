import type {
  AnalyzeResult,
  Diagnostic as PolenaDiagnostic,
  Program,
  ReferenceTarget,
  Span,
} from "@polena/compiler";
import {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag,
  Location,
  type Range,
} from "vscode-languageserver/node";

export function toLspDiagnostics(
  diagnostics: readonly PolenaDiagnostic[],
  documentUri: string,
  options: { readonly analysis?: AnalyzeResult } = {},
): Diagnostic[] {
  return [
    ...diagnostics.map((diagnostic) => toLspDiagnostic(diagnostic, documentUri)),
    ...(options.analysis === undefined ? [] : unusedDiagnostics(options.analysis)),
  ];
}

function toLspDiagnostic(diagnostic: PolenaDiagnostic, documentUri: string): Diagnostic {
  const message = formatMessage(diagnostic);
  return Diagnostic.create(
    toRange(diagnostic.span),
    message,
    toSeverity(diagnostic.severity),
    diagnostic.code,
    "polena",
    toRelatedInformation(diagnostic, documentUri),
  );
}

function toRelatedInformation(
  diagnostic: PolenaDiagnostic,
  documentUri: string,
): DiagnosticRelatedInformation[] | undefined {
  const notes = diagnostic.notes?.filter((note) => note.span !== undefined);
  if (notes === undefined || notes.length === 0) {
    return undefined;
  }

  return notes.map((note) =>
    DiagnosticRelatedInformation.create(
      Location.create(documentUri, toRange(note.span)),
      `${note.kind ?? "note"}: ${note.message}`,
    ),
  );
}

function formatMessage(diagnostic: PolenaDiagnostic): string {
  if (diagnostic.notes === undefined || diagnostic.notes.length === 0) {
    return diagnostic.message;
  }

  const notesWithoutSpans = diagnostic.notes.filter((note) => note.span === undefined);
  if (notesWithoutSpans.length === 0) {
    return diagnostic.message;
  }

  return [
    diagnostic.message,
    ...notesWithoutSpans.map((note) => `${note.kind ?? "note"}: ${note.message}`),
  ].join("\n");
}

function toRange(span: Span | undefined): Range {
  if (span === undefined) {
    return {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    };
  }

  const startLine = Math.max(0, span.start.line - 1);
  const startCharacter = Math.max(0, span.start.column - 1);
  const endLine = Math.max(startLine, span.end.line - 1);
  const endCharacter =
    endLine === startLine
      ? Math.max(startCharacter + 1, span.end.column - 1)
      : Math.max(0, span.end.column - 1);

  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}

function toSeverity(severity: PolenaDiagnostic["severity"]): DiagnosticSeverity {
  switch (severity) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    case "note":
      return DiagnosticSeverity.Information;
  }
}

type ImportDeclaration = Program["imports"][number];

function unusedDiagnostics(analysis: AnalyzeResult): Diagnostic[] {
  const usage = collectUsage(analysis);
  const exportedValueDefinitionNodeIds = collectExportedValueDefinitionNodeIds(analysis.program);
  const diagnostics: Diagnostic[] = [];

  for (const definition of analysis.semantics.definitions) {
    if (
      (definition.kind !== "Local" && definition.kind !== "PatternBinding") ||
      isIntentionallyUnusedName(definition.name) ||
      exportedValueDefinitionNodeIds.has(definition.nodeId) ||
      usage.usedDefinitionNodeIds.has(definition.nodeId)
    ) {
      continue;
    }

    diagnostics.push(
      unnecessaryDiagnostic(
        definition.nameSpan,
        definition.kind === "PatternBinding"
          ? `Pattern binding '${definition.name}' is never used.`
          : `Variable '${definition.name}' is never used.`,
      ),
    );
  }

  for (const declaration of analysis.program.imports) {
    diagnostics.push(...unusedImportDiagnostics(declaration, usage));
  }

  return diagnostics;
}

function collectExportedValueDefinitionNodeIds(program: Program): ReadonlySet<number> {
  const nodeIds = new Set<number>();
  for (const declaration of program.declarations) {
    if (declaration.kind === "VariableDeclaration" && declaration.exported) {
      nodeIds.add(declaration.nodeId);
    }
  }
  return nodeIds;
}

function collectUsage(analysis: AnalyzeResult): {
  readonly usedDefinitionNodeIds: ReadonlySet<number>;
  readonly usedModules: ReadonlySet<string>;
  readonly usedImports: ReadonlySet<string>;
} {
  const usedDefinitionNodeIds = new Set<number>();
  const usedModules = new Set<string>();
  const usedImports = new Set<string>();

  for (const reference of analysis.semantics.references.values()) {
    const definitionNodeId = definitionNodeIdForReference(reference);
    if (definitionNodeId !== undefined) {
      usedDefinitionNodeIds.add(definitionNodeId);
    }

    if (reference.kind === "Module") {
      usedModules.add(reference.moduleName);
    } else if (reference.kind === "Imported") {
      usedImports.add(importUsageKey(reference.moduleName, "value", reference.exportName));
    } else if (reference.kind === "TypeAlias" && reference.moduleName !== undefined) {
      usedImports.add(importUsageKey(reference.moduleName, "type", reference.name));
    }
  }

  return { usedDefinitionNodeIds, usedModules, usedImports };
}

function definitionNodeIdForReference(reference: ReferenceTarget): number | undefined {
  switch (reference.kind) {
    case "Local":
    case "Function":
    case "TypeAlias":
    case "EnumVariant":
    case "Field":
    case "Imported":
      return reference.definitionNodeId;
    case "Module":
      return undefined;
  }
}

function unusedImportDiagnostics(
  declaration: ImportDeclaration,
  usage: ReturnType<typeof collectUsage>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    declaration.alias !== undefined &&
    !isIntentionallyUnusedName(declaration.alias.name) &&
    !usage.usedModules.has(declaration.path.text)
  ) {
    diagnostics.push(
      unnecessaryDiagnostic(
        declaration.alias.nameSpan,
        `Import alias '${declaration.alias.name}' is never used.`,
      ),
    );
  }

  if (
    declaration.items.length === 0 &&
    declaration.alias === undefined &&
    !usage.usedModules.has(declaration.path.text)
  ) {
    diagnostics.push(
      unnecessaryDiagnostic(
        declaration.path.span,
        `Import '${declaration.path.text}' is never used.`,
      ),
    );
  }

  for (const item of declaration.items) {
    const localName = item.alias?.name ?? item.name;
    if (
      isIntentionallyUnusedName(localName) ||
      usage.usedImports.has(importUsageKey(declaration.path.text, item.namespace, item.name))
    ) {
      continue;
    }

    diagnostics.push(
      unnecessaryDiagnostic(
        item.alias?.nameSpan ?? item.nameSpan,
        `Imported ${item.namespace} '${localName}' is never used.`,
      ),
    );
  }

  return diagnostics;
}

function importUsageKey(
  moduleName: string,
  namespace: "type" | "value",
  exportName: string,
): string {
  return `${moduleName}\0${namespace}\0${exportName}`;
}

function isIntentionallyUnusedName(name: string): boolean {
  return name === "_";
}

function unnecessaryDiagnostic(span: Span, message: string): Diagnostic {
  return {
    range: toRange(span),
    severity: DiagnosticSeverity.Hint,
    source: "polena",
    message,
    tags: [DiagnosticTag.Unnecessary],
  };
}
