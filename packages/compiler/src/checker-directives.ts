import type { DirectiveExpansion, DirectiveExpression, Expression, TypeNode } from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import type { Scope } from "./symbols";
import type { Span } from "./span";
import {
  arrayType,
  formatType,
  isRecoveryUnknownType,
  primitiveType,
  type Type,
  unknownType,
} from "./types";

export type DirectiveCheckContext = {
  readonly diagnostics: Diagnostic[];
  readonly allowTargetEscapes?: boolean;
  readonly typeFromNode: (typeNode: TypeNode) => Type;
  readonly typeFromNodeInActiveEnvironment: (typeNode: TypeNode) => Type;
  readonly inferExpression: (expression: Expression, scope: Scope) => Type;
  readonly resolveNamedType: (name: string, span: Span, typeArguments: readonly Type[]) => Type;
  readonly recordDirectiveExpansion: (
    expression: DirectiveExpression,
    expansion: DirectiveExpansion,
  ) => void;
};

export function inferCompilerDirectiveExpression(
  expression: DirectiveExpression,
  scope: Scope,
  context: DirectiveCheckContext,
): Type {
  switch (expression.name) {
    case "enumVariantNames":
      return inferEnumVariantNamesDirective(expression, context);
    case "enumValues":
      return inferEnumValuesDirective(expression, context);
    case "objectFieldNames":
      return inferObjectFieldNamesDirective(expression, context);
    case "target.js":
      return inferTargetJsDirective(expression, scope, context, "plain");
    case "target.js.option":
      return inferTargetJsDirective(expression, scope, context, "option");
    case "target.js.result":
      return inferTargetJsDirective(expression, scope, context, "result");
    default:
      context.diagnostics.push(
        error(`Unknown compiler directive '@${expression.name}'.`, expression.nameSpan, {
          code: DiagnosticCode.UnknownDirective,
          label: "no compiler directive with this name is available",
        }),
      );
      return unknownType();
  }
}

function inferEnumVariantNamesDirective(
  expression: DirectiveExpression,
  context: DirectiveCheckContext,
): Type {
  const type = directiveSingleTypeOperand(expression, context);
  if (type === undefined || isRecoveryUnknownType(type)) {
    return arrayType(primitiveType("string"));
  }

  if (type.kind !== "enum") {
    context.diagnostics.push(
      error(`Directive '@enumVariantNames' requires an enum type operand.`, expression.span, {
        code: DiagnosticCode.InvalidDirectiveOperand,
        label: `got '${formatType(type)}' instead`,
      }),
    );
    return arrayType(primitiveType("string"));
  }

  context.recordDirectiveExpansion(expression, {
    kind: "StringArray",
    values: type.variants.map((variant) => variant.name),
  });
  return arrayType(primitiveType("string"));
}

function inferEnumValuesDirective(
  expression: DirectiveExpression,
  context: DirectiveCheckContext,
): Type {
  const type = directiveSingleTypeOperand(expression, context);
  if (type === undefined || isRecoveryUnknownType(type)) {
    return arrayType(unknownType());
  }

  if (type.kind !== "enum") {
    context.diagnostics.push(
      error(`Directive '@enumValues' requires an enum type operand.`, expression.span, {
        code: DiagnosticCode.InvalidDirectiveOperand,
        label: `got '${formatType(type)}' instead`,
      }),
    );
    return arrayType(unknownType());
  }

  const payloadVariant = type.variants.find((variant) => variant.payload.length > 0);
  if (payloadVariant !== undefined) {
    context.diagnostics.push(
      error(
        `Directive '@enumValues' requires a fieldless enum type; '${type.name}.${payloadVariant.name}' has associated data.`,
        payloadVariant.nameSpan ?? expression.span,
        {
          code: DiagnosticCode.InvalidDirectiveOperand,
          label: "this variant cannot be enumerated as a single value",
        },
      ),
    );
    return arrayType(type);
  }

  context.recordDirectiveExpansion(expression, {
    kind: "EnumValueArray",
    enumName: type.name,
    variantNames: type.variants.map((variant) => variant.name),
  });
  return arrayType(type);
}

function inferObjectFieldNamesDirective(
  expression: DirectiveExpression,
  context: DirectiveCheckContext,
): Type {
  const type = directiveSingleTypeOperand(expression, context);
  if (type === undefined || isRecoveryUnknownType(type)) {
    return arrayType(primitiveType("string"));
  }

  if (type.kind !== "object") {
    context.diagnostics.push(
      error(`Directive '@objectFieldNames' requires an object type operand.`, expression.span, {
        code: DiagnosticCode.InvalidDirectiveOperand,
        label: `got '${formatType(type)}' instead`,
      }),
    );
    return arrayType(primitiveType("string"));
  }

  context.recordDirectiveExpansion(expression, {
    kind: "StringArray",
    values: type.fields.map((field) => field.name),
  });
  return arrayType(primitiveType("string"));
}

function inferTargetJsDirective(
  expression: DirectiveExpression,
  scope: Scope,
  context: DirectiveCheckContext,
  mode: "plain" | "option" | "result",
): Type {
  if (context.allowTargetEscapes === false) {
    context.diagnostics.push(
      error(
        `Target escape directive '@${expression.name}' requires an unsafe opt-in.`,
        expression.nameSpan,
        {
          code: DiagnosticCode.TargetEscapeRequiresOptIn,
          label: "add [unsafe] target_escapes = true to polena.toml",
        },
      ),
    );
    return unknownType();
  }

  const minimumOperands = mode === "result" ? 3 : 2;
  if (expression.operands.length < minimumOperands) {
    context.diagnostics.push(
      error(
        `Directive '@${expression.name}' expects at least ${minimumOperands} operands, got ${expression.operands.length}.`,
        expression.span,
        {
          code: DiagnosticCode.WrongArgumentCount,
          label: "wrong number of directive operands",
        },
      ),
    );
    return unknownType();
  }

  const template = targetJsTemplateOperand(expression, context, 0);
  const runtimeOperandStart = mode === "result" ? 3 : 2;

  for (const operand of expression.operands.slice(runtimeOperandStart)) {
    if (operand.kind === "ExpressionOperand") {
      context.inferExpression(operand.expression, scope);
      continue;
    }

    context.diagnostics.push(
      error(`Directive '@${expression.name}' expects runtime expression operands.`, operand.span, {
        code: DiagnosticCode.InvalidDirectiveOperand,
        label: "supply an expression here",
      }),
    );
  }

  const valueType = targetJsTypeOperand(expression, context, 1);
  const resultType =
    mode === "plain"
      ? valueType
      : mode === "option"
        ? context.resolveNamedType("Option", expression.nameSpan, [valueType ?? unknownType()])
        : context.resolveNamedType("Result", expression.nameSpan, [
            valueType ?? unknownType(),
            targetJsTypeOperand(expression, context, 2) ?? unknownType(),
          ]);

  if (template !== undefined) {
    validateTargetJsTemplate(expression, context, template, runtimeOperandStart);
    context.recordDirectiveExpansion(expression, {
      kind: "TargetJs",
      mode,
      template,
      runtimeOperandStart,
    });
  }

  return resultType ?? unknownType();
}

function targetJsTemplateOperand(
  expression: DirectiveExpression,
  context: DirectiveCheckContext,
  index: number,
): string | undefined {
  const operand = expression.operands[index];
  if (operand?.kind !== "ExpressionOperand") {
    context.diagnostics.push(
      error(
        `Directive '@${expression.name}' expects a string literal template.`,
        operand?.span ?? expression.span,
        {
          code: DiagnosticCode.InvalidDirectiveOperand,
          label: "supply a string literal here",
        },
      ),
    );
    return undefined;
  }

  const templateExpression = operand.expression;
  if (
    templateExpression.kind !== "StringLiteral" ||
    templateExpression.parts.some((part) => part.kind !== "StringText")
  ) {
    context.diagnostics.push(
      error(`Directive '@${expression.name}' expects a string literal template.`, operand.span, {
        code: DiagnosticCode.InvalidDirectiveOperand,
        label: "the template must be a non-interpolated string literal",
      }),
    );
    return undefined;
  }

  let value = "";
  for (const part of templateExpression.parts) {
    if (part.kind === "StringText") {
      value += part.value;
    }
  }
  return value;
}

function targetJsTypeOperand(
  expression: DirectiveExpression,
  context: DirectiveCheckContext,
  index: number,
): Type | undefined {
  const operand = expression.operands[index];
  if (operand?.kind !== "TypeOperand") {
    context.diagnostics.push(
      error(
        `Directive '@${expression.name}' expects a type operand.`,
        operand?.span ?? expression.span,
        {
          code: DiagnosticCode.InvalidDirectiveOperand,
          label: "supply a type here",
        },
      ),
    );
    return undefined;
  }

  return context.typeFromNodeInActiveEnvironment(operand.type);
}

function validateTargetJsTemplate(
  expression: DirectiveExpression,
  context: DirectiveCheckContext,
  template: string,
  runtimeOperandStart: number,
): void {
  const runtimeOperandCount = expression.operands.length - runtimeOperandStart;
  const usedIndexes = new Set<number>();

  for (let index = 0; index < template.length; index += 1) {
    if (template[index] !== "$") {
      continue;
    }

    const placeholderStart = index;
    index += 1;
    if (!isAsciiDigit(template[index])) {
      context.diagnostics.push(
        error(`Malformed target placeholder in '@${expression.name}'.`, expression.span, {
          code: DiagnosticCode.InvalidDirectiveOperand,
          label: "placeholders must use '$' followed by a runtime operand index",
        }),
      );
      continue;
    }

    let digits = "";
    while (isAsciiDigit(template[index])) {
      digits += template[index];
      index += 1;
    }
    index -= 1;

    const operandIndex = Number(digits);
    if (operandIndex >= runtimeOperandCount) {
      context.diagnostics.push(
        error(`Target placeholder '$${digits}' has no matching runtime operand.`, expression.span, {
          code: DiagnosticCode.InvalidDirectiveOperand,
          label: "add a runtime operand or lower the placeholder index",
        }),
      );
      continue;
    }

    if (placeholderStart >= 0) {
      usedIndexes.add(operandIndex);
    }
  }

  for (let index = 0; index < runtimeOperandCount; index += 1) {
    if (usedIndexes.has(index)) {
      continue;
    }

    const operand = expression.operands[runtimeOperandStart + index];
    context.diagnostics.push(
      error(
        `Runtime operand ${index} is not used by target template.`,
        operand?.span ?? expression.span,
        {
          code: DiagnosticCode.InvalidDirectiveOperand,
          label: `reference this operand as '$${index}' or remove it`,
        },
      ),
    );
  }
}

function directiveSingleTypeOperand(
  expression: DirectiveExpression,
  context: DirectiveCheckContext,
): Type | undefined {
  if (expression.operands.length !== 1) {
    context.diagnostics.push(
      error(
        `Directive '@${expression.name}' expects 1 type operand, got ${expression.operands.length}.`,
        expression.span,
        {
          code: DiagnosticCode.WrongArgumentCount,
          label: "wrong number of directive operands",
        },
      ),
    );
    return undefined;
  }

  const operand = expression.operands[0];
  if (operand?.kind !== "TypeOperand") {
    context.diagnostics.push(
      error(
        `Directive '@${expression.name}' expects a type operand.`,
        operand?.span ?? expression.span,
        {
          code: DiagnosticCode.InvalidDirectiveOperand,
          label: "supply a type name or type expression here",
        },
      ),
    );
    return undefined;
  }

  return context.typeFromNode(operand.type);
}

function isAsciiDigit(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9";
}
