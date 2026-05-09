import { check } from "./checker";
import { generateJavaScript } from "./codegen";
import type { Program } from "./ast";
import type { Diagnostic } from "./diagnostic";
import { lex } from "./lexer";
import { parse } from "./parser";

export type AnalyzeResult = {
  readonly program: Program;
  readonly diagnostics: readonly Diagnostic[];
};

export type CompileResult =
  | {
      readonly ok: true;
      readonly js: string;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
    };

export function analyze(source: string): AnalyzeResult {
  const lexResult = lex(source);
  const parseResult = parse(lexResult.tokens);
  const checkResult = check(parseResult.program);
  const diagnostics = [
    ...lexResult.diagnostics,
    ...parseResult.diagnostics,
    ...checkResult.diagnostics,
  ];

  return {
    program: parseResult.program,
    diagnostics,
  };
}

export function compile(source: string): CompileResult {
  const analysis = analyze(source);

  if (analysis.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics: analysis.diagnostics };
  }

  return {
    ok: true,
    js: generateJavaScript(analysis.program),
    diagnostics: analysis.diagnostics,
  };
}

export { generateJavaScript } from "./codegen";
export { lex } from "./lexer";
export { parse } from "./parser";
export type { Diagnostic } from "./diagnostic";
export type { Program } from "./ast";
