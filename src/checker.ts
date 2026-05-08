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
  VariableDeclaration,
} from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import type { Span } from "./span";

export type CheckResult = {
  readonly diagnostics: readonly Diagnostic[];
};

type ValueType =
  | { readonly kind: "primitive"; readonly name: PrimitiveType }
  | {
      readonly kind: "function";
      readonly params: readonly PrimitiveType[];
      readonly returnType: PrimitiveType;
    }
  | { readonly kind: "unknown" };

type SymbolInfo = {
  readonly name: string;
  readonly type: ValueType;
  readonly span: Span;
};

export function check(program: Program): CheckResult {
  const checker = new Checker();
  return checker.check(program);
}

class Scope {
  private readonly symbols = new Map<string, SymbolInfo>();

  public constructor(private readonly parent?: Scope) {}

  public declare(symbol: SymbolInfo): boolean {
    if (this.symbols.has(symbol.name)) {
      return false;
    }

    this.symbols.set(symbol.name, symbol);
    return true;
  }

  public lookup(name: string): SymbolInfo | undefined {
    return this.symbols.get(name) ?? this.parent?.lookup(name);
  }
}

class Checker {
  private readonly diagnostics: Diagnostic[] = [];

  public check(program: Program): CheckResult {
    const scope = new Scope();

    for (const declaration of program.declarations) {
      if (declaration.kind !== "FunctionDeclaration") {
        continue;
      }

      this.declareFunction(scope, declaration);
    }

    for (const declaration of program.declarations) {
      switch (declaration.kind) {
        case "FunctionDeclaration":
          this.checkFunction(declaration, scope);
          break;
        case "VariableDeclaration":
          this.checkVariableDeclaration(declaration, scope);
          break;
        case "ExpressionStatement":
          this.inferExpression(declaration.expression, scope);
          break;
      }
    }

    return { diagnostics: this.diagnostics };
  }

  private declareFunction(scope: Scope, declaration: FunctionDeclaration): void {
    const type: ValueType = {
      kind: "function",
      params: declaration.params.map((param) => param.type.name),
      returnType: declaration.returnType.name,
    };

    if (!scope.declare({ name: declaration.name, type, span: declaration.nameSpan })) {
      this.diagnostics.push(
        error(`Duplicate top-level name '${declaration.name}'.`, declaration.nameSpan),
      );
    }
  }

  private checkFunction(declaration: FunctionDeclaration, parentScope: Scope): void {
    const scope = new Scope(parentScope);

    for (const param of declaration.params) {
      this.declareParameter(scope, param);
    }

    const explicitReturns = this.checkBlock(declaration.body, scope, declaration.returnType.name);
    if (declaration.body.finalExpression !== undefined) {
      const finalType = this.inferExpression(declaration.body.finalExpression, scope);
      this.expectType(
        finalType,
        primitiveType(declaration.returnType.name),
        declaration.body.finalExpression.span,
      );
      return;
    }

    if (declaration.returnType.name !== "void" && explicitReturns === 0) {
      this.diagnostics.push(
        error(
          `Function '${declaration.name}' must return '${declaration.returnType.name}'.`,
          declaration.nameSpan,
        ),
      );
    }
  }

  private checkBlock(block: Block, scope: Scope, returnType: PrimitiveType): number {
    let explicitReturns = 0;

    for (const statement of block.statements) {
      if (this.checkStatement(statement, scope, returnType)) {
        explicitReturns += 1;
      }
    }

    return explicitReturns;
  }

  private checkStatement(statement: Statement, scope: Scope, returnType: PrimitiveType): boolean {
    switch (statement.kind) {
      case "VariableDeclaration":
        this.checkVariableDeclaration(statement, scope);
        return false;
      case "ExpressionStatement":
        this.inferExpression(statement.expression, scope);
        return false;
      case "ReturnStatement":
        this.checkReturnStatement(statement, scope, returnType);
        return true;
    }
  }

  private declareParameter(scope: Scope, param: Parameter): void {
    if (
      !scope.declare({
        name: param.name,
        type: primitiveType(param.type.name),
        span: param.nameSpan,
      })
    ) {
      this.diagnostics.push(error(`Duplicate parameter '${param.name}'.`, param.nameSpan));
    }
  }

  private checkVariableDeclaration(declaration: VariableDeclaration, scope: Scope): void {
    const initializerType = this.inferExpression(declaration.initializer, scope);
    const declaredType =
      declaration.typeAnnotation === undefined
        ? initializerType
        : primitiveType(declaration.typeAnnotation.name);

    if (declaration.typeAnnotation !== undefined) {
      this.expectType(initializerType, declaredType, declaration.initializer.span);
    }

    if (
      !scope.declare({ name: declaration.name, type: declaredType, span: declaration.nameSpan })
    ) {
      this.diagnostics.push(error(`Duplicate name '${declaration.name}'.`, declaration.nameSpan));
    }
  }

  private checkReturnStatement(
    statement: ReturnStatement,
    scope: Scope,
    returnType: PrimitiveType,
  ): void {
    const actualType = this.inferExpression(statement.expression, scope);
    this.expectType(actualType, primitiveType(returnType), statement.expression.span);
  }

  private inferExpression(expression: Expression, scope: Scope): ValueType {
    switch (expression.kind) {
      case "NumberLiteral":
        return primitiveType("number");
      case "StringLiteral":
        return primitiveType("string");
      case "BooleanLiteral":
        return primitiveType("boolean");
      case "NameExpression": {
        const symbol = scope.lookup(expression.name);
        if (symbol === undefined) {
          this.diagnostics.push(error(`Unknown name '${expression.name}'.`, expression.span));
          return unknownType();
        }
        return symbol.type;
      }
      case "UnaryExpression":
        return this.inferUnaryExpression(
          expression.operator,
          expression.operand,
          expression.span,
          scope,
        );
      case "BinaryExpression":
        return this.inferBinaryExpression(
          expression.operator,
          expression.left,
          expression.right,
          expression.span,
          scope,
        );
      case "CallExpression":
        return this.inferCallExpression(expression, scope);
    }
  }

  private inferUnaryExpression(
    operator: "!" | "-",
    operand: Expression,
    span: Span,
    scope: Scope,
  ): ValueType {
    const operandType = this.inferExpression(operand, scope);

    switch (operator) {
      case "!":
        this.expectType(operandType, primitiveType("boolean"), span);
        return primitiveType("boolean");
      case "-":
        this.expectType(operandType, primitiveType("number"), span);
        return primitiveType("number");
    }
  }

  private inferBinaryExpression(
    operator: BinaryOperator,
    left: Expression,
    right: Expression,
    span: Span,
    scope: Scope,
  ): ValueType {
    const leftType = this.inferExpression(left, scope);
    const rightType = this.inferExpression(right, scope);

    if (isArithmeticOperator(operator)) {
      this.expectType(leftType, primitiveType("number"), left.span);
      this.expectType(rightType, primitiveType("number"), right.span);
      return primitiveType("number");
    }

    if (operator === "and" || operator === "or") {
      this.expectType(leftType, primitiveType("boolean"), left.span);
      this.expectType(rightType, primitiveType("boolean"), right.span);
      return primitiveType("boolean");
    }

    if (
      !sameType(leftType, rightType) &&
      leftType.kind !== "unknown" &&
      rightType.kind !== "unknown"
    ) {
      this.diagnostics.push(
        error(
          `Operator '${operator}' requires compatible operands, got '${formatType(leftType)}' and '${formatType(
            rightType,
          )}'.`,
          span,
        ),
      );
    }

    return primitiveType("boolean");
  }

  private inferCallExpression(
    expression: Extract<Expression, { kind: "CallExpression" }>,
    scope: Scope,
  ): ValueType {
    const calleeType = this.inferExpression(expression.callee, scope);

    if (calleeType.kind === "unknown") {
      for (const arg of expression.args) {
        this.inferExpression(arg, scope);
      }
      return unknownType();
    }

    if (calleeType.kind !== "function") {
      this.diagnostics.push(
        error(`Cannot call value of type '${formatType(calleeType)}'.`, expression.callee.span),
      );
      return unknownType();
    }

    if (expression.args.length !== calleeType.params.length) {
      this.diagnostics.push(
        error(
          `Expected ${calleeType.params.length} argument(s), got ${expression.args.length}.`,
          expression.span,
        ),
      );
    }

    const count = Math.min(expression.args.length, calleeType.params.length);
    for (let index = 0; index < count; index += 1) {
      const arg = expression.args[index];
      const expected = calleeType.params[index];

      if (arg === undefined || expected === undefined) {
        continue;
      }

      this.expectType(this.inferExpression(arg, scope), primitiveType(expected), arg.span);
    }

    for (let index = count; index < expression.args.length; index += 1) {
      const arg = expression.args[index];
      if (arg !== undefined) {
        this.inferExpression(arg, scope);
      }
    }

    return primitiveType(calleeType.returnType);
  }

  private expectType(actual: ValueType, expected: ValueType, span: Span): void {
    if (actual.kind === "unknown" || expected.kind === "unknown" || sameType(actual, expected)) {
      return;
    }

    this.diagnostics.push(
      error(`Expected '${formatType(expected)}', got '${formatType(actual)}'.`, span),
    );
  }
}

function primitiveType(name: PrimitiveType): ValueType {
  return { kind: "primitive", name };
}

function unknownType(): ValueType {
  return { kind: "unknown" };
}

function sameType(left: ValueType, right: ValueType): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case "primitive":
      return right.kind === "primitive" && left.name === right.name;
    case "function":
      return left === right;
    case "unknown":
      return true;
  }
}

function formatType(type: ValueType): string {
  switch (type.kind) {
    case "primitive":
      return type.name;
    case "function":
      return "function";
    case "unknown":
      return "unknown";
  }
}

function isArithmeticOperator(operator: BinaryOperator): boolean {
  return (
    operator === "+" || operator === "-" || operator === "*" || operator === "/" || operator === "%"
  );
}
