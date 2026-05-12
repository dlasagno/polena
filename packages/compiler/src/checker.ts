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
  Program,
  ReturnStatement,
  Statement,
  TypeDeclaration,
  TypeNode,
  VariableDeclaration,
  WhileExpression,
} from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import { preludeFunctions } from "./prelude";
import { Scope, type SymbolInfo } from "./symbols";
import type { Span } from "./span";
import {
  arrayType,
  formatType,
  functionType,
  inferArithmeticType,
  isAssignableTo,
  isEqualityComparableType,
  isNumericType,
  isOrderingComparableType,
  objectType,
  preferredArithmeticType,
  primitiveType,
  sameType,
  type ObjectTypeField as SemanticObjectTypeField,
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
  readonly returnType?: Type;
  readonly loopContext?: LoopContext;
  readonly expectedType?: Type;
};

type TypeSymbol = {
  readonly name: string;
  readonly value: TypeNode;
  readonly span: Span;
};

export function check(program: Program): CheckResult {
  const checker = new Checker();
  return checker.check(program);
}

class Checker {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly typeSymbols = new Map<string, TypeSymbol>();
  private readonly resolvedTypeSymbols = new Map<string, Type>();
  private readonly resolvingTypeSymbols = new Set<string>();

  public check(program: Program): CheckResult {
    const scope = new Scope();
    this.declarePrelude(scope, program.span);

    for (const declaration of program.declarations) {
      if (declaration.kind !== "TypeDeclaration") {
        continue;
      }

      this.declareType(declaration);
    }

    for (const declaration of program.declarations) {
      if (declaration.kind !== "TypeDeclaration") {
        continue;
      }

      this.resolveTypeDeclaration(declaration);
    }

    for (const declaration of program.declarations) {
      if (declaration.kind !== "FunctionDeclaration") {
        continue;
      }

      this.declareFunction(scope, declaration);
    }

    for (const declaration of program.declarations) {
      switch (declaration.kind) {
        case "TypeDeclaration":
          break;
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

  private declareType(declaration: TypeDeclaration): void {
    if (this.typeSymbols.has(declaration.name)) {
      this.diagnostics.push(
        error(`Duplicate type name '${declaration.name}'.`, declaration.nameSpan, {
          code: DiagnosticCode.DuplicateName,
          label: "this type name is already defined",
        }),
      );
      return;
    }

    this.typeSymbols.set(declaration.name, {
      name: declaration.name,
      value: declaration.value,
      span: declaration.nameSpan,
    });
  }

  private resolveTypeDeclaration(declaration: TypeDeclaration): Type {
    return this.resolveNamedType(declaration.name, declaration.nameSpan);
  }

  private resolveNamedType(name: string, span: Span): Type {
    const resolved = this.resolvedTypeSymbols.get(name);
    if (resolved !== undefined) {
      return resolved;
    }

    const symbol = this.typeSymbols.get(name);
    if (symbol === undefined) {
      this.diagnostics.push(
        error(`Unknown type '${name}'.`, span, {
          code: DiagnosticCode.UnknownType,
          label: "no type with this name is in scope",
          notes: [{ kind: "help", message: "declare it with 'type' before using it" }],
        }),
      );
      return unknownType();
    }

    if (this.resolvingTypeSymbols.has(name)) {
      this.diagnostics.push(
        error(`Recursive type alias '${name}'.`, span, {
          code: DiagnosticCode.RecursiveTypeAlias,
          label: "this type alias refers to itself",
        }),
      );
      return unknownType();
    }

    this.resolvingTypeSymbols.add(name);
    const type = this.typeFromNode(symbol.value);
    this.resolvingTypeSymbols.delete(name);
    this.resolvedTypeSymbols.set(name, type);
    return type;
  }

  private typeFromNode(typeNode: TypeNode): Type {
    switch (typeNode.kind) {
      case "PrimitiveType":
        return primitiveType(typeNode.name);
      case "ArrayType":
        return arrayType(this.typeFromNode(typeNode.element));
      case "ObjectType":
        return this.typeFromObjectTypeNode(typeNode);
      case "NamedType":
        return this.resolveNamedType(typeNode.name, typeNode.nameSpan);
      case "UnknownType":
        return unknownType();
    }
  }

  private typeFromObjectTypeNode(
    typeNode: Extract<TypeNode, { readonly kind: "ObjectType" }>,
  ): Type {
    const fields: SemanticObjectTypeField[] = [];
    const seenFields = new Set<string>();

    for (const field of typeNode.fields) {
      if (seenFields.has(field.name)) {
        this.diagnostics.push(
          error(`Duplicate object field '${field.name}'.`, field.nameSpan, {
            code: DiagnosticCode.DuplicateName,
            label: "this field is already defined in this object type",
          }),
        );
        continue;
      }

      seenFields.add(field.name);
      fields.push({
        name: field.name,
        nameSpan: field.nameSpan,
        type: this.typeFromNode(field.type),
        span: field.span,
      });
    }

    return objectType(fields);
  }

  private declareFunction(scope: Scope, declaration: FunctionDeclaration): void {
    const type = functionType(
      declaration.params.map((param) => this.typeFromNode(param.type)),
      this.typeFromNode(declaration.returnType),
    );

    this.declareName(
      scope,
      {
        name: declaration.name,
        type,
        span: declaration.nameSpan,
        assignability: "immutable-binding",
      },
      {
        duplicateMessage: `Duplicate top-level name '${declaration.name}'.`,
        duplicateLabel: "this name is already defined",
      },
    );
  }

  private checkFunction(declaration: FunctionDeclaration, parentScope: Scope): void {
    const scope = new Scope(parentScope);
    const returnType = this.typeFromNode(declaration.returnType);

    for (const param of declaration.params) {
      this.declareParameter(scope, param);
    }

    if (declaration.body.isMissing === true) {
      return;
    }

    const explicitReturns = this.checkBlock(declaration.body, scope, returnType);
    if (declaration.body.finalExpression !== undefined) {
      const finalType = this.inferExpression(declaration.body.finalExpression, scope, {
        ifAsValue: !sameType(returnType, primitiveType("void")),
        whileAsValue: !sameType(returnType, primitiveType("void")),
        returnType,
        expectedType: returnType,
      });
      this.expectType(finalType, returnType, declaration.body.finalExpression.span);
      return;
    }

    if (!sameType(returnType, primitiveType("void")) && explicitReturns === 0) {
      this.diagnostics.push(
        error(
          `Function '${declaration.name}' must return '${formatType(returnType)}'.`,
          declaration.nameSpan,
          {
            code: DiagnosticCode.MissingReturn,
            label: "this function can finish without returning a value",
          },
        ),
      );
    }
  }

  private checkBlock(block: Block, scope: Scope, returnType: Type): number {
    return this.checkBlockInLoop(block, scope, returnType);
  }

  private checkBlockInLoop(
    block: Block,
    scope: Scope,
    returnType: Type,
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
    returnType: Type,
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
    this.declareName(
      scope,
      {
        name: param.name,
        type: this.typeFromNode(param.type),
        span: param.nameSpan,
        assignability: "immutable-binding",
      },
      {
        duplicateMessage: `Duplicate parameter '${param.name}'.`,
        duplicateLabel: "this parameter name is already used",
        duplicateCode: DiagnosticCode.DuplicateParameter,
      },
    );
  }

  private checkVariableDeclaration(
    declaration: VariableDeclaration,
    scope: Scope,
    returnType?: Type,
  ): void {
    const declaredType =
      declaration.typeAnnotation === undefined
        ? undefined
        : this.typeFromNode(declaration.typeAnnotation);
    const initializerType = this.inferExpression(declaration.initializer, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
      ...(declaredType === undefined ? {} : { expectedType: declaredType }),
    });
    const bindingType = declaredType ?? initializerType;

    if (
      declaration.typeAnnotation !== undefined &&
      !isContextuallyCheckedObjectLiteral(declaration.initializer, bindingType)
    ) {
      this.expectType(initializerType, bindingType, declaration.initializer.span);
    }

    this.declareName(
      scope,
      {
        name: declaration.name,
        type: bindingType,
        span: declaration.nameSpan,
        assignability: declaration.mutability === "let" ? "mutable-variable" : "immutable-binding",
      },
      {
        duplicateMessage: `Duplicate name '${declaration.name}'.`,
        duplicateLabel: "this name is already defined in this scope",
      },
    );
  }

  private declareName(
    scope: Scope,
    symbol: SymbolInfo,
    messages: {
      readonly duplicateMessage: string;
      readonly duplicateLabel: string;
      readonly duplicateCode?: string;
    },
  ): void {
    if (scope.lookupLocal(symbol.name) !== undefined) {
      this.diagnostics.push(
        error(messages.duplicateMessage, symbol.span, {
          code: messages.duplicateCode ?? DiagnosticCode.DuplicateName,
          label: messages.duplicateLabel,
        }),
      );
      return;
    }

    if (scope.lookupParent(symbol.name) !== undefined) {
      this.diagnostics.push(
        error(`Name '${symbol.name}' shadows an existing name.`, symbol.span, {
          code: DiagnosticCode.DuplicateName,
          label: "this name is already defined in an outer scope",
        }),
      );
      return;
    }

    scope.declare(symbol);
  }

  private checkAssignmentStatement(
    statement: AssignmentStatement,
    scope: Scope,
    returnType?: Type,
  ): void {
    if (statement.target.kind === "MemberExpression") {
      this.checkMemberAssignment(
        statement.target,
        statement.operator,
        statement.value,
        scope,
        returnType,
      );
      return;
    }

    if (statement.target.kind === "IndexExpression") {
      this.checkIndexAssignment(
        statement.target,
        statement.operator,
        statement.value,
        scope,
        returnType,
      );
      return;
    }

    const symbol = scope.lookup(statement.target.name);
    const valueType = this.inferExpression(statement.value, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
      ...(symbol === undefined ? {} : { expectedType: symbol.type }),
    });

    if (symbol === undefined) {
      this.diagnostics.push(
        error(`Unknown name '${statement.target.name}'.`, statement.target.span, {
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
        error(`Cannot assign to '${statement.target.name}'.`, statement.target.span, {
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

      this.expectType(symbol.type, primitiveType("number"), statement.target.span);
      this.expectType(valueType, primitiveType("number"), statement.value.span);
      return;
    }

    this.expectType(valueType, symbol.type, statement.value.span);
  }

  private checkMemberAssignment(
    target: Extract<Expression, { readonly kind: "MemberExpression" }>,
    operator: AssignmentOperator,
    value: Expression,
    scope: Scope,
    returnType?: Type,
  ): void {
    const targetType = this.inferExpression(target.target, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
    });

    if (targetType.kind === "unknown") {
      this.inferExpression(value, scope, {
        ifAsValue: true,
        whileAsValue: true,
        ...(returnType === undefined ? {} : { returnType }),
      });
      return;
    }

    if (targetType.kind !== "object") {
      this.diagnostics.push(
        error(
          `Unknown property '${target.name}' on type '${formatType(targetType)}'.`,
          target.nameSpan,
          {
            code: DiagnosticCode.UnknownProperty,
            label: "this property is not available",
          },
        ),
      );
      this.inferExpression(value, scope, {
        ifAsValue: true,
        whileAsValue: true,
        ...(returnType === undefined ? {} : { returnType }),
      });
      return;
    }

    const field = targetType.fields.find((candidate) => candidate.name === target.name);
    if (field === undefined) {
      this.diagnostics.push(
        error(
          `Unknown property '${target.name}' on type '${formatType(targetType)}'.`,
          target.nameSpan,
          {
            code: DiagnosticCode.UnknownProperty,
            label: "this property is not available",
          },
        ),
      );
      this.inferExpression(value, scope, {
        ifAsValue: true,
        whileAsValue: true,
        ...(returnType === undefined ? {} : { returnType }),
      });
      return;
    }

    const valueType = this.inferExpression(value, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
      expectedType: field.type,
    });
    this.expectAssignmentValueType(field.type, valueType, operator, target.nameSpan, value.span);
  }

  private checkIndexAssignment(
    target: Extract<Expression, { readonly kind: "IndexExpression" }>,
    operator: AssignmentOperator,
    value: Expression,
    scope: Scope,
    returnType?: Type,
  ): void {
    const targetType = this.inferExpression(target.target, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
    });
    const indexType = this.inferExpression(target.index, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
      expectedType: primitiveType("number"),
    });
    this.expectType(indexType, primitiveType("number"), target.index.span);

    if (targetType.kind === "unknown") {
      this.inferExpression(value, scope, {
        ifAsValue: true,
        whileAsValue: true,
        ...(returnType === undefined ? {} : { returnType }),
      });
      return;
    }

    if (targetType.kind !== "array") {
      this.diagnostics.push(
        error(`Cannot index value of type '${formatType(targetType)}'.`, target.target.span, {
          code: DiagnosticCode.CannotIndexNonArray,
          label: "this value is not an array",
        }),
      );
      this.inferExpression(value, scope, {
        ifAsValue: true,
        whileAsValue: true,
        ...(returnType === undefined ? {} : { returnType }),
      });
      return;
    }

    const valueType = this.inferExpression(value, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(returnType === undefined ? {} : { returnType }),
      expectedType: targetType.element,
    });
    this.expectAssignmentValueType(
      targetType.element,
      valueType,
      operator,
      target.target.span,
      value.span,
    );
  }

  private expectAssignmentValueType(
    targetType: Type,
    valueType: Type,
    operator: AssignmentOperator,
    targetSpan: Span,
    valueSpan: Span,
  ): void {
    if (!isCompoundAssignmentOperator(operator)) {
      this.expectType(valueType, targetType, valueSpan);
      return;
    }

    if (isNumericType(targetType)) {
      this.expectType(valueType, targetType, valueSpan);
      return;
    }

    this.expectType(targetType, primitiveType("number"), targetSpan);
    this.expectType(valueType, primitiveType("number"), valueSpan);
  }

  private checkReturnStatement(statement: ReturnStatement, scope: Scope, returnType: Type): void {
    const actualType = this.inferExpression(statement.expression, scope, {
      ifAsValue: true,
      whileAsValue: true,
      returnType,
      expectedType: returnType,
    });
    this.expectType(actualType, returnType, statement.expression.span);
  }

  private checkBreakStatement(
    statement: BreakStatement,
    scope: Scope,
    returnType?: Type,
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
      case "ArrayLiteral":
        return this.inferArrayLiteral(expression, scope, options);
      case "ObjectLiteral":
        return this.inferObjectLiteral(expression, scope, options);
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
      case "IndexExpression":
        return this.inferIndexExpression(expression, scope, options);
      case "MemberExpression":
        return this.inferMemberExpression(expression, scope, options);
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

  private inferArrayLiteral(
    expression: Extract<Expression, { kind: "ArrayLiteral" }>,
    scope: Scope,
    options: InferOptions,
  ): Type {
    if (expression.elements.length === 0) {
      if (options.expectedType?.kind === "array") {
        return options.expectedType;
      }

      this.diagnostics.push(
        error("Cannot infer the element type of an empty array.", expression.span, {
          code: DiagnosticCode.CannotInferArrayElementType,
          label: "add a type annotation for this empty array",
          notes: [
            {
              kind: "help",
              message: "write a type annotation such as 'const values: []number = [];'",
            },
          ],
        }),
      );
      return arrayType(unknownType());
    }

    let elementType: Type | undefined;
    for (const element of expression.elements) {
      const actualType = this.inferExpression(element, scope, {
        ...options,
        expectedType:
          options.expectedType?.kind === "array" ? options.expectedType.element : undefined,
      });

      if (elementType === undefined || elementType.kind === "unknown") {
        elementType = actualType;
        continue;
      }

      this.expectType(actualType, elementType, element.span);
    }

    return arrayType(elementType ?? unknownType());
  }

  private inferObjectLiteral(
    expression: Extract<Expression, { kind: "ObjectLiteral" }>,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const expectedFields =
      options.expectedType?.kind === "object" ? options.expectedType.fields : undefined;
    const fields: SemanticObjectTypeField[] = [];
    const seenFields = new Set<string>();

    for (const field of expression.fields) {
      if (seenFields.has(field.name)) {
        this.diagnostics.push(
          error(`Duplicate object field '${field.name}'.`, field.nameSpan, {
            code: DiagnosticCode.DuplicateName,
            label: "this field is already defined in this object literal",
          }),
        );
        continue;
      }

      seenFields.add(field.name);
      const expectedField = expectedFields?.find((candidate) => candidate.name === field.name);
      if (expectedFields !== undefined && expectedField === undefined) {
        this.diagnostics.push(
          error(`Unknown object field '${field.name}'.`, field.nameSpan, {
            code: DiagnosticCode.UnknownProperty,
            label: "this field is not part of the expected object type",
          }),
        );
      }

      const fieldType = this.inferExpression(field.value, scope, {
        ...options,
        expectedType: expectedField?.type,
      });

      if (expectedField !== undefined) {
        this.expectType(fieldType, expectedField.type, field.value.span);
      }

      fields.push({
        name: field.name,
        nameSpan: field.nameSpan,
        type: fieldType,
        span: field.span,
      });
    }

    if (expectedFields !== undefined) {
      for (const expectedField of expectedFields) {
        if (seenFields.has(expectedField.name)) {
          continue;
        }

        this.diagnostics.push(
          error(
            `Missing object field '${expectedField.name}'.`,
            expectedField.nameSpan ?? expression.span,
            {
              code: DiagnosticCode.TypeMismatch,
              label: "this object literal is missing a required field",
            },
          ),
        );
      }
    }

    return objectType(fields);
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

    if (operator === "==" || operator === "!=") {
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
      } else if (
        leftType.kind !== "unknown" &&
        rightType.kind !== "unknown" &&
        !isEqualityComparableType(leftType)
      ) {
        this.diagnostics.push(
          error(`Operator '${operator}' cannot compare '${formatType(leftType)}' values.`, span, {
            code: DiagnosticCode.IncompatibleOperands,
            label: "this type does not support equality comparison",
          }),
        );
      }
      return primitiveType("boolean");
    }

    if (isOrderingOperator(operator)) {
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
      } else if (
        leftType.kind !== "unknown" &&
        rightType.kind !== "unknown" &&
        !isOrderingComparableType(leftType)
      ) {
        this.diagnostics.push(
          error(`Operator '${operator}' cannot order '${formatType(leftType)}' values.`, span, {
            code: DiagnosticCode.IncompatibleOperands,
            label: "this type does not support ordering comparison",
          }),
        );
      }
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
    if (block.isMissing === true) {
      return unknownType();
    }

    const scope = new Scope(parentScope);
    const returnType = options.returnType ?? primitiveType("void");

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

  private inferIndexExpression(
    expression: Extract<Expression, { kind: "IndexExpression" }>,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const targetType = this.inferExpression(expression.target, scope, options);
    const indexType = this.inferExpression(expression.index, scope, {
      ...options,
      expectedType: primitiveType("number"),
    });
    this.expectType(indexType, primitiveType("number"), expression.index.span);

    if (targetType.kind === "unknown") {
      return unknownType();
    }

    if (targetType.kind !== "array") {
      this.diagnostics.push(
        error(`Cannot index value of type '${formatType(targetType)}'.`, expression.target.span, {
          code: DiagnosticCode.CannotIndexNonArray,
          label: "this value is not an array",
        }),
      );
      return unknownType();
    }

    return targetType.element;
  }

  private inferMemberExpression(
    expression: Extract<Expression, { kind: "MemberExpression" }>,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const targetType = this.inferExpression(expression.target, scope, options);
    if (targetType.kind === "unknown") {
      return unknownType();
    }

    if (expression.name === "length" && targetType.kind === "array") {
      return primitiveType("number");
    }

    if (targetType.kind === "object") {
      const field = targetType.fields.find((candidate) => candidate.name === expression.name);
      if (field !== undefined) {
        return field.type;
      }
    }

    this.diagnostics.push(
      error(
        `Unknown property '${expression.name}' on type '${formatType(targetType)}'.`,
        expression.nameSpan,
        {
          code: DiagnosticCode.UnknownProperty,
          label: "this property is not available",
        },
      ),
    );
    return unknownType();
  }

  private checkIgnoredBlock(block: Block, parentScope: Scope, options: InferOptions): void {
    if (block.isMissing === true) {
      return;
    }

    const scope = new Scope(parentScope);
    const returnType = options.returnType ?? primitiveType("void");
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
    if (isAssignableTo(actual, expected)) {
      return;
    }

    const objectMismatch = objectAssignabilityMismatch(actual, expected);
    if (objectMismatch !== undefined) {
      this.diagnostics.push(
        error(objectMismatch.message, objectMismatch.span ?? span, {
          code: DiagnosticCode.TypeMismatch,
          label: objectMismatch.label,
          notes: [
            {
              kind: "help",
              message: "provide the required object shape explicitly",
            },
          ],
        }),
      );
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

function isContextuallyCheckedObjectLiteral(expression: Expression, expectedType: Type): boolean {
  return expression.kind === "ObjectLiteral" && expectedType.kind === "object";
}

type ObjectAssignabilityMismatch = {
  readonly message: string;
  readonly label: string;
  readonly span?: Span;
};

function objectAssignabilityMismatch(
  actual: Type,
  expected: Type,
  path = "",
): ObjectAssignabilityMismatch | undefined {
  if (actual.kind !== "object" || expected.kind !== "object") {
    return undefined;
  }

  for (const expectedField of expected.fields) {
    const fieldPath = path === "" ? expectedField.name : `${path}.${expectedField.name}`;
    const actualField = actual.fields.find((field) => field.name === expectedField.name);
    if (actualField === undefined) {
      return {
        message: `Missing object field '${fieldPath}'.`,
        label: "this object value is missing a required field",
        ...(expectedField.nameSpan === undefined ? {} : { span: expectedField.nameSpan }),
      };
    }

    const nestedMismatch = objectAssignabilityMismatch(
      actualField.type,
      expectedField.type,
      fieldPath,
    );
    if (nestedMismatch !== undefined) {
      return nestedMismatch;
    }

    if (!isAssignableTo(actualField.type, expectedField.type)) {
      return {
        message: `Object field '${fieldPath}' has type '${formatType(
          actualField.type,
        )}', expected '${formatType(expectedField.type)}'.`,
        label: "this object field has the wrong type",
        ...(actualField.nameSpan === undefined ? {} : { span: actualField.nameSpan }),
      };
    }
  }

  return undefined;
}

function isArithmeticOperator(operator: BinaryOperator): boolean {
  return (
    operator === "+" || operator === "-" || operator === "*" || operator === "/" || operator === "%"
  );
}

function isOrderingOperator(operator: BinaryOperator): boolean {
  return operator === ">" || operator === ">=" || operator === "<" || operator === "<=";
}

function isCompoundAssignmentOperator(operator: AssignmentOperator): boolean {
  return operator !== "=";
}
