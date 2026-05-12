import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import { makeLocation, spanFrom, type SourceLocation } from "./span";
import type { Token, TokenKind } from "./token";

const keywords = new Map<string, TokenKind>([
  ["const", "Const"],
  ["let", "Let"],
  ["type", "Type"],
  ["fn", "Fn"],
  ["enum", "Enum"],
  ["match", "Match"],
  ["return", "Return"],
  ["if", "If"],
  ["else", "Else"],
  ["while", "While"],
  ["break", "Break"],
  ["continue", "Continue"],
  ["true", "True"],
  ["false", "False"],
  ["and", "And"],
  ["or", "Or"],
  ["number", "NumberType"],
  ["bigint", "BigIntType"],
  ["string", "StringType"],
  ["boolean", "BooleanType"],
  ["void", "VoidType"],
]);

export type LexResult = {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly Diagnostic[];
};

export function lex(source: string): LexResult {
  const lexer = new Lexer(source);
  return lexer.lex();
}

class Lexer {
  private readonly tokens: Token[] = [];
  private readonly diagnostics: Diagnostic[] = [];
  private offset = 0;
  private line = 1;
  private column = 1;

  public constructor(private readonly source: string) {}

  public lex(): LexResult {
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    const location = this.location();
    this.tokens.push({ kind: "Eof", text: "", span: spanFrom(location, location) });

    return {
      tokens: this.tokens,
      diagnostics: this.diagnostics,
    };
  }

  private scanToken(): void {
    const start = this.location();
    const char = this.advance();

    switch (char) {
      case " ":
      case "\r":
      case "\t":
        return;
      case "\n":
        return;
      case "(":
        this.addToken("LeftParen", start);
        return;
      case ")":
        this.addToken("RightParen", start);
        return;
      case "{":
        this.addToken("LeftBrace", start);
        return;
      case "}":
        this.addToken("RightBrace", start);
        return;
      case "[":
        this.addToken("LeftBracket", start);
        return;
      case "]":
        this.addToken("RightBracket", start);
        return;
      case ".":
        this.addToken("Dot", start);
        return;
      case ",":
        this.addToken("Comma", start);
        return;
      case ":":
        this.addToken("Colon", start);
        return;
      case ";":
        this.addToken("Semicolon", start);
        return;
      case "+":
        this.addToken(this.match("+") ? "PlusPlus" : this.match("=") ? "PlusEqual" : "Plus", start);
        return;
      case "-":
        this.addToken(this.match("=") ? "MinusEqual" : "Minus", start);
        return;
      case "*":
        this.addToken(this.match("=") ? "StarEqual" : "Star", start);
        return;
      case "%":
        this.addToken(this.match("=") ? "PercentEqual" : "Percent", start);
        return;
      case "!":
        this.addToken(this.match("=") ? "BangEqual" : "Bang", start);
        return;
      case "=":
        this.addToken(this.match(">") ? "Arrow" : this.match("=") ? "EqualEqual" : "Equal", start);
        return;
      case ">":
        this.addToken(this.match("=") ? "GreaterEqual" : "Greater", start);
        return;
      case "<":
        this.addToken(this.match("=") ? "LessEqual" : "Less", start);
        return;
      case "/":
        if (this.match("/")) {
          this.skipLineComment();
          return;
        }
        this.addToken(this.match("=") ? "SlashEqual" : "Slash", start);
        return;
      case '"':
        this.scanString(start);
        return;
      case "\\":
        if (this.match("\\")) {
          this.scanMultilineString(start);
          return;
        }
        break;
      default:
        break;
    }

    if (isDigit(char)) {
      this.scanNumber(start);
      return;
    }

    if (isIdentifierStart(char)) {
      this.scanIdentifier(start);
      return;
    }

    const span = spanFrom(start, this.location());
    this.tokens.push({ kind: "Invalid", text: char, span });
    this.diagnostics.push(
      error(`Unexpected character '${char}'.`, span, {
        code: DiagnosticCode.UnexpectedCharacter,
        label: "this character is not part of Polena syntax",
      }),
    );
  }

  private scanNumber(start: SourceLocation): void {
    if (this.source[start.offset] === "0") {
      const basePrefix = this.peek().toLowerCase();
      if (basePrefix === "x" || basePrefix === "o" || basePrefix === "b") {
        this.advance();
        while (isIdentifierPart(this.peek())) {
          this.advance();
        }

        const text = this.source.slice(start.offset, this.offset);
        const validation = validateBaseNumberLiteral(text, basePrefix);
        if (validation !== undefined) {
          this.addMalformedNumberLiteral(start, text, validation);
          return;
        }

        if (text.endsWith("n")) {
          this.tokens.push({
            kind: "BigInt",
            text,
            span: spanFrom(start, this.location()),
          });
          return;
        }

        this.addToken("Number", start);
        return;
      }
    }

    while (isDigit(this.peek()) || this.peek() === "_") {
      this.advance();
    }

    let sawFraction = false;
    if (this.peek() === "." && isDigit(this.peekNext())) {
      sawFraction = true;
      this.advance();
      while (isDigit(this.peek()) || this.peek() === "_") {
        this.advance();
      }
    }

    if (this.peek().toLowerCase() === "e") {
      this.advance();
      if (this.peek() === "+" || this.peek() === "-") {
        this.advance();
      }

      while (isDigit(this.peek()) || this.peek() === "_") {
        this.advance();
      }
    }

    if (isIdentifierStart(this.peek()) && this.peek() !== "n") {
      while (isIdentifierPart(this.peek())) {
        this.advance();
      }
    }

    if (this.match("n")) {
      while (isIdentifierPart(this.peek())) {
        this.advance();
      }

      const text = this.source.slice(start.offset, this.offset);
      const span = spanFrom(start, this.location());

      if (sawFraction) {
        this.tokens.push({ kind: "Invalid", text, span });
        this.diagnostics.push(
          error("Bigint literals cannot have a fractional part.", span, {
            code: DiagnosticCode.MalformedLiteralOrEscape,
            label: "remove the decimal point or use a 'number' literal instead",
          }),
        );
        return;
      }

      if (!text.endsWith("n")) {
        this.addMalformedNumberLiteral(start, text, {
          message: "Malformed bigint literal.",
          label: "bigint suffix must end the literal",
        });
        return;
      }

      const validation = validateDecimalNumberLiteral(text.slice(0, -1));
      if (validation !== undefined) {
        this.addMalformedNumberLiteral(start, text, validation);
        return;
      }

      this.tokens.push({ kind: "BigInt", text, span });
      return;
    }

    const text = this.source.slice(start.offset, this.offset);
    const validation = validateDecimalNumberLiteral(text);
    if (validation !== undefined) {
      this.addMalformedNumberLiteral(start, text, validation);
      return;
    }

    this.tokens.push({
      kind: "Number",
      text,
      span: spanFrom(start, this.location()),
    });
  }

  private scanIdentifier(start: SourceLocation): void {
    while (isIdentifierPart(this.peek())) {
      this.advance();
    }

    const text = this.source.slice(start.offset, this.offset);
    this.tokens.push({
      kind: keywords.get(text) ?? "Identifier",
      text,
      span: spanFrom(start, this.location()),
    });
  }

  private scanString(start: SourceLocation): void {
    while (!this.isAtEnd() && this.peek() !== '"') {
      const char = this.advance();

      if (char === "\n") {
        const span = spanFrom(start, this.location());
        this.diagnostics.push(
          error("Unterminated string literal.", span, {
            code: DiagnosticCode.UnterminatedString,
            label: "string literal starts here but is not closed",
            notes: [{ kind: "help", message: 'add a closing `"` before the end of the line' }],
          }),
        );
        this.tokens.push({
          kind: "Invalid",
          text: this.source.slice(start.offset, this.offset),
          span,
        });
        return;
      }

      if (char === "\\" && !this.isAtEnd()) {
        this.advance();
      }
    }

    if (this.isAtEnd()) {
      const span = spanFrom(start, this.location());
      this.diagnostics.push(
        error("Unterminated string literal.", span, {
          code: DiagnosticCode.UnterminatedString,
          label: "string literal starts here but is not closed",
          notes: [{ kind: "help", message: 'add a closing `"` before the end of the file' }],
        }),
      );
      this.tokens.push({
        kind: "Invalid",
        text: this.source.slice(start.offset, this.offset),
        span,
      });
      return;
    }

    this.advance();
    this.tokens.push({
      kind: "String",
      text: this.source.slice(start.offset + 1, this.offset - 1),
      span: spanFrom(start, this.location()),
    });
  }

  private scanMultilineString(start: SourceLocation): void {
    let value = this.scanMultilineStringLine();

    while (true) {
      const checkpoint = this.location();
      const lineStartOffset = this.offset;

      if (!this.match("\n")) {
        break;
      }

      while (this.peek() === " " || this.peek() === "\t") {
        this.advance();
      }

      if (!this.match("\\") || !this.match("\\")) {
        this.offset = lineStartOffset;
        this.line = checkpoint.line;
        this.column = checkpoint.column;
        break;
      }

      value += `\n${this.scanMultilineStringLine()}`;
    }

    this.tokens.push({
      kind: "MultilineString",
      text: value,
      span: spanFrom(start, this.location()),
    });
  }

  private scanMultilineStringLine(): string {
    const lineStart = this.offset;

    while (!this.isAtEnd() && this.peek() !== "\n") {
      this.advance();
    }

    return this.source.slice(lineStart, this.offset);
  }

  private skipLineComment(): void {
    while (!this.isAtEnd() && this.peek() !== "\n") {
      this.advance();
    }
  }

  private addToken(kind: TokenKind, start: SourceLocation): void {
    this.tokens.push({
      kind,
      text: this.source.slice(start.offset, this.offset),
      span: spanFrom(start, this.location()),
    });
  }

  private addMalformedNumberLiteral(
    start: SourceLocation,
    text: string,
    validation: NumberLiteralValidation,
  ): void {
    const span = spanFrom(start, this.location());
    this.tokens.push({ kind: "Invalid", text, span });
    this.diagnostics.push(
      error(validation.message, span, {
        code: DiagnosticCode.MalformedLiteralOrEscape,
        label: validation.label,
      }),
    );
  }

  private advance(): string {
    const char = this.source.charAt(this.offset);
    this.offset += 1;

    if (char === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }

    return char;
  }

  private match(expected: string): boolean {
    if (this.peek() !== expected) {
      return false;
    }

    this.advance();
    return true;
  }

  private peek(): string {
    return this.source.charAt(this.offset);
  }

  private peekNext(): string {
    return this.source.charAt(this.offset + 1);
  }

  private isAtEnd(): boolean {
    return this.offset >= this.source.length;
  }

  private location(): SourceLocation {
    return makeLocation(this.offset, this.line, this.column);
  }
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isBinaryDigit(char: string): boolean {
  return char === "0" || char === "1";
}

function isOctalDigit(char: string): boolean {
  return char >= "0" && char <= "7";
}

function isHexDigit(char: string): boolean {
  return isDigit(char) || (char >= "a" && char <= "f") || (char >= "A" && char <= "F");
}

type NumberLiteralValidation = {
  readonly message: string;
  readonly label: string;
};

function validateBaseNumberLiteral(
  text: string,
  prefix: "x" | "o" | "b",
): NumberLiteralValidation | undefined {
  const baseName = numberBaseName(prefix);
  const isBaseDigit = prefix === "x" ? isHexDigit : prefix === "o" ? isOctalDigit : isBinaryDigit;
  const body = text.endsWith("n") ? text.slice(2, -1) : text.slice(2);

  if (body.length === 0) {
    return {
      message: `Malformed ${baseName} literal.`,
      label: "expected at least one digit after the base prefix",
    };
  }

  if (body.startsWith("_") || body.endsWith("_") || body.includes("__")) {
    return {
      message: `Malformed ${baseName} literal.`,
      label: "numeric separators must appear between digits",
    };
  }

  for (const char of body) {
    if (char !== "_" && !isBaseDigit(char)) {
      return {
        message: `Malformed ${baseName} literal.`,
        label: `this character is not valid in a ${baseName} literal`,
      };
    }
  }

  return undefined;
}

function validateDecimalNumberLiteral(text: string): NumberLiteralValidation | undefined {
  const exponentIndex = findExponentIndex(text);
  const significand = exponentIndex === undefined ? text : text.slice(0, exponentIndex);
  const exponent = exponentIndex === undefined ? undefined : text.slice(exponentIndex + 1);

  if (hasInvalidDecimalCharacters(significand)) {
    return {
      message: "Malformed number literal.",
      label: "this character is not valid in a number literal",
    };
  }

  if (hasInvalidSeparatorPlacement(significand)) {
    return {
      message: "Malformed number literal.",
      label: "numeric separators must appear between digits",
    };
  }

  if (exponent !== undefined) {
    const exponentDigits =
      exponent.startsWith("+") || exponent.startsWith("-") ? exponent.slice(1) : exponent;

    if (exponentDigits.length === 0) {
      return {
        message: "Malformed number literal.",
        label: "expected at least one digit after the exponent marker",
      };
    }

    if (hasInvalidDecimalCharacters(exponentDigits)) {
      return {
        message: "Malformed number literal.",
        label: "this character is not valid in a number literal exponent",
      };
    }

    if (hasInvalidSeparatorPlacement(exponentDigits)) {
      return {
        message: "Malformed number literal.",
        label: "numeric separators must appear between digits",
      };
    }
  }

  return undefined;
}

function findExponentIndex(text: string): number | undefined {
  const lowerIndex = text.indexOf("e");
  const upperIndex = text.indexOf("E");

  if (lowerIndex === -1) {
    return upperIndex === -1 ? undefined : upperIndex;
  }

  if (upperIndex === -1) {
    return lowerIndex;
  }

  return Math.min(lowerIndex, upperIndex);
}

function hasInvalidDecimalCharacters(text: string): boolean {
  for (const char of text) {
    if (char !== "." && char !== "_" && !isDigit(char)) {
      return true;
    }
  }

  return false;
}

function hasInvalidSeparatorPlacement(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "_") {
      continue;
    }

    const previous = text[index - 1] ?? "";
    const next = text[index + 1] ?? "";
    if (!isDigit(previous) || !isDigit(next)) {
      return true;
    }
  }

  return false;
}

function numberBaseName(prefix: string): string {
  switch (prefix) {
    case "x":
      return "hexadecimal";
    case "o":
      return "octal";
    case "b":
      return "binary";
    default:
      return "number";
  }
}

function isIdentifierStart(char: string): boolean {
  return (
    (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_" || char === "$"
  );
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char);
}
