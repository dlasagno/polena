import type { Span } from "./span";

export type DiagnosticSeverity = "error" | "warning" | "note";

export type DiagnosticNoteKind = "note" | "help";

export type DiagnosticNote = {
  readonly kind?: DiagnosticNoteKind;
  readonly message: string;
  readonly span?: Span;
};

export type Diagnostic = {
  readonly severity: DiagnosticSeverity;
  readonly code?: string;
  readonly message: string;
  readonly sourcePath?: string;
  readonly span?: Span;
  readonly label?: string;
  readonly notes?: readonly DiagnosticNote[];
};

export type DiagnosticOptions = {
  readonly code?: string;
  readonly sourcePath?: string;
  readonly label?: string;
  readonly notes?: readonly DiagnosticNote[];
};

export function error(message: string, span?: Span, options: DiagnosticOptions = {}): Diagnostic {
  return {
    severity: "error",
    message,
    ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath }),
    ...(span === undefined ? {} : { span }),
    ...(options.code === undefined ? {} : { code: options.code }),
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.notes === undefined ? {} : { notes: options.notes }),
  };
}
