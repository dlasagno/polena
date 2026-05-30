import { findHoverTarget, type AnalyzeResult } from "@polena/compiler";
import {
  TextEdit,
  type Position,
  type Range,
  type WorkspaceEdit,
} from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { getReferences, type ReferencesContext } from "./references";

export type PrepareRenameResult = {
  readonly range: Range;
  readonly placeholder: string;
};

const keywords = new Set([
  "and",
  "as",
  "bigint",
  "boolean",
  "break",
  "const",
  "continue",
  "else",
  "enum",
  "export",
  "false",
  "fn",
  "if",
  "import",
  "let",
  "match",
  "number",
  "opaque",
  "or",
  "return",
  "string",
  "true",
  "type",
  "unknown",
  "void",
  "while",
]);

export function prepareRename(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  context: ReferencesContext = {},
): PrepareRenameResult | null {
  const range = renameRange(document, analysis, position, context);
  if (range === undefined) {
    return null;
  }

  return {
    range,
    placeholder: document.getText(range),
  };
}

export function getRenameEdit(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  newName: string,
  context: ReferencesContext = {},
): WorkspaceEdit | null {
  if (!isValidIdentifier(newName)) {
    return null;
  }

  if (renameRange(document, analysis, position, context) === undefined) {
    return null;
  }

  const locations = getReferences(
    document,
    analysis,
    position,
    { includeDeclaration: true },
    context,
  );
  if (locations.length === 0) {
    return null;
  }

  const changes: NonNullable<WorkspaceEdit["changes"]> = {};
  for (const location of locations) {
    const edits = changes[location.uri] ?? [];
    edits.push(TextEdit.replace(location.range, newName));
    changes[location.uri] = edits;
  }

  return { changes };
}

function renameRange(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
  context: ReferencesContext,
): Range | undefined {
  const target = findHoverTarget(analysis.program, document.offsetAt(position));
  if (target === undefined || target.kind === "ModuleDoc" || target.kind === "ModuleReference") {
    return undefined;
  }

  const references = getReferences(
    document,
    analysis,
    position,
    { includeDeclaration: true },
    context,
  );
  if (references.length === 0) {
    return undefined;
  }

  return {
    start: {
      line: target.span.start.line - 1,
      character: target.span.start.column - 1,
    },
    end: {
      line: target.span.end.line - 1,
      character: target.span.end.column - 1,
    },
  };
}

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !keywords.has(name);
}
