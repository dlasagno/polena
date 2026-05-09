import type { Diagnostic as PolenaDiagnostic, Span } from "@polena/compiler";
import {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  Location,
  type Range,
} from "vscode-languageserver/node";

export function toLspDiagnostics(
  diagnostics: readonly PolenaDiagnostic[],
  documentUri: string,
): Diagnostic[] {
  return diagnostics.map((diagnostic) => toLspDiagnostic(diagnostic, documentUri));
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
