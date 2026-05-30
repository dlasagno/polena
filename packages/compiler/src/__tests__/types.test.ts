import { describe, expect, test } from "bun:test";
import {
  arrayType,
  enumType,
  formatType,
  functionType,
  genericEnumType,
  inferArithmeticType,
  isAssignableTo,
  isEqualityComparableType,
  neverType,
  objectType,
  opaqueType,
  primitiveType,
  sameType,
  unknownType,
} from "../types";

describe("semantic types", () => {
  test("treats identical primitive types as equal", () => {
    expect(sameType(primitiveType("number"), primitiveType("number"))).toBe(true);
    expect(sameType(primitiveType("number"), primitiveType("bigint"))).toBe(false);
  });

  test("treats structurally identical function types as equal", () => {
    const left = functionType([primitiveType("number")], primitiveType("string"));
    const right = functionType([primitiveType("number")], primitiveType("string"));

    expect(sameType(left, right)).toBe(true);
  });

  test("treats structurally identical array types as equal", () => {
    expect(sameType(arrayType(primitiveType("number")), arrayType(primitiveType("number")))).toBe(
      true,
    );
    expect(sameType(arrayType(primitiveType("number")), arrayType(primitiveType("string")))).toBe(
      false,
    );
  });

  test("treats object type equality as exact and field-order independent", () => {
    const left = objectType([
      { name: "id", type: primitiveType("string") },
      { name: "score", type: primitiveType("number") },
    ]);
    const sameFieldsDifferentOrder = objectType([
      { name: "score", type: primitiveType("number") },
      { name: "id", type: primitiveType("string") },
    ]);
    const wider = objectType([
      { name: "id", type: primitiveType("string") },
      { name: "score", type: primitiveType("number") },
      { name: "active", type: primitiveType("boolean") },
    ]);

    expect(sameType(left, sameFieldsDifferentOrder)).toBe(true);
    expect(sameType(left, wider)).toBe(false);
    expect(isAssignableTo(wider, left)).toBe(true);
    expect(isAssignableTo(left, wider)).toBe(false);
  });

  test("treats nested object assignability structurally", () => {
    const named = objectType([{ name: "name", type: primitiveType("string") }]);
    const user = objectType([
      { name: "id", type: primitiveType("string") },
      { name: "name", type: primitiveType("string") },
    ]);
    const namedWrapper = objectType([{ name: "value", type: named }]);
    const userWrapper = objectType([{ name: "value", type: user }]);

    expect(isAssignableTo(userWrapper, namedWrapper)).toBe(true);
    expect(isAssignableTo(namedWrapper, userWrapper)).toBe(false);
  });

  test("treats enum type equality nominally", () => {
    const left = enumType("UserKind", [{ name: "Admin", payload: [] }]);
    const sameName = enumType("UserKind", [{ name: "Member", payload: [] }]);
    const other = enumType("AccountKind", [{ name: "Admin", payload: [] }]);
    const otherModule = {
      ...enumType("UserKind", [{ name: "Admin", payload: [] }]),
      moduleName: "@/users",
    };

    expect(sameType(left, sameName)).toBe(true);
    expect(sameType(left, other)).toBe(false);
    expect(sameType(left, otherModule)).toBe(false);
  });

  test("treats generic enum instantiations as distinct by type arguments", () => {
    const numberOption = genericEnumType(
      "Option",
      [primitiveType("number")],
      [
        { name: "Some", payload: [primitiveType("number")] },
        { name: "None", payload: [] },
      ],
    );
    const sameNumberOption = genericEnumType("Option", [primitiveType("number")], []);
    const stringOption = genericEnumType(
      "Option",
      [primitiveType("string")],
      [
        { name: "Some", payload: [primitiveType("string")] },
        { name: "None", payload: [] },
      ],
    );
    const otherModuleNumberOption = {
      ...genericEnumType("Option", [primitiveType("number")], []),
      moduleName: "@/option",
    };

    expect(sameType(numberOption, sameNumberOption)).toBe(true);
    expect(sameType(numberOption, stringOption)).toBe(false);
    expect(sameType(numberOption, otherModuleNumberOption)).toBe(false);
  });

  test("only fieldless enums are equality-comparable", () => {
    const fieldless = enumType("Color", [{ name: "Red", payload: [] }]);
    const withPayload = enumType("Message", [
      { name: "Write", payload: [primitiveType("string")] },
      { name: "Quit", payload: [] },
    ]);

    expect(isEqualityComparableType(fieldless)).toBe(true);
    expect(isEqualityComparableType(withPayload)).toBe(false);
  });

  test("treats generic opaque instantiations as distinct by type arguments", () => {
    const numberBox = opaqueType("Box", undefined, [primitiveType("number")]);
    const sameNumberBox = opaqueType("Box", undefined, [primitiveType("number")]);
    const stringBox = opaqueType("Box", undefined, [primitiveType("string")]);

    expect(sameType(numberBox, sameNumberBox)).toBe(true);
    expect(sameType(numberBox, stringBox)).toBe(false);
  });

  test("formats user-facing type names", () => {
    expect(formatType(primitiveType("number"))).toBe("number");
    expect(formatType(primitiveType("bigint"))).toBe("bigint");
    expect(formatType(primitiveType("string"))).toBe("string");
    expect(formatType(primitiveType("boolean"))).toBe("boolean");
    expect(formatType(primitiveType("void"))).toBe("void");
    expect(formatType(arrayType(primitiveType("number")))).toBe("[]number");
    expect(formatType(arrayType(arrayType(primitiveType("number"))))).toBe("[][]number");
    expect(formatType(objectType([{ name: "id", type: primitiveType("string") }]))).toBe(
      "{ id: string }",
    );
    expect(formatType(functionType([], primitiveType("void")))).toBe("function");
    expect(formatType(genericEnumType("Option", [primitiveType("number")], []))).toBe(
      "Option<number>",
    );
    expect(formatType(opaqueType("Date"))).toBe("Date");
    expect(formatType(opaqueType("Box", undefined, [primitiveType("number")]))).toBe("Box<number>");
    expect(formatType(unknownType())).toBe("unknown");
  });

  test("treats never as a bottom type assignable to every type", () => {
    expect(isAssignableTo(neverType(), primitiveType("number"))).toBe(true);
    expect(isAssignableTo(neverType(), arrayType(primitiveType("string")))).toBe(true);
    expect(isAssignableTo(neverType(), neverType())).toBe(true);
    expect(isAssignableTo(primitiveType("number"), neverType())).toBe(false);
    expect(sameType(neverType(), neverType())).toBe(true);
    expect(sameType(neverType(), primitiveType("number"))).toBe(false);
    expect(formatType(neverType())).toBe("never");
  });

  test("infers arithmetic types for matching numeric operands", () => {
    expect(inferArithmeticType(primitiveType("number"), primitiveType("number"))).toEqual(
      primitiveType("number"),
    );
    expect(inferArithmeticType(primitiveType("bigint"), primitiveType("bigint"))).toEqual(
      primitiveType("bigint"),
    );
  });

  test("rejects arithmetic inference for mixed number and bigint operands", () => {
    expect(inferArithmeticType(primitiveType("number"), primitiveType("bigint"))).toBeUndefined();
  });
});
