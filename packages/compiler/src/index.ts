export { check } from "./checker";
export { generateJavaScript } from "./codegen";
export { analyze, compile, lex, parse } from "./compiler";
export { renderDiagnostic, renderDiagnostics } from "./diagnostic-renderer";
export type { Program } from "./ast";
export type { AnalyzeResult, CompileResult, Diagnostic } from "./compiler";
export type { RenderDiagnosticOptions } from "./diagnostic-renderer";
export type { Span, SourceLocation } from "./span";
