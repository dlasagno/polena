import type {
  AssignmentOperator,
  AssignmentStatement,
  BinaryOperator,
  Block,
  BreakStatement,
  ContinueStatement,
  Expression,
  FunctionDeclaration,
  IfExpression,
  LoopContinuation,
  ObjectLiteralExpression,
  ObjectLiteralField,
  ObjectTypeField,
  Parameter,
  PrimitiveType,
  Program,
  ReturnStatement,
  StringPart,
  Statement,
  TopLevelDeclaration,
  TypeDeclaration,
  TypeNode,
  UnaryOperator,
  VariableDeclaration,
  WhileExpression,
} from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import { lex } from "./lexer";
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
      const startIndex = this.index;
      declarations.push(this.parseTopLevelDeclaration());
      this.ensureProgress(startIndex);
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
    if (this.check("Type")) {
      return this.parseTypeDeclaration();
    }

    if (this.check("Fn")) {
      return this.parseFunctionDeclaration();
    }

    if (this.check("Const") || this.check("Let")) {
      return this.parseVariableDeclaration(true);
    }

    if (this.isAssignmentStatementStart()) {
      return this.parseAssignmentStatement();
    }

    if (this.check("Break")) {
      return this.parseBreakStatement();
    }

    if (this.check("Continue")) {
      return this.parseContinueStatement();
    }

    const expression = this.parseExpression();
    if (this.shouldTreatExpressionAsStatement(expression, false)) {
      return {
        kind: "ExpressionStatement",
        expression,
        span: expression.span,
      };
    }

    const semicolon = this.expect("Semicolon", "Expected ';' after expression.");
    return {
      kind: "ExpressionStatement",
      expression,
      span: mergeSpans(expression.span, semicolon.span),
    };
  }

  private parseTypeDeclaration(): TypeDeclaration {
    const typeToken = this.expect("Type", "Expected 'type'.");
    const name = this.expect("Identifier", "Expected type name.");
    this.expect("Equal", "Expected '=' in type declaration.");
    const value = this.parseType();
    const semicolon = this.expect("Semicolon", "Expected ';' after type declaration.");

    return {
      kind: "TypeDeclaration",
      name: name.text,
      nameSpan: name.span,
      value,
      span: mergeSpans(typeToken.span, semicolon.span),
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
    const body = this.parseBlock("function body");

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

  private parseBlock(context: string): Block {
    if (!this.check("LeftBrace")) {
      const token = this.current();
      this.diagnostics.push(
        error(`Expected '{' before ${context}.`, token.span, {
          code: DiagnosticCode.ParseExpectedToken,
          label: "parser was looking here",
        }),
      );
      this.recoverMissingBlock();
      return { kind: "Block", statements: [], span: token.span, isMissing: true };
    }

    const leftBrace = this.advance();
    const statements: Statement[] = [];
    let finalExpression: Expression | undefined;

    while (!this.check("RightBrace") && !this.check("Eof")) {
      const startIndex = this.index;

      if (this.check("Const") || this.check("Let")) {
        statements.push(this.parseVariableDeclaration(true));
        this.ensureProgress(startIndex);
        continue;
      }

      if (this.check("Return")) {
        statements.push(this.parseReturnStatement());
        this.ensureProgress(startIndex);
        continue;
      }

      if (this.check("Break")) {
        statements.push(this.parseBreakStatement());
        this.ensureProgress(startIndex);
        continue;
      }

      if (this.check("Continue")) {
        statements.push(this.parseContinueStatement());
        this.ensureProgress(startIndex);
        continue;
      }

      if (this.isAssignmentStatementStart()) {
        statements.push(this.parseAssignmentStatement());
        this.ensureProgress(startIndex);
        continue;
      }

      const expression = this.parseExpression();
      if (this.shouldTreatExpressionAsStatement(expression, true)) {
        statements.push({
          kind: "ExpressionStatement",
          expression,
          span: expression.span,
        });
        this.ensureProgress(startIndex);
        continue;
      }

      if (this.match("Semicolon")) {
        const semicolon = this.previous();
        statements.push({
          kind: "ExpressionStatement",
          expression,
          span: mergeSpans(expression.span, semicolon.span),
        });
        this.ensureProgress(startIndex);
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

  private parseBreakStatement(): BreakStatement {
    const breakToken = this.expect("Break", "Expected 'break'.");

    if (this.match("Semicolon")) {
      return {
        kind: "BreakStatement",
        span: mergeSpans(breakToken.span, this.previous().span),
      };
    }

    const expression = this.parseExpression();
    const semicolon = this.expect("Semicolon", "Expected ';' after break statement.");
    return {
      kind: "BreakStatement",
      expression,
      span: mergeSpans(breakToken.span, semicolon.span),
    };
  }

  private parseContinueStatement(): ContinueStatement {
    const continueToken = this.expect("Continue", "Expected 'continue'.");
    const semicolon = this.expect("Semicolon", "Expected ';' after continue statement.");
    return {
      kind: "ContinueStatement",
      span: mergeSpans(continueToken.span, semicolon.span),
    };
  }

  private parseAssignmentStatement(requireSemicolon = true): AssignmentStatement {
    const name = this.expect("Identifier", "Expected assignment target.");
    const operatorToken = this.advanceAssignmentOperator();
    const operator = assignmentOperatorFromToken(operatorToken.kind) ?? "=";
    const value = this.parseExpression();
    const semicolon = requireSemicolon
      ? this.expect("Semicolon", "Expected ';' after assignment statement.")
      : undefined;

    return {
      kind: "AssignmentStatement",
      operator,
      name: name.text,
      nameSpan: name.span,
      value,
      span: mergeSpans(name.span, semicolon?.span ?? value.span),
    };
  }

  private parseType(): TypeNode {
    if (this.match("LeftBracket")) {
      const leftBracket = this.previous();
      this.expect("RightBracket", "Expected ']' in array type.");
      const element = this.parseType();
      return {
        kind: "ArrayType",
        element,
        span: mergeSpans(leftBracket.span, element.span),
      };
    }

    if (this.match("LeftBrace")) {
      const leftBrace = this.previous();
      const fields: ObjectTypeField[] = [];

      if (!this.check("RightBrace")) {
        do {
          if (this.check("RightBrace")) {
            break;
          }

          if (!this.check("Identifier")) {
            this.diagnostics.push(
              error("Expected field name in object type.", this.current().span, {
                code: DiagnosticCode.ParseExpectedToken,
                label: "parser was looking here",
              }),
            );
            this.recoverToClosingBrace();
            break;
          }

          const name = this.advance();
          this.expect("Colon", "Expected ':' after object type field name.");
          const type = this.parseType();
          fields.push({
            kind: "ObjectTypeField" as const,
            name: name.text,
            nameSpan: name.span,
            type,
            span: mergeSpans(name.span, type.span),
          });
        } while (this.match("Comma"));
      }

      const rightBrace = this.expectClosingDelimiter(
        "RightBrace",
        "Expected '}' after object type.",
      );
      return {
        kind: "ObjectType",
        fields,
        span: mergeSpans(leftBrace.span, rightBrace.span),
      };
    }

    const token = this.current();
    const type = primitiveTypeFromToken(token.kind);

    if (type === undefined) {
      if (token.kind === "Identifier") {
        this.advance();
        return {
          kind: "NamedType",
          name: token.text,
          nameSpan: token.span,
          span: token.span,
        };
      }

      this.diagnostics.push(
        error("Expected a type.", token.span, {
          code: DiagnosticCode.ExpectedTypeSyntax,
          label: "expected a type such as 'number', 'string', or '[]number'",
        }),
      );
      if (!this.isTypeRecoveryBoundary()) {
        this.advance();
      }
      return { kind: "UnknownType", span: token.span };
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
      return this.parsePostfixExpression();
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

  private parsePostfixExpression(): Expression {
    let expression = this.parsePrimaryExpression();

    while (true) {
      if (this.match("LeftParen")) {
        const leftParen = this.previous();
        const args: Expression[] = [];

        if (!this.check("RightParen")) {
          while (true) {
            args.push(this.parseExpression());

            if (!this.match("Comma")) {
              break;
            }

            if (this.check("RightParen")) {
              this.diagnostics.push(
                error("Expected an expression.", this.current().span, {
                  code: DiagnosticCode.ExpectedExpression,
                  label: "expected an expression here",
                }),
              );
              break;
            }
          }
        }

        const rightParen = this.expectClosingDelimiter(
          "RightParen",
          "Expected ')' after arguments.",
        );
        expression = {
          kind: "CallExpression",
          callee: expression,
          args,
          span: mergeSpans(expression.span, rightParen.span),
        };

        void leftParen;
        continue;
      }

      if (this.match("LeftBracket")) {
        const index = this.parseExpression();
        const rightBracket = this.expectClosingDelimiter(
          "RightBracket",
          "Expected ']' after array index.",
        );
        expression = {
          kind: "IndexExpression",
          target: expression,
          index,
          span: mergeSpans(expression.span, rightBracket.span),
        };
        continue;
      }

      if (this.match("Dot")) {
        const name = this.expect("Identifier", "Expected property name after '.'.");
        expression = {
          kind: "MemberExpression",
          target: expression,
          name: name.text,
          nameSpan: name.span,
          span: mergeSpans(expression.span, name.span),
        };
        continue;
      }

      break;
    }

    return expression;
  }

  private parsePrimaryExpression(): Expression {
    if (this.check("If")) {
      return this.parseIfExpression();
    }

    if (this.check("While")) {
      return this.parseWhileExpression();
    }

    if (this.match("Number")) {
      const token = this.previous();
      return {
        kind: "NumberLiteral",
        value: Number(token.text.replaceAll("_", "")),
        text: token.text,
        span: token.span,
      };
    }

    if (this.match("BigInt")) {
      const token = this.previous();
      return {
        kind: "BigIntLiteral",
        text: token.text,
        span: token.span,
      };
    }

    if (this.match("String") || this.match("MultilineString")) {
      const token = this.previous();
      return {
        kind: "StringLiteral",
        parts: parseStringParts(token.text, token.span, this.diagnostics),
        span: token.span,
      };
    }

    if (this.check("LeftBracket")) {
      return this.parseArrayLiteral();
    }

    if (this.check("LeftBrace")) {
      return this.parseObjectLiteral();
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
      this.expectClosingDelimiter("RightParen", "Expected ')' after expression.");
      return expression;
    }

    const token = this.current();
    this.diagnostics.push(
      error("Expected an expression.", token.span, {
        code: DiagnosticCode.ExpectedExpression,
        label: "expected an expression here",
      }),
    );
    if (!this.isExpressionRecoveryBoundary()) {
      this.advance();
    }
    return {
      kind: "NumberLiteral",
      value: 0,
      text: "0",
      span: token.span,
    };
  }

  private parseArrayLiteral(): Expression {
    const leftBracket = this.expect("LeftBracket", "Expected '['.");
    const elements: Expression[] = [];

    if (!this.check("RightBracket")) {
      do {
        if (this.check("RightBracket")) {
          break;
        }

        elements.push(this.parseExpression());
      } while (this.match("Comma"));
    }

    const rightBracket = this.expectClosingDelimiter(
      "RightBracket",
      "Expected ']' after array literal.",
    );
    return {
      kind: "ArrayLiteral",
      elements,
      span: mergeSpans(leftBracket.span, rightBracket.span),
    };
  }

  private parseObjectLiteral(): ObjectLiteralExpression {
    const leftBrace = this.expect("LeftBrace", "Expected '{'.");
    const fields: ObjectLiteralField[] = [];

    if (!this.check("RightBrace")) {
      do {
        if (this.check("RightBrace")) {
          break;
        }

        const name = this.expect("Identifier", "Expected field name in object literal.");
        this.expect("Colon", "Expected ':' after object literal field name.");
        const value = this.parseExpression();
        fields.push({
          kind: "ObjectLiteralField" as const,
          name: name.text,
          nameSpan: name.span,
          value,
          span: mergeSpans(name.span, value.span),
        });
      } while (this.match("Comma"));
    }

    const rightBrace = this.expectClosingDelimiter(
      "RightBrace",
      "Expected '}' after object literal.",
    );
    return {
      kind: "ObjectLiteral",
      fields,
      span: mergeSpans(leftBrace.span, rightBrace.span),
    };
  }

  private recoverToClosingBrace(): void {
    while (!this.check("RightBrace") && !this.check("Eof")) {
      this.advance();
    }
  }

  private parseIfExpression(): IfExpression {
    const ifToken = this.expect("If", "Expected 'if'.");
    const condition = this.parseCondition("if");
    const thenBlock = this.parseBlock("if body");
    let elseBlock: Block | undefined;

    if (this.match("Else")) {
      elseBlock = this.parseBlock("else block");
    }

    return {
      kind: "IfExpression",
      condition,
      thenBlock,
      ...(elseBlock === undefined ? {} : { elseBlock }),
      span: mergeSpans(ifToken.span, elseBlock?.span ?? thenBlock.span),
    };
  }

  private parseWhileExpression(): WhileExpression {
    const whileToken = this.expect("While", "Expected 'while'.");
    const condition = this.parseCondition("while");
    let continuation: LoopContinuation | undefined;

    if (this.match("Colon")) {
      this.expect("LeftParen", "Expected '(' before while continuation.");
      continuation = this.parseLoopContinuation();
      this.expect("RightParen", "Expected ')' after while continuation.");
    }

    const body = this.parseBlock("while body");
    let elseBlock: Block | undefined;

    if (this.match("Else")) {
      elseBlock = this.parseBlock("else block");
    }

    return {
      kind: "WhileExpression",
      condition,
      ...(continuation === undefined ? {} : { continuation }),
      body,
      ...(elseBlock === undefined ? {} : { elseBlock }),
      span: mergeSpans(whileToken.span, elseBlock?.span ?? body.span),
    };
  }

  private parseLoopContinuation(): LoopContinuation {
    if (this.isAssignmentStatementStart()) {
      return this.parseAssignmentStatement(false);
    }

    return this.parseExpression();
  }

  private parseCondition(keyword: "if" | "while"): Expression {
    if (!this.match("LeftParen")) {
      return this.parseExpression();
    }

    const condition = this.parseExpression();
    this.expect("RightParen", `Expected ')' after ${keyword} condition.`);
    return condition;
  }

  private shouldTreatExpressionAsStatement(
    expression: Expression,
    canBecomeFinalExpression: boolean,
  ): boolean {
    if (this.check("Semicolon")) {
      return false;
    }

    switch (expression.kind) {
      case "IfExpression":
        return !canBecomeFinalExpression || !this.check("RightBrace");
      case "WhileExpression":
        return (
          expression.elseBlock === undefined ||
          !canBecomeFinalExpression ||
          !this.check("RightBrace")
        );
      default:
        return false;
    }
  }

  private expect(kind: TokenKind, message: string): Token {
    if (this.check(kind)) {
      return this.advance();
    }

    const token = this.current();
    this.diagnostics.push(
      error(message, token.span, {
        code: DiagnosticCode.ParseExpectedToken,
        label: "parser was looking here",
      }),
    );
    return token;
  }

  private expectClosingDelimiter(
    kind: "RightParen" | "RightBracket" | "RightBrace",
    message: string,
  ): Token {
    if (this.check(kind)) {
      return this.advance();
    }

    const token = this.current();
    this.diagnostics.push(
      error(message, token.span, {
        code: DiagnosticCode.ParseExpectedToken,
        label: "parser was looking here",
      }),
    );

    while (!this.check(kind) && !this.isClosingDelimiterRecoveryBoundary()) {
      this.advance();
    }

    if (this.check(kind)) {
      return this.advance();
    }

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

  private isAssignmentStatementStart(): boolean {
    return this.check("Identifier") && assignmentOperatorFromToken(this.peek().kind) !== undefined;
  }

  private isExpressionRecoveryBoundary(): boolean {
    switch (this.current().kind) {
      case "Semicolon":
      case "RightBrace":
      case "RightParen":
      case "RightBracket":
      case "Eof":
        return true;
      default:
        return false;
    }
  }

  private isClosingDelimiterRecoveryBoundary(): boolean {
    switch (this.current().kind) {
      case "Semicolon":
      case "RightBrace":
      case "Eof":
        return true;
      default:
        return false;
    }
  }

  private isTypeRecoveryBoundary(): boolean {
    switch (this.current().kind) {
      case "Equal":
      case "LeftBrace":
      case "RightParen":
      case "Comma":
      case "Semicolon":
      case "Eof":
        return true;
      default:
        return false;
    }
  }

  private recoverMissingBlock(): void {
    while (!this.isMissingBlockRecoveryBoundary()) {
      this.advance();
    }
  }

  private isMissingBlockRecoveryBoundary(): boolean {
    switch (this.current().kind) {
      case "Else":
      case "Semicolon":
      case "RightBrace":
      case "Eof":
        return true;
      default:
        return false;
    }
  }

  private advanceAssignmentOperator(): Token {
    const token = this.current();
    const operator = assignmentOperatorFromToken(token.kind);
    if (operator !== undefined) {
      return this.advance();
    }

    this.diagnostics.push(
      error("Expected assignment operator in assignment statement.", token.span, {
        code: DiagnosticCode.ParseExpectedToken,
        label: "parser was looking here",
      }),
    );
    return token;
  }

  private advance(): Token {
    const token = this.current();
    if (!this.check("Eof")) {
      this.index += 1;
    }
    return token;
  }

  private ensureProgress(startIndex: number): void {
    if (this.index === startIndex && !this.check("Eof")) {
      this.advance();
    }
  }

  private previous(): Token {
    return this.tokens[Math.max(0, this.index - 1)] ?? this.current();
  }

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1] ?? syntheticEof();
  }

  private peek(): Token {
    return this.tokens[this.index + 1] ?? this.current();
  }

  public parseInterpolationExpression(): {
    readonly expression: Expression;
    readonly diagnostics: readonly Diagnostic[];
    readonly consumedAll: boolean;
  } {
    const expression = this.parseExpression();
    return {
      expression,
      diagnostics: this.diagnostics,
      consumedAll: this.check("Eof"),
    };
  }
}

function primitiveTypeFromToken(kind: TokenKind): PrimitiveType | undefined {
  switch (kind) {
    case "NumberType":
      return "number";
    case "BigIntType":
      return "bigint";
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

function assignmentOperatorFromToken(kind: TokenKind): AssignmentOperator | undefined {
  switch (kind) {
    case "Equal":
      return "=";
    case "PlusEqual":
      return "+=";
    case "MinusEqual":
      return "-=";
    case "StarEqual":
      return "*=";
    case "SlashEqual":
      return "/=";
    case "PercentEqual":
      return "%=";
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

function parseStringParts(
  source: string,
  span: Token["span"],
  diagnostics: Diagnostic[],
): readonly StringPart[] {
  const parts: StringPart[] = [];
  let text = "";
  let index = 0;

  while (index < source.length) {
    if (source.startsWith("${", index)) {
      if (text.length > 0) {
        parts.push({ kind: "StringText", value: text });
        text = "";
      }

      const interpolationEnd = findInterpolationEnd(source, index + 2);
      if (interpolationEnd === undefined) {
        diagnostics.push(
          error("Unterminated string interpolation.", span, {
            code: DiagnosticCode.UnterminatedInterpolation,
            label: "this interpolation is missing a closing '}'",
            notes: [{ kind: "help", message: "close the interpolation with '}'" }],
          }),
        );
        break;
      }

      const expressionSource = source.slice(index + 2, interpolationEnd).trim();
      const expression = parseInterpolationSource(expressionSource, span, diagnostics);
      if (expression !== undefined) {
        parts.push({ kind: "StringInterpolation", expression });
      }

      index = interpolationEnd + 1;
      continue;
    }

    if (source[index] === "\\") {
      const escaped = source[index + 1];
      const decoded = decodeStringEscape(escaped);
      if (decoded !== undefined) {
        text += decoded;
        index += 2;
        continue;
      }

      diagnostics.push(
        error(`Unsupported escape sequence '\\${escaped ?? ""}'.`, span, {
          code: DiagnosticCode.MalformedLiteralOrEscape,
          label: "this escape sequence is not supported",
        }),
      );

      if (escaped !== undefined) {
        text += escaped;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    text += source[index] ?? "";
    index += 1;
  }

  if (text.length > 0 || parts.length === 0) {
    parts.push({ kind: "StringText", value: text });
  }

  return mergeAdjacentStringText(parts);
}

function parseInterpolationSource(
  source: string,
  span: Token["span"],
  diagnostics: Diagnostic[],
): Expression | undefined {
  if (source.length === 0) {
    diagnostics.push(
      error("String interpolation must contain an expression.", span, {
        code: DiagnosticCode.InvalidInterpolation,
        label: "this interpolation is empty",
      }),
    );
    return undefined;
  }

  const lexResult = lex(source);
  if (lexResult.diagnostics.length > 0) {
    diagnostics.push(
      error("Invalid interpolation expression.", span, {
        code: DiagnosticCode.InvalidInterpolation,
        label: "this interpolation does not contain a valid expression",
        notes: [
          { kind: "note", message: lexResult.diagnostics[0]?.message ?? "invalid expression" },
        ],
      }),
    );
    return undefined;
  }

  const parser = new Parser(lexResult.tokens);
  const result = parser.parseInterpolationExpression();
  if (result.diagnostics.length > 0 || !result.consumedAll) {
    diagnostics.push(
      error("Invalid interpolation expression.", span, {
        code: DiagnosticCode.InvalidInterpolation,
        label: "this interpolation does not contain a valid expression",
        notes: [
          {
            kind: "note",
            message: result.diagnostics[0]?.message ?? "expected a single expression",
          },
        ],
      }),
    );
    return undefined;
  }

  return result.expression;
}

function findInterpolationEnd(source: string, start: number): number | undefined {
  let depth = 1;
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (char === '"') {
      index = skipQuotedString(source, index + 1);
      continue;
    }

    if (char === "{") {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  return undefined;
}

function skipQuotedString(source: string, index: number): number {
  let cursor = index;

  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (char === '"') {
      return cursor + 1;
    }
    cursor += 1;
  }

  return cursor;
}

function decodeStringEscape(char: string | undefined): string | undefined {
  switch (char) {
    case "0":
      return "\0";
    case "t":
      return "\t";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case '"':
      return '"';
    case "\\":
      return "\\";
    default:
      return undefined;
  }
}

function mergeAdjacentStringText(parts: readonly StringPart[]): readonly StringPart[] {
  const merged: StringPart[] = [];

  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (part.kind === "StringText" && previous?.kind === "StringText") {
      merged[merged.length - 1] = {
        kind: "StringText",
        value: previous.value + part.value,
      };
      continue;
    }

    merged.push(part);
  }

  return merged;
}

function syntheticEof(): Token {
  const location = makeLocation(0, 1, 1);
  return { kind: "Eof", text: "", span: spanFrom(location, location) };
}
