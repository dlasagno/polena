import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import {
  getSemanticTokens,
  semanticTokenModifiers,
  semanticTokenTypes,
  type SemanticTokens,
} from "../semantic-tokens";

type DecodedToken = {
  readonly text: string;
  readonly type: (typeof semanticTokenTypes)[number];
  readonly modifiers: readonly (typeof semanticTokenModifiers)[number][];
};

describe("semantic tokens", () => {
  test("classifies declarations, references, fields, and enum variants", () => {
    const source = [
      "type Status = enum { Ready, Busy(number) };",
      "type User = { name: string, status: Status };",
      "fn show(user: User): Status {",
      "  const status = user.status;",
      "  match status {",
      "    .Ready => Status.Ready,",
      "    .Busy(value) => Status.Busy(value),",
      "  }",
      "}",
    ].join("\n");

    const decoded = decodeTokens(source, getSemanticTokens(analyze(source)));

    expect(decoded).toContainEqual(token("Status", "type", ["declaration"]));
    expect(decoded).toContainEqual(token("Ready", "enumMember", ["declaration", "readonly"]));
    expect(decoded).toContainEqual(token("Busy", "enumMember", ["declaration", "readonly"]));
    expect(decoded).toContainEqual(token("name", "property", ["declaration"]));
    expect(decoded).toContainEqual(token("status", "property", ["declaration"]));
    expect(decoded).toContainEqual(token("show", "function", ["declaration"]));
    expect(decoded).toContainEqual(token("user", "parameter", ["declaration"]));
    expect(decoded).toContainEqual(token("status", "variable", ["declaration", "readonly"]));
    expect(decoded).toContainEqual(token("status", "property", ["readonly"]));
    expect(decoded).toContainEqual(token("value", "parameter", ["declaration"]));
  });

  test("classifies package imports and prelude references", () => {
    const indexSource = [
      "import @/users.{type User, greeting} as users;",
      "fn main(user: User): void {",
      "  println(greeting(user));",
      "}",
    ].join("\n");
    const usersSource = [
      "export type User = { name: string };",
      "export fn greeting(user: User): string {",
      '  "Hello"',
      "}",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "semantic-token-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source: indexSource },
        { path: "/app/src/users.plna", source: usersSource },
      ],
    });
    const current = result.analyses.find((analysis) => analysis.moduleName === "@/");
    expect(current).toBeDefined();
    if (current === undefined) {
      return;
    }

    const decoded = decodeTokens(indexSource, getSemanticTokens(current.analysis));

    expect(decoded).toContainEqual(token("@/users", "namespace", []));
    expect(decoded).toContainEqual(token("User", "type", []));
    expect(decoded).toContainEqual(token("greeting", "variable", []));
    expect(decoded).toContainEqual(token("users", "namespace", ["declaration"]));
    expect(decoded).toContainEqual(token("println", "variable", ["defaultLibrary"]));
  });
});

function decodeTokens(source: string, tokens: SemanticTokens): DecodedToken[] {
  const lines = source.split("\n");
  const decoded: DecodedToken[] = [];
  let line = 0;
  let character = 0;

  for (let index = 0; index < tokens.data.length; index += 5) {
    const deltaLine = tokens.data[index] ?? 0;
    const deltaStart = tokens.data[index + 1] ?? 0;
    const length = tokens.data[index + 2] ?? 0;
    const tokenType = tokens.data[index + 3] ?? 0;
    const tokenModifiers = tokens.data[index + 4] ?? 0;

    line += deltaLine;
    character = deltaLine === 0 ? character + deltaStart : deltaStart;

    decoded.push({
      text: lines[line]?.slice(character, character + length) ?? "",
      type: semanticTokenTypes[tokenType] ?? "variable",
      modifiers: decodeModifiers(tokenModifiers),
    });
  }

  return decoded;
}

function decodeModifiers(encoded: number): readonly (typeof semanticTokenModifiers)[number][] {
  return semanticTokenModifiers.filter((_, index) => (encoded & (1 << index)) !== 0);
}

function token(
  text: string,
  type: (typeof semanticTokenTypes)[number],
  modifiers: readonly (typeof semanticTokenModifiers)[number][],
): DecodedToken {
  return { text, type, modifiers };
}
