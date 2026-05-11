import type { PrimitiveType } from "./ast";

export type Type =
  | { readonly kind: "primitive"; readonly name: PrimitiveType }
  | {
      readonly kind: "function";
      readonly params: readonly Type[];
      readonly returnType: Type;
    }
  | { readonly kind: "unknown" };

export function primitiveType(name: PrimitiveType): Type {
  return { kind: "primitive", name };
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

export function formatType(type: Type): string {
  switch (type.kind) {
    case "primitive":
      return type.name;
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
