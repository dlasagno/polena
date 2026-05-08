import type {
  AssignmentOperator,
  AssignmentStatement,
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
  readonly assignability: "mutable-variable" | "immutable-binding";
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
        case "AssignmentStatement":
          this.checkAssignmentStatement(declaration, scope);
          break;
        case "ExpressionStatement":
          this.inferExpression(declaration.expression, scope, { ifAsValue: false });
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

    if (
      !scope.declare({
        name: declaration.name,
        type,
        span: declaration.nameSpan,
        assignability: "immutable-binding",
      })
    ) {
      this.diagnostics.push(
        error(`Duplicate top-level name '${declaration.name}'.`, declaration.nameSpan, {
          code: "PLN100",
          label: "this name is already defined",
        }),
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
      const finalType = this.inferExpression(declaration.body.finalExpression, scope, {
        ifAsValue: declaration.returnType.name !== "void",
        returnType: declaration.returnType.name,
      });
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
          {
            code: "PLN203",
            label: "this function can finish without returning a value",
          },
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
        this.checkVariableDeclaration(statement, scope, returnType);
        return false;
      case "AssignmentStatement":
        this.checkAssignmentStatement(statement, scope, returnType);
        return false;
      case "ExpressionStatement":
        this.inferExpression(statement.expression, scope, {
          ifAsValue: false,
          returnType,
        });
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
        assignability: "immutable-binding",
      })
    ) {
      this.diagnostics.push(
        error(`Duplicate parameter '${param.name}'.`, param.nameSpan, {
          code: "PLN101",
          label: "this parameter name is already used",
        }),
      );
    }
  }

  private checkVariableDeclaration(
    declaration: VariableDeclaration,
    scope: Scope,
    returnType?: PrimitiveType,
  ): void {
    const initializerType = this.inferExpression(declaration.initializer, scope, {
      ifAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
    });
    const declaredType =
      declaration.typeAnnotation === undefined
        ? initializerType
        : primitiveType(declaration.typeAnnotation.name);

    if (declaration.typeAnnotation !== undefined) {
      this.expectType(initializerType, declaredType, declaration.initializer.span);
    }

    if (
      !scope.declare({
        name: declaration.name,
        type: declaredType,
        span: declaration.nameSpan,
        assignability: declaration.mutability === "let" ? "mutable-variable" : "immutable-binding",
      })
    ) {
      this.diagnostics.push(
        error(`Duplicate name '${declaration.name}'.`, declaration.nameSpan, {
          code: "PLN100",
          label: "this name is already defined in this scope",
        }),
      );
    }
  }

  private checkAssignmentStatement(
    statement: AssignmentStatement,
    scope: Scope,
    returnType?: PrimitiveType,
  ): void {
    const symbol = scope.lookup(statement.name);
    const valueType = this.inferExpression(statement.value, scope, {
      ifAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
    });

    if (symbol === undefined) {
      this.diagnostics.push(
        error(`Unknown name '${statement.name}'.`, statement.nameSpan, {
          code: "PLN102",
          label: "no value with this name is in scope",
          notes: [
            {
              kind: "help",
              message: "declare it before assigning to it, or check for a spelling mistake",
            },
          ],
        }),
      );
      return;
    }

    if (symbol.assignability !== "mutable-variable") {
      this.diagnostics.push(
        error(`Cannot assign to '${statement.name}'.`, statement.nameSpan, {
          code: "PLN206",
          label: "this binding is not mutable",
          notes: [{ kind: "help", message: "only 'let' bindings may be reassigned" }],
        }),
      );
      return;
    }

    if (isCompoundAssignmentOperator(statement.operator)) {
      this.expectType(symbol.type, primitiveType("number"), statement.nameSpan);
      this.expectType(valueType, primitiveType("number"), statement.value.span);
      return;
    }

    this.expectType(valueType, symbol.type, statement.value.span);
  }

  private checkReturnStatement(
    statement: ReturnStatement,
    scope: Scope,
    returnType: PrimitiveType,
  ): void {
    const actualType = this.inferExpression(statement.expression, scope, {
      ifAsValue: true,
      returnType,
    });
    this.expectType(actualType, primitiveType(returnType), statement.expression.span);
  }

  private inferExpression(
    expression: Expression,
    scope: Scope,
    options: {
      readonly ifAsValue: boolean;
      readonly returnType?: PrimitiveType;
    } = { ifAsValue: true },
  ): ValueType {
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
          this.diagnostics.push(
            error(`Unknown name '${expression.name}'.`, expression.span, {
              code: "PLN102",
              label: "no value with this name is in scope",
              notes: [
                {
                  kind: "help",
                  message: "declare it before using it, or check for a spelling mistake",
                },
              ],
            }),
          );
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
          options,
        );
      case "BinaryExpression":
        return this.inferBinaryExpression(
          expression.operator,
          expression.left,
          expression.right,
          expression.span,
          scope,
          options,
        );
      case "IfExpression":
        return this.inferIfExpression(expression, scope, options);
      case "CallExpression":
        return this.inferCallExpression(expression, scope, options);
    }
  }

  private inferUnaryExpression(
    operator: "!" | "-",
    operand: Expression,
    span: Span,
    scope: Scope,
    options: {
      readonly ifAsValue: boolean;
      readonly returnType?: PrimitiveType;
    },
  ): ValueType {
    const operandType = this.inferExpression(operand, scope, options);

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
    options: {
      readonly ifAsValue: boolean;
      readonly returnType?: PrimitiveType;
    },
  ): ValueType {
    const leftType = this.inferExpression(left, scope, options);
    const rightType = this.inferExpression(right, scope, options);

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
          {
            code: "PLN204",
            label: "these operands do not have compatible types",
          },
        ),
      );
    }

    return primitiveType("boolean");
  }

  private inferIfExpression(
    expression: Extract<Expression, { kind: "IfExpression" }>,
    scope: Scope,
    options: {
      readonly ifAsValue: boolean;
      readonly returnType?: PrimitiveType;
    },
  ): ValueType {
    const conditionType = this.inferExpression(expression.condition, scope, {
      ifAsValue: true,
      ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
    });
    this.expectType(conditionType, primitiveType("boolean"), expression.condition.span);

    const thenType = this.inferBlockType(expression.thenBlock, scope, options);

    if (expression.elseBlock === undefined) {
      if (options.ifAsValue) {
        this.diagnostics.push(
          error("If expression used as a value must have an else branch.", expression.span, {
            code: "PLN205",
            label: "this if expression can finish without producing a value",
            notes: [
              { kind: "help", message: "add an else branch that produces a compatible value" },
            ],
          }),
        );
      }

      return primitiveType("void");
    }

    const elseType = this.inferBlockType(expression.elseBlock, scope, options);

    if (!options.ifAsValue) {
      return primitiveType("void");
    }

    this.expectType(elseType, thenType, expression.elseBlock.span);
    return thenType.kind === "unknown" ? elseType : thenType;
  }

  private inferBlockType(
    block: Block,
    parentScope: Scope,
    options: {
      readonly ifAsValue: boolean;
      readonly returnType?: PrimitiveType;
    },
  ): ValueType {
    const scope = new Scope(parentScope);
    const returnType = options.returnType ?? "void";

    this.checkBlock(block, scope, returnType);

    if (block.finalExpression === undefined) {
      return primitiveType("void");
    }

    return this.inferExpression(block.finalExpression, scope, options);
  }

  private inferCallExpression(
    expression: Extract<Expression, { kind: "CallExpression" }>,
    scope: Scope,
    options: {
      readonly ifAsValue: boolean;
      readonly returnType?: PrimitiveType;
    },
  ): ValueType {
    const calleeType = this.inferExpression(expression.callee, scope);

    if (calleeType.kind === "unknown") {
      for (const arg of expression.args) {
        this.inferExpression(arg, scope, options);
      }
      return unknownType();
    }

    if (calleeType.kind !== "function") {
      this.diagnostics.push(
        error(`Cannot call value of type '${formatType(calleeType)}'.`, expression.callee.span, {
          code: "PLN200",
          label: "this value is not callable",
        }),
      );
      return unknownType();
    }

    if (expression.args.length !== calleeType.params.length) {
      this.diagnostics.push(
        error(
          `Expected ${calleeType.params.length} argument(s), got ${expression.args.length}.`,
          expression.span,
          {
            code: "PLN201",
            label: "wrong number of arguments in this call",
          },
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

      this.expectType(this.inferExpression(arg, scope, options), primitiveType(expected), arg.span);
    }

    for (let index = count; index < expression.args.length; index += 1) {
      const arg = expression.args[index];
      if (arg !== undefined) {
        this.inferExpression(arg, scope, options);
      }
    }

    return primitiveType(calleeType.returnType);
  }

  private expectType(actual: ValueType, expected: ValueType, span: Span): void {
    if (actual.kind === "unknown" || expected.kind === "unknown" || sameType(actual, expected)) {
      return;
    }

    this.diagnostics.push(
      error(`Expected '${formatType(expected)}', got '${formatType(actual)}'.`, span, {
        code: "PLN202",
        label: `expected '${formatType(expected)}' here`,
        notes: [
          {
            kind: "help",
            message: "make this expression produce the expected type explicitly",
          },
        ],
      }),
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

function isCompoundAssignmentOperator(operator: AssignmentOperator): boolean {
  return operator !== "=";
}
