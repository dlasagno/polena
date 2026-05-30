import type { MatchExpression, MatchPattern } from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import type { Type } from "./types";
import type { EnumVariantType } from "./types";

export type MatchCoverageState = {
  readonly seenVariants: Set<string>;
  sawWildcard: boolean;
};

export type MatchArmCoverage =
  | { readonly kind: "unreachable" }
  | { readonly kind: "wildcard" }
  | { readonly kind: "variant" };

export type PayloadBinding = {
  readonly pattern: Extract<
    NonNullable<Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>["payload"]>[number],
    { readonly kind: "BindingPattern" }
  >;
  readonly type: Type;
};

export function createMatchCoverageState(): MatchCoverageState {
  return {
    seenVariants: new Set(),
    sawWildcard: false,
  };
}

export function checkMatchArmCoverage(
  state: MatchCoverageState,
  pattern: MatchPattern,
  diagnostics: Diagnostic[],
): MatchArmCoverage {
  if (state.sawWildcard) {
    diagnostics.push(
      error("Unreachable match arm.", pattern.span, {
        code: DiagnosticCode.UnreachableMatchArm,
        label: "a previous wildcard arm already matches this value",
      }),
    );
    return { kind: "unreachable" };
  }

  if (pattern.kind === "WildcardPattern") {
    state.sawWildcard = true;
    return { kind: "wildcard" };
  }

  return { kind: "variant" };
}

export function recordCoveredVariant(
  state: MatchCoverageState,
  pattern: Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>,
  diagnostics: Diagnostic[],
): void {
  if (state.seenVariants.has(pattern.variantName)) {
    diagnostics.push(
      error(`Duplicate match arm for '.${pattern.variantName}'.`, pattern.span, {
        code: DiagnosticCode.DuplicateMatchArm,
        label: "this variant was already matched earlier",
      }),
    );
    return;
  }

  state.seenVariants.add(pattern.variantName);
}

export function checkMatchExhaustiveness(
  expression: MatchExpression,
  scrutineeType: Extract<Type, { readonly kind: "enum" }>,
  state: MatchCoverageState,
  diagnostics: Diagnostic[],
): void {
  if (state.sawWildcard) {
    return;
  }

  const missingVariants = scrutineeType.variants
    .map((variant) => variant.name)
    .filter((variant) => !state.seenVariants.has(variant));

  if (missingVariants.length === 0) {
    return;
  }

  diagnostics.push(
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

export function checkEnumPayloadPattern(
  pattern: Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>,
  variant: EnumVariantType,
  enumType: Extract<Type, { readonly kind: "enum" }>,
): {
  readonly diagnostics: readonly Diagnostic[];
  readonly bindings: readonly PayloadBinding[];
} {
  const diagnostics: Diagnostic[] = [];
  const bindings: PayloadBinding[] = [];
  const payload = pattern.payload;

  if (variant.payload.length === 0) {
    if (payload !== undefined) {
      diagnostics.push(
        error(
          `Enum variant '${enumType.name}.${variant.name}' has no associated data.`,
          pattern.payloadSpan ?? pattern.span,
          {
            code: DiagnosticCode.WrongArgumentCount,
            label: "fieldless variants match without parentheses",
          },
        ),
      );
    }
    return { diagnostics, bindings };
  }

  if (payload === undefined) {
    diagnostics.push(
      error(
        `Enum variant '${enumType.name}.${variant.name}' requires ${variant.payload.length} payload pattern(s).`,
        pattern.span,
        {
          code: DiagnosticCode.WrongArgumentCount,
          label: "payload variants must match with parentheses",
        },
      ),
    );
    return { diagnostics, bindings };
  }

  if (payload.length !== variant.payload.length) {
    diagnostics.push(
      error(
        `Expected ${variant.payload.length} payload pattern(s), got ${payload.length}.`,
        pattern.payloadSpan ?? pattern.span,
        {
          code: DiagnosticCode.WrongArgumentCount,
          label: "wrong number of payload patterns for this enum variant",
        },
      ),
    );
  }

  const count = Math.min(payload.length, variant.payload.length);
  for (let index = 0; index < count; index += 1) {
    const payloadPattern = payload[index];
    const payloadType = variant.payload[index];
    if (
      payloadPattern === undefined ||
      payloadType === undefined ||
      payloadPattern.kind === "WildcardPattern"
    ) {
      continue;
    }

    bindings.push({
      pattern: payloadPattern,
      type: payloadType,
    });
  }

  return { diagnostics, bindings };
}

export function resolveShorthandMatchPattern(
  pattern: Extract<MatchPattern, { readonly kind: "EnumVariantPattern" }>,
  enumName: string,
): void {
  (pattern as { resolvedEnumName?: string }).resolvedEnumName = enumName;
}
