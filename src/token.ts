import type { Span } from "./span";

export type TokenKind =
  | "Identifier"
  | "Number"
  | "String"
  | "Const"
  | "Let"
  | "Fn"
  | "Return"
  | "True"
  | "False"
  | "And"
  | "Or"
  | "NumberType"
  | "StringType"
  | "BooleanType"
  | "VoidType"
  | "LeftParen"
  | "RightParen"
  | "LeftBrace"
  | "RightBrace"
  | "Comma"
  | "Colon"
  | "Semicolon"
  | "Equal"
  | "Plus"
  | "Minus"
  | "Star"
  | "Slash"
  | "Percent"
  | "Bang"
  | "EqualEqual"
  | "BangEqual"
  | "Greater"
  | "GreaterEqual"
  | "Less"
  | "LessEqual"
  | "Eof"
  | "Invalid";

export type Token = {
  readonly kind: TokenKind;
  readonly text: string;
  readonly span: Span;
};
