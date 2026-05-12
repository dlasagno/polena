import type {
  AssignmentOperator,
  AssignmentStatement,
  BinaryOperator,
  Block,
  BreakStatement,
  ContinueStatement,
  EnumVariantExpression,
  Expression,
  FunctionDeclaration,
  IfExpression,
  LoopContinuation,
  MatchExpression,
  MatchPattern,
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
import {
  emptySemantics,
  type DefinitionKind,
  type ReferenceTarget,
  type Semantics,
} from "./semantics";
import { Scope, type SymbolInfo } from "./symbols";
import type { Span } from "./span";
import {
  arrayType,
  enumType,
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
  readonly semantics: Semantics;
};

type LoopContext = {
  readonly expectsValue: boolean;
  breakType?: Type;
  sawValueBreak: boolean;
};

type ControlFlowOutcome = {
  readonly canFallThrough: boolean;
  readonly canReturn: boolean;
  readonly canBreak: boolean;
  readonly canContinue: boolean;
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
  readonly definitionNodeId: number;
  readonly fullSpan: Span;
};

export function check(program: Program): CheckResult {
  const checker = new Checker();
  return checker.check(program);
}

function fallThroughOutcome(): ControlFlowOutcome {
  return {
    canFallThrough: true,
    canReturn: false,
    canBreak: false,
    canContinue: false,
  };
}

function returnOutcome(): ControlFlowOutcome {
  return {
    canFallThrough: false,
    canReturn: true,
    canBreak: false,
    canContinue: false,
  };
}

function breakOutcome(): ControlFlowOutcome {
  return {
    canFallThrough: false,
    canReturn: false,
    canBreak: true,
    canContinue: false,
  };
}

function continueOutcome(): ControlFlowOutcome {
  return {
    canFallThrough: false,
    canReturn: false,
    canBreak: false,
    canContinue: true,
  };
}

function sequenceControlFlow(
  before: ControlFlowOutcome,
  after: ControlFlowOutcome,
): ControlFlowOutcome {
  return {
    canFallThrough: before.canFallThrough && after.canFallThrough,
    canReturn: before.canReturn || (before.canFallThrough && after.canReturn),
    canBreak: before.canBreak || (before.canFallThrough && after.canBreak),
    canContinue: before.canContinue || (before.canFallThrough && after.canContinue),
  };
}

function unionControlFlow(left: ControlFlowOutcome, right: ControlFlowOutcome): ControlFlowOutcome {
  return {
    canFallThrough: left.canFallThrough || right.canFallThrough,
    canReturn: left.canReturn || right.canReturn,
    canBreak: left.canBreak || right.canBreak,
    canContinue: left.canContinue || right.canContinue,
  };
}

class Checker {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly semantics = emptySemantics();
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

    return { diagnostics: this.diagnostics, semantics: this.semantics };
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
      definitionNodeId: declaration.nodeId,
      fullSpan: declaration.span,
    });
    this.recordDefinition(
      "TypeAlias",
      declaration.nodeId,
      declaration.name,
      declaration.nameSpan,
      declaration.span,
    );
  }

  private resolveTypeDeclaration(declaration: TypeDeclaration): Type {
    return this.resolveNamedType(declaration.name, declaration.nameSpan);
  }

  private resolveNamedType(name: string, span: Span, referenceNodeId?: number): Type {
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

    if (referenceNodeId !== undefined) {
      this.recordReference(referenceNodeId, {
        kind: "TypeAlias",
        name,
        definitionNodeId: symbol.definitionNodeId,
        nameSpan: symbol.span,
        fullSpan: symbol.fullSpan,
      });
    }

    const resolved = this.resolvedTypeSymbols.get(name);
    if (resolved !== undefined) {
      return resolved;
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
    const type = this.typeFromNode(symbol.value, name);
    this.resolvingTypeSymbols.delete(name);
    this.resolvedTypeSymbols.set(name, type);
    return type;
  }

  private typeFromNode(typeNode: TypeNode, declaredName?: string): Type {
    switch (typeNode.kind) {
      case "PrimitiveType":
        return primitiveType(typeNode.name);
      case "ArrayType":
        return arrayType(this.typeFromNode(typeNode.element));
      case "ObjectType":
        return this.typeFromObjectTypeNode(typeNode);
      case "EnumType":
        return this.typeFromEnumTypeNode(typeNode, declaredName ?? "<anonymous enum>");
      case "NamedType":
        return this.resolveNamedType(typeNode.name, typeNode.nameSpan, typeNode.nodeId);
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
        nodeId: field.nodeId,
        nameSpan: field.nameSpan,
        type: this.typeFromNode(field.type),
        span: field.span,
      });
      this.recordDefinition("Field", field.nodeId, field.name, field.nameSpan, field.span);
    }

    return objectType(fields);
  }

  private typeFromEnumTypeNode(
    typeNode: Extract<TypeNode, { readonly kind: "EnumType" }>,
    name: string,
  ): Type {
    const variants = [];
    const seenVariants = new Set<string>();

    for (const variant of typeNode.variants) {
      if (seenVariants.has(variant.name)) {
        this.diagnostics.push(
          error(`Duplicate enum variant '${variant.name}'.`, variant.nameSpan, {
            code: DiagnosticCode.DuplicateName,
            label: "this variant is already defined in this enum",
          }),
        );
        continue;
      }

      seenVariants.add(variant.name);
      variants.push({
        name: variant.name,
        nodeId: variant.nodeId,
        nameSpan: variant.nameSpan,
        span: variant.span,
      });
      this.recordDefinition(
        "EnumVariant",
        variant.nodeId,
        `${name}.${variant.name}`,
        variant.nameSpan,
        variant.span,
      );
    }

    return enumType(name, variants);
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
        definitionNodeId: declaration.nodeId,
        fullSpan: declaration.span,
        assignability: "immutable-binding",
      },
      "Function",
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

    const bodyOutcome = this.checkBlock(declaration.body, scope, returnType);
    if (declaration.body.finalExpression !== undefined) {
      const finalOutcome = this.expressionControlFlow(declaration.body.finalExpression);
      if (!finalOutcome.canFallThrough) {
        this.inferExpression(declaration.body.finalExpression, scope, {
          ifAsValue: false,
          whileAsValue: false,
          returnType,
        });
        return;
      }

      const finalType = this.inferExpression(declaration.body.finalExpression, scope, {
        ifAsValue: !sameType(returnType, primitiveType("void")),
        whileAsValue: !sameType(returnType, primitiveType("void")),
        returnType,
        expectedType: returnType,
      });
      this.expectType(finalType, returnType, declaration.body.finalExpression.span);
      return;
    }

    if (!sameType(returnType, primitiveType("void")) && bodyOutcome.canFallThrough) {
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

  private checkBlock(block: Block, scope: Scope, returnType: Type): ControlFlowOutcome {
    return this.checkBlockInLoop(block, scope, returnType);
  }

  private checkBlockInLoop(
    block: Block,
    scope: Scope,
    returnType: Type,
    loopContext?: LoopContext,
  ): ControlFlowOutcome {
    let outcome = fallThroughOutcome();

    for (const statement of block.statements) {
      const statementOutcome = this.checkStatement(statement, scope, returnType, loopContext);
      outcome = sequenceControlFlow(outcome, statementOutcome);
    }

    return outcome;
  }

  private checkStatement(
    statement: Statement,
    scope: Scope,
    returnType: Type,
    loopContext?: LoopContext,
  ): ControlFlowOutcome {
    switch (statement.kind) {
      case "VariableDeclaration":
        this.checkVariableDeclaration(statement, scope, returnType);
        return fallThroughOutcome();
      case "AssignmentStatement":
        this.checkAssignmentStatement(statement, scope, returnType);
        return fallThroughOutcome();
      case "ExpressionStatement":
        this.inferExpression(statement.expression, scope, {
          ifAsValue: false,
          whileAsValue: false,
          returnType,
          ...(loopContext === undefined ? {} : { loopContext }),
        });
        return this.expressionControlFlow(statement.expression);
      case "ReturnStatement":
        this.checkReturnStatement(statement, scope, returnType);
        return returnOutcome();
      case "BreakStatement":
        this.checkBreakStatement(statement, scope, returnType, loopContext);
        return breakOutcome();
      case "ContinueStatement":
        this.checkContinueStatement(statement, scope, loopContext);
        return continueOutcome();
    }
  }

  private declareParameter(scope: Scope, param: Parameter): void {
    this.declareName(
      scope,
      {
        name: param.name,
        type: this.typeFromNode(param.type),
        span: param.nameSpan,
        definitionNodeId: param.nodeId,
        fullSpan: param.span,
        assignability: "immutable-binding",
      },
      "Local",
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
        definitionNodeId: declaration.nodeId,
        fullSpan: declaration.span,
        assignability: declaration.mutability === "let" ? "mutable-variable" : "immutable-binding",
      },
      "Local",
      {
        duplicateMessage: `Duplicate name '${declaration.name}'.`,
        duplicateLabel: "this name is already defined in this scope",
      },
    );
  }

  private declareName(
    scope: Scope,
    symbol: SymbolInfo,
    definitionKind: DefinitionKind,
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
    if (symbol.definitionNodeId !== undefined) {
      this.recordDefinition(
        definitionKind,
        symbol.definitionNodeId,
        symbol.name,
        symbol.span,
        symbol.fullSpan ?? symbol.span,
      );
    }
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

    this.recordReference(statement.target.nodeId, this.referenceTargetFromSymbol(symbol));

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

    this.recordFieldReference(target.nodeId, target.name, field);

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
    const type = this.inferExpressionType(expression, scope, options);
    this.semantics.expressionTypes.set(expression.nodeId, type);
    return type;
  }

  private inferExpressionType(expression: Expression, scope: Scope, options: InferOptions): Type {
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
      case "EnumVariantExpression":
        return this.inferEnumVariantExpression(expression, options.expectedType);
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
        this.recordReference(expression.nodeId, this.referenceTargetFromSymbol(symbol));
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
      case "MatchExpression":
        return this.inferMatchExpression(expression, scope, options);
    }
  }

  private inferEnumVariantExpression(
    expression: EnumVariantExpression,
    expectedType: Type | undefined,
  ): Type {
    if (expression.enumName !== undefined) {
      return this.resolveQualifiedEnumVariant(
        expression.enumName,
        expression.enumNameSpan ?? expression.span,
        expression.variantName,
        expression.variantNameSpan,
        expression.nodeId,
      );
    }

    if (expectedType === undefined || expectedType.kind === "unknown") {
      this.diagnostics.push(
        error(`Cannot infer enum type for '.${expression.variantName}'.`, expression.span, {
          code: DiagnosticCode.CannotInferEnumVariant,
          label: "this shorthand enum variant needs an expected enum type",
        }),
      );
      return unknownType();
    }

    if (expectedType.kind !== "enum") {
      this.diagnostics.push(
        error(`Expected an enum type for '.${expression.variantName}'.`, expression.span, {
          code: DiagnosticCode.TypeMismatch,
          label: `expected enum type, got '${formatType(expectedType)}'`,
        }),
      );
      return unknownType();
    }

    this.expectEnumVariant(expectedType, expression.variantName, expression.variantNameSpan);
    this.resolveShorthandEnumVariant(expression, expectedType.name);
    this.recordEnumVariantReference(expression.nodeId, expectedType, expression.variantName);
    return expectedType;
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

    if (operator === "++") {
      return this.inferConcatenationExpression(leftType, rightType, span);
    }

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

  private inferConcatenationExpression(leftType: Type, rightType: Type, span: Span): Type {
    if (
      leftType.kind === "primitive" &&
      leftType.name === "string" &&
      rightType.kind === "primitive" &&
      rightType.name === "string"
    ) {
      return primitiveType("string");
    }

    if (leftType.kind === "array" && rightType.kind === "array") {
      if (sameType(leftType.element, rightType.element)) {
        return leftType;
      }

      this.diagnostics.push(
        error(
          `Operator '++' requires compatible array element types, got '${formatType(
            leftType.element,
          )}' and '${formatType(rightType.element)}'.`,
          span,
          {
            code: DiagnosticCode.IncompatibleOperands,
            label: "these arrays do not have compatible element types",
          },
        ),
      );
      return arrayType(unknownType());
    }

    if (leftType.kind !== "unknown" && rightType.kind !== "unknown") {
      this.diagnostics.push(
        error(
          `Operator '++' requires string or array operands, got '${formatType(
            leftType,
          )}' and '${formatType(rightType)}'.`,
          span,
          {
            code: DiagnosticCode.IncompatibleOperands,
            label: "these operands cannot be concatenated",
          },
        ),
      );
    }

    return unknownType();
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

  private blockControlFlow(block: Block): ControlFlowOutcome {
    let outcome = fallThroughOutcome();

    for (const statement of block.statements) {
      outcome = sequenceControlFlow(outcome, this.statementControlFlow(statement));
    }

    if (block.finalExpression !== undefined) {
      outcome = sequenceControlFlow(outcome, this.expressionControlFlow(block.finalExpression));
    }

    return outcome;
  }

  private statementControlFlow(statement: Statement): ControlFlowOutcome {
    switch (statement.kind) {
      case "ReturnStatement":
        return returnOutcome();
      case "BreakStatement":
        return breakOutcome();
      case "ContinueStatement":
        return continueOutcome();
      case "ExpressionStatement":
        return this.expressionControlFlow(statement.expression);
      case "VariableDeclaration":
      case "AssignmentStatement":
        return fallThroughOutcome();
    }
  }

  private expressionControlFlow(expression: Expression): ControlFlowOutcome {
    switch (expression.kind) {
      case "IfExpression":
        if (expression.elseBlock === undefined) {
          return unionControlFlow(
            fallThroughOutcome(),
            this.blockControlFlow(expression.thenBlock),
          );
        }

        return unionControlFlow(
          this.blockControlFlow(expression.thenBlock),
          this.blockControlFlow(expression.elseBlock),
        );
      case "MatchExpression":
        if (expression.arms.length === 0) {
          return fallThroughOutcome();
        }

        return expression.arms
          .map((arm) => this.expressionControlFlow(arm.body))
          .reduce(unionControlFlow);
      case "NumberLiteral":
      case "BigIntLiteral":
      case "StringLiteral":
      case "BooleanLiteral":
      case "ArrayLiteral":
      case "ObjectLiteral":
      case "EnumVariantExpression":
      case "NameExpression":
      case "UnaryExpression":
      case "BinaryExpression":
      case "WhileExpression":
      case "CallExpression":
      case "IndexExpression":
      case "MemberExpression":
        return fallThroughOutcome();
    }
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

      this.expectType(
        this.inferExpression(arg, scope, {
          ...options,
          expectedType: expected,
        }),
        expected,
        arg.span,
      );
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
    if (expression.target.kind === "NameExpression") {
      const enumType = this.resolveEnumTypeByName(
        expression.target.name,
        expression.target.span,
        expression.target.nodeId,
      );
      if (enumType !== undefined) {
        if (this.expectEnumVariant(enumType, expression.name, expression.nameSpan)) {
          this.recordEnumVariantReference(expression.nodeId, enumType, expression.name);
        }
        return enumType;
      }
    }

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
        this.recordFieldReference(expression.nodeId, expression.name, field);
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

  private inferMatchExpression(
    expression: MatchExpression,
    scope: Scope,
    options: InferOptions,
  ): Type {
    const scrutineeType = this.inferExpression(expression.scrutinee, scope, {
      ifAsValue: true,
      whileAsValue: true,
      ...(options.returnType === undefined ? {} : { returnType: options.returnType }),
      ...(options.loopContext === undefined ? {} : { loopContext: options.loopContext }),
    });

    if (expression.arms.length === 0) {
      this.diagnostics.push(
        error("Match expression must have at least one arm.", expression.span, {
          code: DiagnosticCode.ParseExpectedToken,
          label: "add a match arm",
        }),
      );
      return unknownType();
    }

    const enumScrutinee = scrutineeType.kind === "enum" ? scrutineeType : undefined;
    if (scrutineeType.kind !== "unknown" && enumScrutinee === undefined) {
      this.diagnostics.push(
        error(
          `Cannot match on non-enum type '${formatType(scrutineeType)}'.`,
          expression.scrutinee.span,
          {
            code: DiagnosticCode.MatchScrutineeNotEnum,
            label: "match currently supports enum values only",
          },
        ),
      );
    }

    if (enumScrutinee !== undefined) {
      this.checkMatchPatterns(expression, enumScrutinee);
    }

    let resultType: Type | undefined;
    for (const arm of expression.arms) {
      const armType = this.inferExpression(arm.body, scope, {
        ...options,
        expectedType: options.expectedType ?? resultType,
      });

      if (resultType === undefined || resultType.kind === "unknown") {
        resultType = armType;
        continue;
      }

      this.expectType(armType, resultType, arm.body.span);
    }

    return resultType ?? unknownType();
  }

  private checkMatchPatterns(
    expression: MatchExpression,
    scrutineeType: Extract<Type, { kind: "enum" }>,
  ): void {
    const seenVariants = new Set<string>();
    let sawWildcard = false;

    for (const arm of expression.arms) {
      if (sawWildcard) {
        this.diagnostics.push(
          error("Unreachable match arm.", arm.pattern.span, {
            code: DiagnosticCode.UnreachableMatchArm,
            label: "a previous wildcard arm already matches this value",
          }),
        );
        continue;
      }

      if (arm.pattern.kind === "WildcardPattern") {
        sawWildcard = true;
        continue;
      }

      if (arm.pattern.enumName !== undefined && arm.pattern.enumName !== scrutineeType.name) {
        const patternEnum = this.resolveEnumTypeByName(
          arm.pattern.enumName,
          arm.pattern.enumNameSpan ?? arm.pattern.span,
          arm.pattern.nodeId,
        );
        if (patternEnum === undefined) {
          this.diagnostics.push(
            error(`Unknown enum type '${arm.pattern.enumName}'.`, arm.pattern.enumNameSpan, {
              code: DiagnosticCode.UnknownType,
              label: "no enum type with this name is in scope",
            }),
          );
          continue;
        }

        this.diagnostics.push(
          error(
            `Match pattern uses enum '${arm.pattern.enumName}', but scrutinee has type '${scrutineeType.name}'.`,
            arm.pattern.enumNameSpan ?? arm.pattern.span,
            {
              code: DiagnosticCode.TypeMismatch,
              label: "this enum does not match the matched value",
            },
          ),
        );
        continue;
      }

      if (
        !this.expectEnumVariant(scrutineeType, arm.pattern.variantName, arm.pattern.variantNameSpan)
      ) {
        continue;
      }

      this.resolveShorthandMatchPattern(arm.pattern, scrutineeType.name);
      this.recordEnumVariantReference(arm.pattern.nodeId, scrutineeType, arm.pattern.variantName);

      if (seenVariants.has(arm.pattern.variantName)) {
        this.diagnostics.push(
          error(`Duplicate match arm for '.${arm.pattern.variantName}'.`, arm.pattern.span, {
            code: DiagnosticCode.DuplicateMatchArm,
            label: "this variant was already matched earlier",
          }),
        );
        continue;
      }

      seenVariants.add(arm.pattern.variantName);
    }

    if (sawWildcard) {
      return;
    }

    const missingVariants = scrutineeType.variants
      .map((variant) => variant.name)
      .filter((variant) => !seenVariants.has(variant));

    if (missingVariants.length > 0) {
      this.diagnostics.push(
        error(
          `Non-exhaustive match; missing ${missingVariants.map((name) => `'.${name}'`).join(", ")}.`,
          expression.span,
          {
            code: DiagnosticCode.NonExhaustiveMatch,
            label: "this match does not cover every enum variant",
          },
        ),
      );
    }
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

  private resolveEnumTypeByName(
    name: string,
    span: Span,
    referenceNodeId?: number,
  ): Extract<Type, { readonly kind: "enum" }> | undefined {
    const symbol = this.typeSymbols.get(name);
    if (symbol === undefined) {
      return undefined;
    }

    const type = this.resolveNamedType(name, span, referenceNodeId);
    if (type.kind !== "enum") {
      return undefined;
    }

    return type;
  }

  private resolveQualifiedEnumVariant(
    enumName: string,
    enumNameSpan: Span,
    variantName: string,
    variantNameSpan: Span,
    referenceNodeId?: number,
  ): Type {
    const enumType = this.resolveEnumTypeByName(enumName, enumNameSpan);
    if (enumType === undefined) {
      this.diagnostics.push(
        error(`Unknown enum type '${enumName}'.`, enumNameSpan, {
          code: DiagnosticCode.UnknownType,
          label: "no enum type with this name is in scope",
        }),
      );
      return unknownType();
    }

    if (
      this.expectEnumVariant(enumType, variantName, variantNameSpan) &&
      referenceNodeId !== undefined
    ) {
      this.recordEnumVariantReference(referenceNodeId, enumType, variantName);
    }
    return enumType;
  }

  private expectEnumVariant(
    enumType: Extract<Type, { readonly kind: "enum" }>,
    variantName: string,
    variantNameSpan: Span,
  ): boolean {
    if (enumType.variants.some((variant) => variant.name === variantName)) {
      return true;
    }

    this.diagnostics.push(
      error(`Unknown enum variant '${enumType.name}.${variantName}'.`, variantNameSpan, {
        code: DiagnosticCode.UnknownEnumVariant,
        label: "this variant is not defined for the enum",
      }),
    );
    return false;
  }

  private resolveShorthandEnumVariant(expression: EnumVariantExpression, enumName: string): void {
    (expression as { resolvedEnumName?: string }).resolvedEnumName = enumName;
  }

  private resolveShorthandMatchPattern(
    pattern: Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>,
    enumName: string,
  ): void {
    (pattern as { resolvedEnumName?: string }).resolvedEnumName = enumName;
  }

  private recordDefinition(
    kind: DefinitionKind,
    nodeId: number,
    name: string,
    nameSpan: Span,
    fullSpan: Span,
  ): void {
    if (this.semantics.definitions.some((definition) => definition.nodeId === nodeId)) {
      return;
    }

    this.semantics.definitions.push({
      kind,
      nodeId,
      name,
      nameSpan,
      fullSpan,
    });
  }

  private recordReference(nodeId: number, target: ReferenceTarget): void {
    this.semantics.references.set(nodeId, target);
  }

  private referenceTargetFromSymbol(symbol: SymbolInfo): ReferenceTarget {
    if (symbol.definitionNodeId === undefined) {
      return { kind: "Prelude", name: symbol.name };
    }

    return {
      kind: symbol.type.kind === "function" ? "Function" : "Local",
      name: symbol.name,
      definitionNodeId: symbol.definitionNodeId,
      nameSpan: symbol.span,
      fullSpan: symbol.fullSpan ?? symbol.span,
    };
  }

  private recordFieldReference(nodeId: number, name: string, field: SemanticObjectTypeField): void {
    if (field.nodeId === undefined || field.nameSpan === undefined || field.span === undefined) {
      return;
    }

    this.recordReference(nodeId, {
      kind: "Field",
      name,
      definitionNodeId: field.nodeId,
      nameSpan: field.nameSpan,
      fullSpan: field.span,
    });
  }

  private recordEnumVariantReference(
    nodeId: number,
    enumType: Extract<Type, { readonly kind: "enum" }>,
    variantName: string,
  ): void {
    const variant = enumType.variants.find((candidate) => candidate.name === variantName);
    if (
      variant?.nodeId === undefined ||
      variant.nameSpan === undefined ||
      variant.span === undefined
    ) {
      return;
    }

    this.recordReference(nodeId, {
      kind: "EnumVariant",
      enumName: enumType.name,
      variantName,
      definitionNodeId: variant.nodeId,
      nameSpan: variant.nameSpan,
      fullSpan: variant.span,
    });
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
