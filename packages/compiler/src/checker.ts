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
  Parameter,
  PrimitiveType,
  Program,
  ReturnStatement,
  Statement,
  VariableDeclaration,
  WhileExpression,
} from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import { preludeFunctions } from "./prelude";
import { Scope } from "./symbols";
import type { Span } from "./span";
import {
  formatType,
  functionType,
  inferArithmeticType,
  isNumericType,
  preferredArithmeticType,
  primitiveType,
  sameType,
  type Type,
  unknownType,
} from "./types";

export type CheckResult = {
  readonly diagnostics: readonly Diagnostic[];
};

type LoopContext = {
  readonly expectsValue: boolean;
  breakType?: Type;
  sawValueBreak: boolean;
};

type InferOptions = {
  readonly ifAsValue: boolean;
  readonly whileAsValue: boolean;
  readonly returnType?: PrimitiveType;
  readonly loopContext?: LoopContext;
};

export function check(program: Program): CheckResult {
  const checker = new Checker();
  return checker.check(program);
}

class Checker {
  private readonly diagnostics: Diagnostic[] = [];

  public check(program: Program): CheckResult {
    const scope = new Scope();
    this.declarePrelude(scope, program.span);

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
        case "BreakStatement":
          this.checkBreakStatement(declaration, scope);
          break;
        case "ContinueStatement":
          this.checkContinueStatement(declaration, scope);
          break;
        case "ExpressionStatement":
          this.inferExpression(declaration.expression, scope, {
            ifAsValue: false,
            whileAsValue: false,
          });
          break;
      }
    }

    return { diagnostics: this.diagnostics };
  }

  private declarePrelude(scope: Scope, span: Span): void {
    for (const fn of preludeFunctions) {
      scope.declare({
        name: fn.name,
        type: functionType(
          fn.params.map((param) => primitiveType(param)),
          primitiveType(fn.returnType),
        ),
        span,
        assignability: "immutable-binding",
      });
    }
  }

  private declareFunction(scope: Scope, declaration: FunctionDeclaration): void {
    const type = functionType(
      declaration.params.map((param) => primitiveType(param.type.name)),
      primitiveType(declaration.returnType.name),
    );

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
          code: DiagnosticCode.DuplicateName,
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
        whileAsValue: declaration.returnType.name !== "void",
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
            code: DiagnosticCode.MissingReturn,
            label: "this function can finish without returning a value",
          },
        ),
      );
    }
  }

  private checkBlock(block: Block, scope: Scope, returnType: PrimitiveType): number {
    return this.checkBlockInLoop(block, scope, returnType);
  }

  private checkBlockInLoop(
    block: Block,
    scope: Scope,
    returnType: PrimitiveType,
    loopContext?: LoopContext,
  ): number {
    let explicitReturns = 0;

    for (const statement of block.statements) {
      if (this.checkStatement(statement, scope, returnType, loopContext)) {
        explicitReturns += 1;
      }
    }

    return explicitReturns;
  }

  private checkStatement(
    statement: Statement,
    scope: Scope,
    returnType: PrimitiveType,
    loopContext?: LoopContext,
  ): boolean {
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
          whileAsValue: false,
          returnType,
          ...(loopContext === undefined ? {} : { loopContext }),
        });
        return false;
      case "ReturnStatement":
        this.checkReturnStatement(statement, scope, returnType);
        return true;
      case "BreakStatement":
        this.checkBreakStatement(statement, scope, returnType, loopContext);
        return false;
      case "ContinueStatement":
        this.checkContinueStatement(statement, scope, loopContext);
        return false;
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
          code: DiagnosticCode.DuplicateParameter,
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
      whileAsValue: true,
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
          code: DiagnosticCode.DuplicateName,
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
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
    });

    if (symbol === undefined) {
      this.diagnostics.push(
        error(`Unknown name '${statement.name}'.`, statement.nameSpan, {
          code: DiagnosticCode.UnknownName,
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
          code: DiagnosticCode.CannotAssign,
          label: "this binding is not mutable",
          notes: [{ kind: "help", message: "only 'let' bindings may be reassigned" }],
        }),
      );
      return;
    }

    if (isCompoundAssignmentOperator(statement.operator)) {
      if (isNumericType(symbol.type)) {
        this.expectType(valueType, symbol.type, statement.value.span);
        return;
      }

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
      whileAsValue: true,
      returnType,
    });
    this.expectType(actualType, primitiveType(returnType), statement.expression.span);
  }

  private checkBreakStatement(
    statement: BreakStatement,
    scope: Scope,
    returnType?: PrimitiveType,
    loopContext?: LoopContext,
  ): void {
    if (loopContext === undefined) {
      this.diagnostics.push(
        error("Break statement must be inside a loop.", statement.span, {
          code: DiagnosticCode.BreakOutsideLoop,
          label: "this break does not have a loop to exit",
        }),
      );
      return;
    }

    if (statement.expression === undefined) {
      if (loopContext.expectsValue) {
        this.diagnostics.push(
          error("Value-producing while expressions must use 'break value;'.", statement.span, {
            code: DiagnosticCode.MissingBreakValue,
            label: "this loop needs a value when it breaks early",
            notes: [
              {
                kind: "help",
                message:
                  "supply a value to break with, or remove the while expression's value context",
              },
            ],
          }),
        );
      }
      return;
    }

    const valueType = this.inferExpression(statement.expression, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
    });

    if (!loopContext.expectsValue) {
      this.diagnostics.push(
        error(
          "Break with a value is only allowed inside value-producing while expressions.",
          statement.span,
          {
            code: DiagnosticCode.BreakValueInStatementLoop,
            label: "this loop does not produce a value",
            notes: [
              {
                kind: "help",
                message:
                  "use plain 'break;' here, or use the while loop in a value position with an else branch",
              },
            ],
          },
        ),
      );
      return;
    }

    this.recordLoopBreakType(loopContext, valueType, statement.expression.span);
  }

  private checkContinueStatement(
    statement: ContinueStatement,
    scope: Scope,
    loopContext?: LoopContext,
  ): void {
    void scope;

    if (loopContext !== undefined) {
      return;
    }

    this.diagnostics.push(
      error("Continue statement must be inside a loop.", statement.span, {
        code: DiagnosticCode.ContinueOutsideLoop,
        label: "this continue does not have a loop to continue",
      }),
    );
  }

  private inferExpression(
    expression: Expression,
    scope: Scope,
    options: InferOptions = { ifAsValue: true, whileAsValue: true },
  ): Type {
    switch (expression.kind) {
      case "NumberLiteral":
        return primitiveType("number");
      case "BigIntLiteral":
        return primitiveType("bigint");
      case "StringLiteral":
        return this.inferStringLiteral(expression, scope, options);
      case "BooleanLiteral":
        return primitiveType("boolean");
      case "NameExpression": {
        const symbol = scope.lookup(expression.name);
        if (symbol === undefined) {
          this.diagnostics.push(
            error(`Unknown name '${expression.name}'.`, expression.span, {
              code: DiagnosticCode.UnknownName,
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
      case "WhileExpression":
        return this.inferWhileExpression(expression, scope, options);
      case "CallExpression":
        return this.inferCallExpression(expression, scope, options);
    }
  }

  private inferUnaryExpression(
    operator: "!" | "-",
    operand: Expression,
    span: Span,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const operandType = this.inferExpression(operand, scope, options);

    switch (operator) {
      case "!":
        this.expectType(operandType, primitiveType("boolean"), span);
        return primitiveType("boolean");
      case "-":
        if (isNumericType(operandType)) {
          return operandType;
        }

        this.expectType(operandType, primitiveType("number"), span);
        return primitiveType("number");
    }
  }

  private inferStringLiteral(
    expression: Extract<Expression, { kind: "StringLiteral" }>,
    scope: Scope,
    options: InferOptions,
  ): Type {
    for (const part of expression.parts) {
      if (part.kind === "StringInterpolation") {
        this.inferExpression(part.expression, scope, options);
      }
    }

    return primitiveType("string");
  }

  private inferBinaryExpression(
    operator: BinaryOperator,
    left: Expression,
    right: Expression,
    span: Span,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const leftType = this.inferExpression(left, scope, options);
    const rightType = this.inferExpression(right, scope, options);

    if (isArithmeticOperator(operator)) {
      const arithmeticType = inferArithmeticType(leftType, rightType);
      if (arithmeticType !== undefined) {
        return arithmeticType;
      }

      if (isNumericType(leftType) && isNumericType(rightType)) {
        this.diagnostics.push(
          error(
            `Operator '${operator}' requires compatible operands, got '${formatType(leftType)}' and '${formatType(
              rightType,
            )}'.`,
            span,
            {
              code: DiagnosticCode.IncompatibleOperands,
              label: "these operands do not have compatible types",
            },
          ),
        );
        return unknownType();
      }

      const expectedNumericType = preferredArithmeticType(leftType, rightType);
      this.expectType(leftType, expectedNumericType, left.span);
      this.expectType(rightType, expectedNumericType, right.span);
      return expectedNumericType;
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
            code: DiagnosticCode.IncompatibleOperands,
            label: "these operands do not have compatible types",
          },
        ),
      );
    }

    return primitiveType("boolean");
  }

  private inferIfExpression(expression: IfExpression, scope: Scope, options: InferOptions): Type {
    const conditionType = this.inferExpression(expression.condition, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
      ...(options.loopContext === undefined ? {} : { loopContext: options.loopContext }),
    });
    this.expectType(conditionType, primitiveType("boolean"), expression.condition.span);

    const thenType = this.inferBlockType(expression.thenBlock, scope, options);

    if (expression.elseBlock === undefined) {
      if (options.ifAsValue) {
        this.diagnostics.push(
          error("If expression used as a value must have an else branch.", expression.span, {
            code: DiagnosticCode.MissingIfElseValue,
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

  private inferWhileExpression(
    expression: WhileExpression,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const conditionType = this.inferExpression(expression.condition, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
      ...(options.loopContext === undefined ? {} : { loopContext: options.loopContext }),
    });
    this.expectType(conditionType, primitiveType("boolean"), expression.condition.span);

    if (expression.continuation !== undefined) {
      this.checkLoopContinuation(expression.continuation, scope, options);
    }

    const loopContext: LoopContext = {
      expectsValue: options.whileAsValue,
      sawValueBreak: false,
    };
    this.checkIgnoredBlock(expression.body, scope, {
      ifAsValue: false,
      whileAsValue: false,
      ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
      loopContext,
    });

    if (!options.whileAsValue) {
      if (expression.elseBlock !== undefined) {
        this.checkIgnoredBlock(expression.elseBlock, scope, {
          ifAsValue: false,
          whileAsValue: false,
          ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
          ...(options.loopContext === undefined ? {} : { loopContext: options.loopContext }),
        });
      }

      return primitiveType("void");
    }

    if (expression.elseBlock === undefined) {
      this.diagnostics.push(
        error("While expression used as a value must have an else branch.", expression.span, {
          code: DiagnosticCode.MissingWhileElseValue,
          label: "this while expression can finish without producing a value",
          notes: [{ kind: "help", message: "add an else branch that produces a compatible value" }],
        }),
      );
      return loopContext.breakType ?? primitiveType("void");
    }

    const elseType = this.inferBlockType(expression.elseBlock, scope, options);
    if (!loopContext.sawValueBreak || loopContext.breakType === undefined) {
      return elseType;
    }

    this.expectType(elseType, loopContext.breakType, expression.elseBlock.span);
    return loopContext.breakType.kind === "unknown" ? elseType : loopContext.breakType;
  }

  private inferBlockType(block: Block, parentScope: Scope, options: InferOptions): Type {
    const scope = new Scope(parentScope);
    const returnType = options.returnType ?? "void";

    this.checkBlockInLoop(block, scope, returnType, options.loopContext);

    if (block.finalExpression === undefined) {
      return primitiveType("void");
    }

    return this.inferExpression(block.finalExpression, scope, options);
  }

  private inferCallExpression(
    expression: Extract<Expression, { kind: "CallExpression" }>,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const calleeType = this.inferExpression(expression.callee, scope, options);

    if (calleeType.kind === "unknown") {
      for (const arg of expression.args) {
        this.inferExpression(arg, scope, options);
      }
      return unknownType();
    }

    if (calleeType.kind !== "function") {
      this.diagnostics.push(
        error(`Cannot call value of type '${formatType(calleeType)}'.`, expression.callee.span, {
          code: DiagnosticCode.CannotCallNonFunction,
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
            code: DiagnosticCode.WrongArgumentCount,
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

      this.expectType(this.inferExpression(arg, scope, options), expected, arg.span);
    }

    for (let index = count; index < expression.args.length; index += 1) {
      const arg = expression.args[index];
      if (arg !== undefined) {
        this.inferExpression(arg, scope, options);
      }
    }

    return calleeType.returnType;
  }

  private checkIgnoredBlock(block: Block, parentScope: Scope, options: InferOptions): void {
    const scope = new Scope(parentScope);
    const returnType = options.returnType ?? "void";
    this.checkBlockInLoop(block, scope, returnType, options.loopContext);

    if (block.finalExpression !== undefined) {
      this.inferExpression(block.finalExpression, scope, {
        ifAsValue: false,
        whileAsValue: false,
        ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
        ...(options.loopContext === undefined ? {} : { loopContext: options.loopContext }),
      });
    }
  }

  private checkLoopContinuation(
    continuation: LoopContinuation,
    scope: Scope,
    options: InferOptions,
  ): void {
    if (continuation.kind === "AssignmentStatement") {
      this.checkAssignmentStatement(continuation, scope, options.returnType);
      return;
    }

    this.inferExpression(continuation, scope, {
      ifAsValue: false,
      whileAsValue: false,
      ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
      ...(options.loopContext === undefined ? {} : { loopContext: options.loopContext }),
    });
  }

  private recordLoopBreakType(loopContext: LoopContext, actualType: Type, span: Span): void {
    if (loopContext.breakType === undefined) {
      loopContext.breakType = actualType;
      loopContext.sawValueBreak = true;
      return;
    }

    loopContext.sawValueBreak = true;
    this.expectType(actualType, loopContext.breakType, span);
    if (loopContext.breakType.kind === "unknown" && actualType.kind !== "unknown") {
      loopContext.breakType = actualType;
    }
  }

  private expectType(actual: Type, expected: Type, span: Span): void {
    if (actual.kind === "unknown" || expected.kind === "unknown" || sameType(actual, expected)) {
      return;
    }

    this.diagnostics.push(
      error(`Expected '${formatType(expected)}', got '${formatType(actual)}'.`, span, {
        code: DiagnosticCode.TypeMismatch,
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

function isArithmeticOperator(operator: BinaryOperator): boolean {
  return (
    operator === "+" || operator === "-" || operator === "*" || operator === "/" || operator === "%"
  );
}

function isCompoundAssignmentOperator(operator: AssignmentOperator): boolean {
  return operator !== "=";
}
