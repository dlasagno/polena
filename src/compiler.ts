import { check } from "./checker";
import { generateJavaScript } from "./codegen";
import type { Diagnostic } from "./diagnostic";
import { lex } from "./lexer";
import { parse } from "./parser";

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

export function compile(source: string): CompileResult {
  const lexResult = lex(source);
  const parseResult = parse(lexResult.tokens);
  const checkResult = check(parseResult.program);
  const diagnostics = [
    ...lexResult.diagnostics,
    ...parseResult.diagnostics,
    ...checkResult.diagnostics,
  ];

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    js: generateJavaScript(parseResult.program),
    diagnostics,
  };
}

export { generateJavaScript } from "./codegen";
export { lex } from "./lexer";
export { parse } from "./parser";
export type { Diagnostic } from "./diagnostic";
export type { Program } from "./ast";
