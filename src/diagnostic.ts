import type { Span } from "./span";

export type DiagnosticSeverity = "error" | "warning" | "note";

export type Diagnostic = {
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly span?: Span;
};

export function error(message: string, span?: Span): Diagnostic {
  return span === undefined ? { severity: "error", message } : { severity: "error", message, span };
}
