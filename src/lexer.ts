import { error, type Diagnostic } from "./diagnostic";
import { makeLocation, spanFrom, type SourceLocation } from "./span";
import type { Token, TokenKind } from "./token";

const keywords = new Map<string, TokenKind>([
  ["const", "Const"],
  ["let", "Let"],
  ["fn", "Fn"],
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
        this.addToken(this.match("=") ? "PlusEqual" : "Plus", start);
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
        this.addToken(this.match("=") ? "EqualEqual" : "Equal", start);
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
        code: "PLN001",
        label: "this character is not part of Polena syntax",
      }),
    );
  }

  private scanNumber(start: SourceLocation): void {
    while (isDigit(this.peek()) || this.peek() === "_") {
      this.advance();
    }

    if (this.peek() === "." && isDigit(this.peekNext())) {
      this.advance();
      while (isDigit(this.peek()) || this.peek() === "_") {
        this.advance();
      }
    }

    this.addToken("Number", start);
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
    let value = "";

    while (!this.isAtEnd() && this.peek() !== '"') {
      const char = this.advance();

      if (char === "\n") {
        const span = spanFrom(start, this.location());
        this.diagnostics.push(
          error("Unterminated string literal.", span, {
            code: "PLN002",
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

      if (char !== "\\") {
        value += char;
        continue;
      }

      if (this.isAtEnd()) {
        break;
      }

      const escaped = this.advance();
      switch (escaped) {
        case "0":
          value += "\0";
          break;
        case "t":
          value += "\t";
          break;
        case "n":
          value += "\n";
          break;
        case "r":
          value += "\r";
          break;
        case '"':
          value += '"';
          break;
        case "\\":
          value += "\\";
          break;
        default: {
          const span = spanFrom(start, this.location());
          this.diagnostics.push(
            error(`Unsupported escape sequence '\\${escaped}'.`, span, {
              code: "PLN003",
              label: "this escape sequence is not supported",
            }),
          );
          value += escaped;
          break;
        }
      }
    }

    if (this.isAtEnd()) {
      const span = spanFrom(start, this.location());
      this.diagnostics.push(
        error("Unterminated string literal.", span, {
          code: "PLN002",
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
    this.tokens.push({ kind: "String", text: value, span: spanFrom(start, this.location()) });
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

function isIdentifierStart(char: string): boolean {
  return (
    (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_" || char === "$"
  );
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || isDigit(char);
}
