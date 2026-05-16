import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

type TextMatePattern = {
  readonly name?: string;
  readonly match?: string;
  readonly begin?: string;
  readonly patterns?: readonly TextMatePattern[];
};

type TextMateGrammar = {
  readonly repository: Record<string, TextMatePattern>;
};

type LanguageConfiguration = {
  readonly brackets: readonly (readonly [string, string])[];
  readonly autoClosingPairs: readonly { readonly open: string; readonly close: string }[];
  readonly surroundingPairs: readonly (readonly [string, string])[];
};

const grammar = JSON.parse(
  readFileSync(new URL("../../syntaxes/polena.tmLanguage.json", import.meta.url), "utf8"),
) as TextMateGrammar;

const languageConfiguration = JSON.parse(
  readFileSync(new URL("../../language-configuration.json", import.meta.url), "utf8"),
) as LanguageConfiguration;

describe("Polena syntax grammar", () => {
  test("highlights current doc comment forms before ordinary line comments", () => {
    const docComments = grammar.repository["doc-comments"]?.patterns ?? [];
    const lineComment = firstPattern(
      grammar.repository.comments,
      "comment.line.double-slash.polena",
    );

    expect(
      matches(firstPatternByName(docComments, "comment.line.documentation.polena"), "/// item doc"),
    ).toBe(true);
    expect(
      matches(
        firstPatternByName(docComments, "comment.line.documentation.module.polena"),
        "//! module doc",
      ),
    ).toBe(true);
    expect(matches(lineComment, "// ordinary comment")).toBe(true);
    expect(matches(lineComment, "/// item doc")).toBe(false);
    expect(matches(lineComment, "//! module doc")).toBe(false);
  });

  test("highlights directive and import sigils used by current source examples", () => {
    const directive = firstPattern(grammar.repository.directives, "meta.directive.polena");
    const importPath = firstPattern(
      grammar.repository["import-declaration"],
      "string.unquoted.module-path.polena",
    );

    expect(matches(directive, "@enumVariantNames")).toBe(true);
    expect(matches(importPath, "@/users")).toBe(true);
    expect(matches(importPath, "@std/io")).toBe(true);
    expect(matches(importPath, "some_dep/foo")).toBe(true);
  });

  test("highlights current number literal forms", () => {
    const numbers = grammar.repository.numbers?.patterns ?? [];

    expect(matchesAny(numbers, "1_000_000")).toBe(true);
    expect(matchesAny(numbers, "1.5e-3")).toBe(true);
    expect(matchesAny(numbers, "0xff")).toBe(true);
    expect(matchesAny(numbers, "0o755")).toBe(true);
    expect(matchesAny(numbers, "0b1010")).toBe(true);
    expect(matchesAny(numbers, "1_000_000n")).toBe(true);
    expect(matchesAny(numbers, "0xffn")).toBe(true);
    expect(matchesAny(numbers, "0o70n")).toBe(true);
    expect(matchesAny(numbers, "0b1100n")).toBe(true);
  });

  test("highlights current operators and generic function declarations", () => {
    const operator = firstPattern(grammar.repository.operators, "keyword.operator.polena");
    const functionDeclaration = firstPattern(
      grammar.repository["function-declaration"],
      "meta.function.declaration.polena",
    );

    expect(matches(operator, "++")).toBe(true);
    expect(matches(operator, "+=")).toBe(true);
    expect(matches(operator, "=>")).toBe(true);
    expect(begins(functionDeclaration, "fn identity<T>(value: T): T")).toBe(true);
  });

  test("configures square brackets for array syntax", () => {
    expect(languageConfiguration.brackets).toContainEqual(["[", "]"]);
    expect(languageConfiguration.autoClosingPairs).toContainEqual({ open: "[", close: "]" });
    expect(languageConfiguration.surroundingPairs).toContainEqual(["[", "]"]);
  });
});

function firstPattern(pattern: TextMatePattern | undefined, name: string): TextMatePattern {
  const found = pattern === undefined ? undefined : findPattern(pattern, name);
  if (found === undefined) {
    throw new Error(`Missing grammar pattern '${name}'.`);
  }
  return found;
}

function firstPatternByName(patterns: readonly TextMatePattern[], name: string): TextMatePattern {
  const found = patterns.find((pattern) => pattern.name === name);
  if (found === undefined) {
    throw new Error(`Missing grammar pattern '${name}'.`);
  }
  return found;
}

function findPattern(pattern: TextMatePattern, name: string): TextMatePattern | undefined {
  if (pattern.name === name) {
    return pattern;
  }

  for (const child of pattern.patterns ?? []) {
    const found = findPattern(child, name);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

function matchesAny(patterns: readonly TextMatePattern[], text: string): boolean {
  return patterns.some((pattern) => matches(pattern, text));
}

function matches(pattern: TextMatePattern, text: string): boolean {
  if (pattern.match === undefined) {
    return false;
  }
  return new RegExp(`^(?:${pattern.match})$`).test(text);
}

function begins(pattern: TextMatePattern, text: string): boolean {
  if (pattern.begin === undefined) {
    return false;
  }
  return new RegExp(pattern.begin).test(text);
}
