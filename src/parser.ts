import type {
  BinaryOperator,
  Block,
  Expression,
  FunctionDeclaration,
  Parameter,
  PrimitiveType,
  Program,
  ReturnStatement,
  Statement,
  TopLevelDeclaration,
  TypeNode,
  UnaryOperator,
  VariableDeclaration,
} from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { makeLocation, mergeSpans, spanFrom } from "./span";
import type { Token, TokenKind } from "./token";

export type ParseResult = {
  readonly program: Program;
  readonly diagnostics: readonly Diagnostic[];
};

export function parse(tokens: readonly Token[]): ParseResult {
  const parser = new Parser(tokens);
  return parser.parse();
}

class Parser {
  private readonly diagnostics: Diagnostic[] = [];
  private index = 0;

  public constructor(private readonly tokens: readonly Token[]) {}

  public parse(): ParseResult {
    const declarations: TopLevelDeclaration[] = [];

    while (!this.check("Eof")) {
      declarations.push(this.parseTopLevelDeclaration());
    }

    const start = this.tokens[0]?.span.start ?? makeLocation(0, 1, 1);
    const end = this.current().span.end;

    return {
      program: {
        kind: "Program",
        declarations,
        span: spanFrom(start, end),
      },
      diagnostics: this.diagnostics,
    };
  }

  private parseTopLevelDeclaration(): TopLevelDeclaration {
    if (this.check("Fn")) {
      return this.parseFunctionDeclaration();
    }

    if (this.check("Const") || this.check("Let")) {
      return this.parseVariableDeclaration(true);
    }

    const expression = this.parseExpression();
    const semicolon = this.expect("Semicolon", "Expected ';' after expression.");
    return {
      kind: "ExpressionStatement",
      expression,
      span: mergeSpans(expression.span, semicolon.span),
    };
  }

  private parseFunctionDeclaration(): FunctionDeclaration {
    const fnToken = this.expect("Fn", "Expected 'fn'.");
    const name = this.expect("Identifier", "Expected function name.");
    this.expect("LeftParen", "Expected '(' after function name.");

    const params: Parameter[] = [];
    if (!this.check("RightParen")) {
      do {
        params.push(this.parseParameter());
      } while (this.match("Comma"));
    }

    this.expect("RightParen", "Expected ')' after function parameters.");
    this.expect("Colon", "Expected ':' before function return type.");
    const returnType = this.parseType();
    const body = this.parseBlock();

    return {
      kind: "FunctionDeclaration",
      name: name.text,
      nameSpan: name.span,
      params,
      returnType,
      body,
      span: mergeSpans(fnToken.span, body.span),
    };
  }

  private parseParameter(): Parameter {
    const name = this.expect("Identifier", "Expected parameter name.");
    this.expect("Colon", "Expected ':' after parameter name.");
    const type = this.parseType();

    return {
      kind: "Parameter",
      name: name.text,
      nameSpan: name.span,
      type,
      span: mergeSpans(name.span, type.span),
    };
  }

  private parseBlock(): Block {
    const leftBrace = this.expect("LeftBrace", "Expected '{' before function body.");
    const statements: Statement[] = [];
    let finalExpression: Expression | undefined;

    while (!this.check("RightBrace") && !this.check("Eof")) {
      if (this.check("Const") || this.check("Let")) {
        statements.push(this.parseVariableDeclaration(true));
        continue;
      }

      if (this.check("Return")) {
        statements.push(this.parseReturnStatement());
        continue;
      }

      const expression = this.parseExpression();
      if (this.match("Semicolon")) {
        const semicolon = this.previous();
        statements.push({
          kind: "ExpressionStatement",
          expression,
          span: mergeSpans(expression.span, semicolon.span),
        });
        continue;
      }

      finalExpression = expression;
      break;
    }

    const rightBrace = this.expect("RightBrace", "Expected '}' after block.");
    const span = mergeSpans(leftBrace.span, rightBrace.span);

    if (finalExpression === undefined) {
      return { kind: "Block", statements, span };
    }

    return { kind: "Block", statements, finalExpression, span };
  }

  private parseVariableDeclaration(requireSemicolon: boolean): VariableDeclaration {
    const keyword = this.match("Const")
      ? this.previous()
      : this.expect("Let", "Expected 'const' or 'let'.");
    const mutability = keyword.kind === "Const" ? "const" : "let";
    const name = this.expect("Identifier", `Expected name after '${mutability}'.`);
    let typeAnnotation: TypeNode | undefined;

    if (this.match("Colon")) {
      typeAnnotation = this.parseType();
    }

    this.expect("Equal", "Expected '=' and an initializer in variable declaration.");
    const initializer = this.parseExpression();
    const semicolon = requireSemicolon
      ? this.expect("Semicolon", "Expected ';' after variable declaration.")
      : undefined;

    const endSpan = semicolon?.span ?? initializer.span;

    return {
      kind: "VariableDeclaration",
      mutability,
      name: name.text,
      nameSpan: name.span,
      ...(typeAnnotation === undefined ? {} : { typeAnnotation }),
      initializer,
      span: mergeSpans(keyword.span, endSpan),
    };
  }

  private parseReturnStatement(): ReturnStatement {
    const returnToken = this.expect("Return", "Expected 'return'.");
    const expression = this.parseExpression();
    const semicolon = this.expect("Semicolon", "Expected ';' after return statement.");

    return {
      kind: "ReturnStatement",
      expression,
      span: mergeSpans(returnToken.span, semicolon.span),
    };
  }

  private parseType(): TypeNode {
    const token = this.current();
    const type = primitiveTypeFromToken(token.kind);

    if (type === undefined) {
      this.diagnostics.push(
        error("Expected a primitive type.", token.span, {
          code: "PLN010",
          label: "expected 'number', 'string', 'boolean', or 'void'",
        }),
      );
      this.advance();
      return { kind: "PrimitiveType", name: "void", span: token.span };
    }

    this.advance();
    return { kind: "PrimitiveType", name: type, span: token.span };
  }

  private parseExpression(): Expression {
    return this.parseBinaryExpression(1);
  }

  private parseBinaryExpression(minPrecedence: number): Expression {
    let left = this.parseUnaryExpression();

    while (true) {
      const operator = binaryOperatorFromToken(this.current().kind);
      if (operator === undefined) {
        break;
      }

      const precedence = binaryPrecedence(operator);
      if (precedence < minPrecedence) {
        break;
      }

      this.advance();
      const right = this.parseBinaryExpression(precedence + 1);
      left = {
        kind: "BinaryExpression",
        operator,
        left,
        right,
        span: mergeSpans(left.span, right.span),
      };
    }

    return left;
  }

  private parseUnaryExpression(): Expression {
    const operator = unaryOperatorFromToken(this.current().kind);
    if (operator === undefined) {
      return this.parseCallExpression();
    }

    const token = this.advance();
    const operand = this.parseUnaryExpression();
    return {
      kind: "UnaryExpression",
      operator,
      operand,
      span: mergeSpans(token.span, operand.span),
    };
  }

  private parseCallExpression(): Expression {
    let expression = this.parsePrimaryExpression();

    while (this.match("LeftParen")) {
      const leftParen = this.previous();
      const args: Expression[] = [];

      if (!this.check("RightParen")) {
        do {
          args.push(this.parseExpression());
        } while (this.match("Comma"));
      }

      const rightParen = this.expect("RightParen", "Expected ')' after arguments.");
      expression = {
        kind: "CallExpression",
        callee: expression,
        args,
        span: mergeSpans(expression.span, rightParen.span),
      };

      void leftParen;
    }

    return expression;
  }

  private parsePrimaryExpression(): Expression {
    if (this.match("Number")) {
      const token = this.previous();
      return {
        kind: "NumberLiteral",
        value: Number(token.text.replaceAll("_", "")),
        text: token.text,
        span: token.span,
      };
    }

    if (this.match("String")) {
      const token = this.previous();
      return {
        kind: "StringLiteral",
        value: token.text,
        text: token.text,
        span: token.span,
      };
    }

    if (this.match("True")) {
      const token = this.previous();
      return { kind: "BooleanLiteral", value: true, span: token.span };
    }

    if (this.match("False")) {
      const token = this.previous();
      return { kind: "BooleanLiteral", value: false, span: token.span };
    }

    if (this.match("Identifier")) {
      const token = this.previous();
      return { kind: "NameExpression", name: token.text, span: token.span };
    }

    if (this.match("LeftParen")) {
      const expression = this.parseExpression();
      this.expect("RightParen", "Expected ')' after expression.");
      return expression;
    }

    const token = this.current();
    this.diagnostics.push(
      error("Expected an expression.", token.span, {
        code: "PLN011",
        label: "expected an expression here",
      }),
    );
    this.advance();
    return {
      kind: "NumberLiteral",
      value: 0,
      text: "0",
      span: token.span,
    };
  }

  private expect(kind: TokenKind, message: string): Token {
    if (this.check(kind)) {
      return this.advance();
    }

    const token = this.current();
    this.diagnostics.push(
      error(message, token.span, {
        code: "PLN012",
        label: "parser was looking here",
      }),
    );
    return token;
  }

  private match(kind: TokenKind): boolean {
    if (!this.check(kind)) {
      return false;
    }

    this.advance();
    return true;
  }

  private check(kind: TokenKind): boolean {
    return this.current().kind === kind;
  }

  private advance(): Token {
    const token = this.current();
    if (!this.check("Eof")) {
      this.index += 1;
    }
    return token;
  }

  private previous(): Token {
    return this.tokens[Math.max(0, this.index - 1)] ?? this.current();
  }

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1] ?? syntheticEof();
  }
}

function primitiveTypeFromToken(kind: TokenKind): PrimitiveType | undefined {
  switch (kind) {
    case "NumberType":
      return "number";
    case "StringType":
      return "string";
    case "BooleanType":
      return "boolean";
    case "VoidType":
      return "void";
    default:
      return undefined;
  }
}

function unaryOperatorFromToken(kind: TokenKind): UnaryOperator | undefined {
  switch (kind) {
    case "Bang":
      return "!";
    case "Minus":
      return "-";
    default:
      return undefined;
  }
}

function binaryOperatorFromToken(kind: TokenKind): BinaryOperator | undefined {
  switch (kind) {
    case "Plus":
      return "+";
    case "Minus":
      return "-";
    case "Star":
      return "*";
    case "Slash":
      return "/";
    case "Percent":
      return "%";
    case "EqualEqual":
      return "==";
    case "BangEqual":
      return "!=";
    case "Greater":
      return ">";
    case "GreaterEqual":
      return ">=";
    case "Less":
      return "<";
    case "LessEqual":
      return "<=";
    case "And":
      return "and";
    case "Or":
      return "or";
    default:
      return undefined;
  }
}

function binaryPrecedence(operator: BinaryOperator): number {
  switch (operator) {
    case "or":
      return 1;
    case "and":
      return 2;
    case "==":
    case "!=":
      return 3;
    case ">":
    case ">=":
    case "<":
    case "<=":
      return 4;
    case "+":
    case "-":
      return 5;
    case "*":
    case "/":
    case "%":
      return 6;
  }
}

function syntheticEof(): Token {
  const location = makeLocation(0, 1, 1);
  return { kind: "Eof", text: "", span: spanFrom(location, location) };
}
