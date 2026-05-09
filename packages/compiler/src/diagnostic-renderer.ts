import type { Diagnostic, DiagnosticNote } from "./diagnostic";
import type { Span } from "./span";

export type RenderDiagnosticOptions = {
  readonly diagnostic: Diagnostic;
  readonly source: string;
  readonly fileName: string;
};

export function renderDiagnostic(options: RenderDiagnosticOptions): string {
  const { diagnostic, source, fileName } = options;
  const lines: string[] = [formatHeader(diagnostic)];

  if (diagnostic.span === undefined) {
    appendNotes(lines, diagnostic.notes);
    return lines.join("\n");
  }

  appendSourceSnippet(lines, source, fileName, diagnostic.span, diagnostic.label);
  appendNotes(lines, diagnostic.notes);
  return lines.join("\n");
}

export function renderDiagnostics(
  diagnostics: readonly Diagnostic[],
  source: string,
  fileName: string,
): string {
  return diagnostics
    .map((diagnostic) => renderDiagnostic({ diagnostic, source, fileName }))
    .join("\n\n");
}

function formatHeader(diagnostic: Diagnostic): string {
  const code = diagnostic.code === undefined ? "" : `[${diagnostic.code}]`;
  return `${diagnostic.severity}${code}: ${diagnostic.message}`;
}

function appendSourceSnippet(
  lines: string[],
  source: string,
  fileName: string,
  span: Span,
  label: string | undefined,
): void {
  const sourceLine = getLine(source, span.start.line);
  const lineNumber = String(span.start.line);
  const gutterWidth = lineNumber.length;
  const gutter = " ".repeat(gutterWidth);

  lines.push(`  --> ${fileName}:${span.start.line}:${span.start.column}`);
  lines.push(`${gutter} |`);
  lines.push(`${lineNumber} | ${sourceLine}`);
  lines.push(`${gutter} | ${formatUnderline(span, sourceLine)}${formatLabel(label)}`);
}

function appendNotes(lines: string[], notes: readonly DiagnosticNote[] | undefined): void {
  if (notes === undefined || notes.length === 0) {
    return;
  }

  lines.push("  |");
  for (const note of notes) {
    lines.push(`${note.kind ?? "note"}: ${note.message}`);
  }
}

function getLine(source: string, oneBasedLine: number): string {
  return source.split(/\r\n|\n|\r/)[oneBasedLine - 1] ?? "";
}

function formatUnderline(span: Span, sourceLine: string): string {
  const leadingSpaces = " ".repeat(Math.max(0, span.start.column - 1));
  const remainingLineLength = Math.max(1, sourceLine.length - span.start.column + 1);
  const sameLineWidth =
    span.start.line === span.end.line ? Math.max(1, span.end.column - span.start.column) : 1;
  const underlineWidth = Math.min(remainingLineLength, sameLineWidth);

  return `${leadingSpaces}${"^".repeat(underlineWidth)}`;
}

function formatLabel(label: string | undefined): string {
  return label === undefined ? "" : ` ${label}`;
}
