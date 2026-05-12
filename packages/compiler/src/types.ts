import type { PrimitiveType } from "./ast";
import type { Span } from "./span";

export type Type =
  | { readonly kind: "primitive"; readonly name: PrimitiveType }
  | { readonly kind: "array"; readonly element: Type }
  | { readonly kind: "object"; readonly fields: readonly ObjectTypeField[] }
  | {
      readonly kind: "function";
      readonly params: readonly Type[];
      readonly returnType: Type;
    }
  | { readonly kind: "unknown" };

export type ObjectTypeField = {
  readonly name: string;
  readonly type: Type;
  readonly nameSpan?: Span;
  readonly span?: Span;
};

export function primitiveType(name: PrimitiveType): Type {
  return { kind: "primitive", name };
}

export function arrayType(element: Type): Type {
  return { kind: "array", element };
}

export function objectType(fields: readonly ObjectTypeField[]): Type {
  return { kind: "object", fields };
}

export function functionType(params: readonly Type[], returnType: Type): Type {
  return { kind: "function", params, returnType };
}

export function unknownType(): Type {
  return { kind: "unknown" };
}

export function sameType(left: Type, right: Type): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case "primitive":
      return right.kind === "primitive" && left.name === right.name;
    case "array":
      return right.kind === "array" && sameType(left.element, right.element);
    case "object":
      return right.kind === "object" && sameObjectFields(left.fields, right.fields);
    case "function":
      return (
        right.kind === "function" &&
        left.params.length === right.params.length &&
        left.params.every((param, index) => {
          const rightParam = right.params[index];
          return rightParam !== undefined && sameType(param, rightParam);
        }) &&
        sameType(left.returnType, right.returnType)
      );
    case "unknown":
      return true;
  }
}

export function isAssignableTo(source: Type, target: Type): boolean {
  if (source.kind === "unknown" || target.kind === "unknown" || sameType(source, target)) {
    return true;
  }

  if (source.kind === "object" && target.kind === "object") {
    return hasAssignableObjectFields(source.fields, target.fields);
  }

  return false;
}

export function formatType(type: Type): string {
  switch (type.kind) {
    case "primitive":
      return type.name;
    case "array":
      return `[]${formatType(type.element)}`;
    case "object":
      return `{ ${type.fields
        .map((field) => `${field.name}: ${formatType(field.type)}`)
        .join(", ")} }`;
    case "function":
      return "function";
    case "unknown":
      return "unknown";
  }
}

export function isNumericType(type: Type): type is Extract<Type, { readonly kind: "primitive" }> & {
  readonly name: "number" | "bigint";
} {
  return type.kind === "primitive" && isNumericPrimitiveName(type.name);
}

export function isNumericPrimitiveName(name: PrimitiveType): name is "number" | "bigint" {
  return name === "number" || name === "bigint";
}

export function isEqualityComparableType(type: Type): boolean {
  return type.kind === "primitive" && type.name !== "void";
}

export function isOrderingComparableType(type: Type): boolean {
  return isNumericType(type);
}

export function inferArithmeticType(left: Type, right: Type): Type | undefined {
  if (isNumericType(left) && isNumericType(right) && left.name === right.name) {
    return left;
  }

  return undefined;
}

export function preferredArithmeticType(left: Type, right: Type): Type {
  if (isNumericType(left)) {
    return left;
  }

  if (isNumericType(right)) {
    return right;
  }

  return primitiveType("number");
}

function sameObjectFields(
  left: readonly ObjectTypeField[],
  right: readonly ObjectTypeField[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (const leftField of left) {
    const rightField = right.find((field) => field.name === leftField.name);
    if (rightField === undefined || !sameType(leftField.type, rightField.type)) {
      return false;
    }
  }

  return true;
}

function hasAssignableObjectFields(
  source: readonly ObjectTypeField[],
  target: readonly ObjectTypeField[],
): boolean {
  for (const targetField of target) {
    const sourceField = source.find((field) => field.name === targetField.name);
    if (sourceField === undefined || !isAssignableTo(sourceField.type, targetField.type)) {
      return false;
    }
  }

  return true;
}
