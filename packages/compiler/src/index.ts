export { check } from "./checker";
export { generateJavaScript, generateJavaScriptModule } from "./codegen";
export {
  analyze,
  analyzePackage,
  compile,
  compilePackage,
  lex,
  moduleNameFromPath,
  parse,
  parsePackageManifest,
} from "./compiler";
export { renderDiagnostic, renderDiagnostics } from "./diagnostic-renderer";
export { findHoverTarget, findNodeAt } from "./query";
export { formatType } from "./types";
export type { NodeId, Program } from "./ast";
export type { AnalyzePackageResult, AnalyzeResult, CompileResult, Diagnostic } from "./compiler";
export type {
  CompilePackageResult,
  EmittedFile,
  ModuleFile,
  ModuleId,
  ModuleName,
  PackageManifest,
  PackageProgram,
  PackageDiagnostic,
  SourceFile,
} from "./compiler";
export type { RenderDiagnosticOptions } from "./diagnostic-renderer";
export type { Definition, ReferenceTarget, Semantics } from "./semantics";
export type { HoverTarget, HoverTargetKind } from "./query";
export type { Span, SourceLocation } from "./span";
