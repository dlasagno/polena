import { describe, expect, test } from "bun:test";
import type { MatchExpression, MatchPattern } from "../ast";
import {
  checkEnumPayloadPattern,
  checkMatchArmCoverage,
  checkMatchExhaustiveness,
  createMatchCoverageState,
  recordCoveredVariant,
} from "../checker-match";
import type { Diagnostic } from "../diagnostic";
import { DiagnosticCode } from "../diagnostic-codes";
import type { Span } from "../span";
import { enumType, primitiveType, type Type } from "../types";

describe("checker match helpers", () => {
  test("marks arms after wildcard patterns as unreachable", () => {
    const diagnostics: Diagnostic[] = [];
    const state = createMatchCoverageState();

    expect(checkMatchArmCoverage(state, wildcardPattern(), diagnostics)).toEqual({
      kind: "wildcard",
    });
    expect(checkMatchArmCoverage(state, variantPattern("Red"), diagnostics)).toEqual({
      kind: "unreachable",
    });

    expect(diagnostics).toMatchObject([
      {
        code: DiagnosticCode.UnreachableMatchArm,
        message: "Unreachable match arm.",
        label: "a previous wildcard arm already matches this value",
      },
    ]);
  });

  test("detects duplicate variant arms", () => {
    const diagnostics: Diagnostic[] = [];
    const state = createMatchCoverageState();
    const red = variantPattern("Red");

    recordCoveredVariant(state, red, diagnostics);
    recordCoveredVariant(state, red, diagnostics);

    expect([...state.seenVariants]).toEqual(["Red"]);
    expect(diagnostics).toMatchObject([
      {
        code: DiagnosticCode.DuplicateMatchArm,
        message: "Duplicate match arm for '.Red'.",
        label: "this variant was already matched earlier",
      },
    ]);
  });

  test("reports non-exhaustive matches unless a wildcard was seen", () => {
    const diagnostics: Diagnostic[] = [];
    const state = createMatchCoverageState();
    const color = enumType("Color", [
      { name: "Red", payload: [] },
      { name: "Blue", payload: [] },
      { name: "Green", payload: [] },
    ]) as Extract<Type, { readonly kind: "enum" }>;

    recordCoveredVariant(state, variantPattern("Red"), diagnostics);
    checkMatchExhaustiveness(matchExpression(), color, state, diagnostics);

    expect(diagnostics).toMatchObject([
      {
        code: DiagnosticCode.NonExhaustiveMatch,
        message: "Non-exhaustive match; missing '.Blue', '.Green'.",
        label: "this match does not cover every enum variant",
      },
    ]);

    const wildcardDiagnostics: Diagnostic[] = [];
    const wildcardState = createMatchCoverageState();
    checkMatchArmCoverage(wildcardState, wildcardPattern(), wildcardDiagnostics);
    checkMatchExhaustiveness(matchExpression(), color, wildcardState, wildcardDiagnostics);

    expect(wildcardDiagnostics).toEqual([]);
  });

  test("returns payload bindings for binding payload patterns", () => {
    const pattern = variantPattern("Move", [
      bindingPattern("x"),
      wildcardPattern(),
      bindingPattern("label"),
    ]);
    const result = checkEnumPayloadPattern(
      pattern,
      {
        name: "Move",
        payload: [primitiveType("number"), primitiveType("number"), primitiveType("string")],
      },
      messageType(),
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.bindings.map((binding) => [binding.pattern.name, binding.type])).toEqual([
      ["x", primitiveType("number")],
      ["label", primitiveType("string")],
    ]);
  });

  test("validates payload shape for fieldless and payload enum variants", () => {
    const fieldless = checkEnumPayloadPattern(
      variantPattern("Quit", [wildcardPattern()]),
      { name: "Quit", payload: [] },
      messageType(),
    );
    const missingPayload = checkEnumPayloadPattern(
      variantPattern("Move"),
      { name: "Move", payload: [primitiveType("number"), primitiveType("number")] },
      messageType(),
    );
    const wrongArity = checkEnumPayloadPattern(
      variantPattern("Move", [bindingPattern("x")]),
      { name: "Move", payload: [primitiveType("number"), primitiveType("number")] },
      messageType(),
    );

    expect(fieldless.diagnostics).toMatchObject([
      {
        code: DiagnosticCode.WrongArgumentCount,
        message: "Enum variant 'Message.Quit' has no associated data.",
        label: "fieldless variants match without parentheses",
      },
    ]);
    expect(fieldless.bindings).toEqual([]);
    expect(missingPayload.diagnostics).toMatchObject([
      {
        code: DiagnosticCode.WrongArgumentCount,
        message: "Enum variant 'Message.Move' requires 2 payload pattern(s).",
        label: "payload variants must match with parentheses",
      },
    ]);
    expect(wrongArity.diagnostics).toMatchObject([
      {
        code: DiagnosticCode.WrongArgumentCount,
        message: "Expected 2 payload pattern(s), got 1.",
        label: "wrong number of payload patterns for this enum variant",
      },
    ]);
    expect(wrongArity.bindings.map((binding) => binding.pattern.name)).toEqual(["x"]);
  });
});

function messageType(): Extract<Type, { readonly kind: "enum" }> {
  return enumType("Message", [
    { name: "Move", payload: [primitiveType("number"), primitiveType("number")] },
    { name: "Quit", payload: [] },
  ]) as Extract<Type, { readonly kind: "enum" }>;
}

function matchExpression(): MatchExpression {
  return {
    kind: "MatchExpression",
    nodeId: 1,
    scrutinee: {
      kind: "NameExpression",
      nodeId: 2,
      name: "value",
      span: span(),
    },
    arms: [],
    span: span(),
  };
}

function variantPattern(
  variantName: string,
  payload?: Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>["payload"],
): Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }> {
  return {
    kind: "EnumVariantPattern",
    nodeId: 10,
    variantName,
    variantNameSpan: span(),
    ...(payload === undefined ? {} : { payload, payloadSpan: span() }),
    span: span(),
  };
}

function bindingPattern(
  name: string,
): NonNullable<Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>["payload"]>[number] {
  return {
    kind: "BindingPattern",
    nodeId: 20,
    name,
    nameSpan: span(),
    span: span(),
  };
}

function wildcardPattern(): Extract<MatchPattern, { readonly kind: "WildcardPattern" }> {
  return {
    kind: "WildcardPattern",
    nodeId: 30,
    span: span(),
  };
}

function span(): Span {
  return {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 1, line: 1, column: 2 },
  };
}
