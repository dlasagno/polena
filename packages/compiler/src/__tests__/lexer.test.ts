import { describe, expect, test } from "bun:test";
import { lex } from "../compiler";

describe("lexer", () => {
  test("tokenizes declarations and skips line comments", () => {
    const result = lex("// ignored\nconst answer: number = 42;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Colon",
      "NumberType",
      "Equal",
      "Number",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes doc comments", () => {
    const result = lex("//! Module docs\n/// Adds one.\nconst answer: number = 42;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => `${token.kind}:${token.text}`)).toEqual([
      "ModuleDocComment:Module docs",
      "DocComment:Adds one.",
      "Const:const",
      "Identifier:answer",
      "Colon::",
      "NumberType:number",
      "Equal:=",
      "Number:42",
      "Semicolon:;",
      "Eof:",
    ]);
  });

  test("tokenizes bigint literals and bigint types", () => {
    const result = lex("const answer: bigint = 42n;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Colon",
      "BigIntType",
      "Equal",
      "BigInt",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes function type return arrows separately from match arrows", () => {
    const result = lex("fn(number) -> number =>");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Fn",
      "LeftParen",
      "NumberType",
      "RightParen",
      "ReturnArrow",
      "NumberType",
      "Arrow",
      "Eof",
    ]);
  });

  test("tokenizes supported number literal forms", () => {
    const result = lex("0xff 0o70 0b1100 1e9 1.5e-3 0xffn");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => `${token.kind}:${token.text}`)).toEqual([
      "Number:0xff",
      "Number:0o70",
      "Number:0b1100",
      "Number:1e9",
      "Number:1.5e-3",
      "BigInt:0xffn",
      "Eof:",
    ]);
  });

  test("tokenizes type declarations", () => {
    const result = lex("type Score = number;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Type",
      "Identifier",
      "Equal",
      "NumberType",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes optional type punctuation", () => {
    const result = lex("const value: ?number = .None;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Colon",
      "Question",
      "NumberType",
      "Equal",
      "Dot",
      "Identifier",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes enums, match arrows, and wildcard patterns", () => {
    const result = lex("type Color = enum { Red, }; const label = match color { .Red => _, };");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Type",
      "Identifier",
      "Equal",
      "Enum",
      "LeftBrace",
      "Identifier",
      "Comma",
      "RightBrace",
      "Semicolon",
      "Const",
      "Identifier",
      "Equal",
      "Match",
      "Identifier",
      "LeftBrace",
      "Dot",
      "Identifier",
      "Arrow",
      "Identifier",
      "Comma",
      "RightBrace",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes if and else keywords", () => {
    const result = lex("if enabled { 1 } else { 0 }");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "If",
      "Identifier",
      "LeftBrace",
      "Number",
      "RightBrace",
      "Else",
      "LeftBrace",
      "Number",
      "RightBrace",
      "Eof",
    ]);
  });

  test("tokenizes while, break, and continue keywords", () => {
    const result = lex("while ready { continue; break; }");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "While",
      "Identifier",
      "LeftBrace",
      "Continue",
      "Semicolon",
      "Break",
      "Semicolon",
      "RightBrace",
      "Eof",
    ]);
  });

  test("tokenizes compound assignment operators", () => {
    const result = lex("value += 1; value %= 2; left ++ right; value |> next;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Identifier",
      "PlusEqual",
      "Number",
      "Semicolon",
      "Identifier",
      "PercentEqual",
      "Number",
      "Semicolon",
      "Identifier",
      "PlusPlus",
      "Identifier",
      "Semicolon",
      "Identifier",
      "PipeGreater",
      "Identifier",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes array literals and array types", () => {
    const result = lex("const values: []number = [1, 2];");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Colon",
      "LeftBracket",
      "RightBracket",
      "NumberType",
      "Equal",
      "LeftBracket",
      "Number",
      "Comma",
      "Number",
      "RightBracket",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes array member and index expressions", () => {
    const result = lex("values.length; values[0];");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Identifier",
      "Dot",
      "Identifier",
      "Semicolon",
      "Identifier",
      "LeftBracket",
      "Number",
      "RightBracket",
      "Semicolon",
      "Eof",
    ]);
  });

  test("tokenizes multiline strings", () => {
    const result = lex("const value = \\\\hello\n  \\\\world\n;");

    expect(result.diagnostics).toHaveLength(0);
    expect(result.tokens.map((token) => token.kind)).toEqual([
      "Const",
      "Identifier",
      "Equal",
      "MultilineString",
      "Semicolon",
      "Eof",
    ]);
  });

  test("reports invalid characters", () => {
    const result = lex("const value = #;");

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unexpected character '#'.",
    );
  });
});
