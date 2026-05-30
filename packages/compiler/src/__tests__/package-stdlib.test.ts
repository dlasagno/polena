import { describe, expect, test } from "bun:test";
import { analyzePackage, compile, compilePackage } from "../compiler";
import { coreTypes, executeValue, expectCompileOk, expectPanic } from "./test-helpers";

describe("compiler packages and standard library", () => {
  test("compiles pipe expressions as unary function calls", () => {
    const result = compile(`
fn double(value: number): number {
  value * 2
}

fn stringify(value: number): string {
  "value"
}

const label = 21 |> double |> stringify;
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.js).toContain("const label = stringify(double(21));");
  });

  test("compiles pipe call placeholders as explicit argument positions", () => {
    const result = compile(`
fn between(min: number, value: number, max: number): boolean {
  value >= min and value <= max
}

const ok = 5 |> between(1, _, 10);
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.js).toContain("const ok = between(1, 5, 10);");
  });

  test("rejects pipe calls with multiple placeholders", () => {
    const result = compile(`
fn pair(left: number, right: number): number {
  left + right
}

const value = 1 |> pair(_, _);
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Pipe calls can use at most one '_' placeholder.",
    );
  });

  test("compiles current-package modules to ESM files", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @/users.{type User, parseUser} as users;",
            "export fn main(): void {",
            '  const user: User = users.parseUser("Ada");',
            "  const name = user.name;",
            "}",
          ].join("\n"),
        },
        {
          path: "app/src/users.plna",
          source: [
            "export type User = { name: string };",
            "export fn parseUser(name: string): User {",
            "  { name: name }",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.path).sort()).toEqual(["index.js", "users.js"]);
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      'import * as users from "./users.js";',
    );
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      'import { parseUser } from "./users.js";',
    );
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain("main();");
  });

  test("passes runtime command-line arguments to main", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable", runtime: "node" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: "export fn main(args: []string): void { const first = args[0]; }",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      "main(process.argv.slice(2));",
    );
  });

  test("compiles standard-library imports to bundled ESM files", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/array;",
            "import @std/io;",
            "import @std/math;",
            "import @std/option;",
            "import @std/result;",
            "import @std/string as strings;",
            "import @std/core.{type Result};",
            "",
            "export fn main(): void {",
            '  const words = [" Ada ", "Grace"];',
            "  const first = array.get(words, 0);",
            '  const name = strings.trim(option.unwrap_or(first, "unknown"));',
            "  const rounded = math.round(1.4);",
            "  const parsed: Result<number, string> = .Ok(rounded);",
            "  const value = result.unwrap_or(parsed, 0);",
            "  if value == 1 {",
            "    io.println(name);",
            "  }",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.path).sort()).toEqual([
      "__polena_std/array.js",
      "__polena_std/core.js",
      "__polena_std/io.js",
      "__polena_std/math.js",
      "__polena_std/option.js",
      "__polena_std/result.js",
      "__polena_std/string.js",
      "index.js",
    ]);
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      'import * as strings from "./__polena_std/string.js";',
    );
    expect(result.files.find((file) => file.path === "__polena_std/io.js")?.contents).toContain(
      "console.log",
    );
  });

  test("reports missing standard-library modules when no stdlib is provided", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      standardLibrary: { files: [] },
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/io;",
            "",
            "export fn main(): void {",
            '  io.println("hello");',
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing module '@std/io'.",
    );
  });

  test("compiles with injected standard-library sources", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      standardLibrary: {
        files: [
          {
            path: "<std>/io.plna",
            source: [
              "export fn println(message: string): void {",
              '  @target.js("console.log($0)", void, message)',
              "}",
            ].join("\n"),
          },
        ],
      },
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/io;",
            "",
            "export fn main(): void {",
            '  io.println("hello");',
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.path).sort()).toEqual([
      "__polena_std/io.js",
      "index.js",
    ]);
    expect(result.files.find((file) => file.path === "__polena_std/io.js")?.contents).toContain(
      "console.log",
    );
  });

  test("compiles the standard-library assert and unreachable helpers", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/core.{assert, unreachable};",
            "",
            "fn classify(value: number): string {",
            '  assert(value >= 0, "value must be non-negative");',
            "  if value == 0 {",
            '    "zero"',
            "  } else {",
            '    "positive"',
            "  }",
            "}",
            "",
            "export fn main(): void {",
            "  const label = classify(1);",
            '  if label == "unexpected" {',
            '    unreachable("classify only returns zero or positive")',
            "  }",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const core = result.files.find((file) => file.path === "__polena_std/core.js")?.contents ?? "";
    expect(core).toContain("class PolenaPanic extends Error");
    expect(core).toContain("__polenaPanic(message)");
  });

  test("compiles standard-library option and result unwrap helpers", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/core.{type Option, type Result};",
            "import @std/option;",
            "import @std/result;",
            "",
            "type ParseError = enum {",
            "  Invalid,",
            "};",
            "",
            "export fn main(): void {",
            "  const present: Option<number> = .Some(1);",
            "  const ok: Result<number, ParseError> = .Ok(2);",
            "  option.unwrap(present);",
            "  result.unwrap(ok);",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const optionJs =
      result.files.find((file) => file.path === "__polena_std/option.js")?.contents ?? "";
    const resultJs =
      result.files.find((file) => file.path === "__polena_std/result.js")?.contents ?? "";

    expect(optionJs).toContain('__polenaPanic("called unwrap on None")');
    expect(optionJs).toContain("__polenaPanic(message)");
    expect(resultJs).toContain('__polenaPanic("called unwrap on Err")');
    expect(resultJs).toContain("__polenaPanic(message)");
  });

  test("panics when unwrapping None with option.unwrap", () => {
    const result = expectCompileOk(`
${coreTypes}

fn unwrap<T>(value: Option<T>): T {
  match value {
    .Some(inner) => inner,
    .None => panic "called unwrap on None",
  }
}

const empty: Option<number> = .None;
const value = unwrap(empty);
`);

    expectPanic(result.js, "called unwrap on None");
  });

  test("panics when unwrapping None with option.expect", () => {
    const result = expectCompileOk(`
${coreTypes}

fn expect<T>(value: Option<T>, message: string): T {
  match value {
    .Some(inner) => inner,
    .None => panic message,
  }
}

const empty: Option<number> = .None;
const value = expect(empty, "missing user id");
`);

    expectPanic(result.js, "missing user id");
  });

  test("panics when unwrapping Err with result.unwrap", () => {
    const result = expectCompileOk(`
${coreTypes}

type ParseError = enum {
  Invalid,
};

fn unwrap<T, E>(value: Result<T, E>): T {
  match value {
    .Ok(inner) => inner,
    .Err(_) => panic "called unwrap on Err",
  }
}

const failed: Result<number, ParseError> = .Err(ParseError.Invalid);
const value = unwrap(failed);
`);

    expectPanic(result.js, "called unwrap on Err");
  });

  test("panics when unwrapping Err with result.expect", () => {
    const result = expectCompileOk(`
${coreTypes}

type ParseError = enum {
  Invalid,
};

fn expect<T, E>(value: Result<T, E>, message: string): T {
  match value {
    .Ok(inner) => inner,
    .Err(_) => panic message,
  }
}

const failed: Result<number, ParseError> = .Err(ParseError.Invalid);
const value = expect(failed, "parsePort must succeed");
`);

    expectPanic(result.js, "parsePort must succeed");
  });

  test("returns the inner value when unwrapping Some or Ok", () => {
    const result = expectCompileOk(`
${coreTypes}

fn unwrap_option<T>(value: Option<T>): T {
  match value {
    .Some(inner) => inner,
    .None => panic "called unwrap on None",
  }
}

type ParseError = enum {
  Invalid,
};

fn unwrap_result<T, E>(value: Result<T, E>): T {
  match value {
    .Ok(inner) => inner,
    .Err(_) => panic "called unwrap on Err",
  }
}

const some: Option<number> = .Some(7);
const ok: Result<number, ParseError> = .Ok(9);
const fromOption = unwrap_option(some);
const fromResult = unwrap_result(ok);
const value = fromOption + fromResult;
`);

    expect(executeValue(result.js)).toBe(16);
  });

  test("compiles standard-library map and set modules", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/collections/map.{type Map};",
            "import @std/collections/set.{type Set};",
            "import @std/core.{type Option};",
            "import @std/io.{println};",
            "",
            "export fn main(): void {",
            "  let counts: Map<string, number> = map.new();",
            '  map.insert(counts, "a", 1);',
            '  const value: Option<number> = map.get(counts, "a");',
            "  let tags: Set<string> = set.new();",
            '  set.add(tags, "polena");',
            '  if set.contains(tags, "polena") {',
            "    match value {",
            '      .Some(n) => println("ok"),',
            '      .None => println("missing"),',
            "    }",
            "  }",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.path).sort()).toEqual([
      "__polena_std/collections/map.js",
      "__polena_std/collections/set.js",
      "__polena_std/core.js",
      "__polena_std/io.js",
      "index.js",
    ]);
    expect(
      result.files.find((file) => file.path === "__polena_std/collections/map.js")?.contents,
    ).toContain("new Map()");
    expect(
      result.files.find((file) => file.path === "__polena_std/collections/set.js")?.contents,
    ).toContain("new Set()");
  });

  test("supports generic type parameters in JavaScript target escape directives", () => {
    const result = expectCompileOk(`
${coreTypes}

type Map = opaque;

fn get_value(map: Map, key: string): Option<number> {
  @target.js.option("$0.get($1)", number, map, key)
}

const result = get_value(@target.js("new Map()", Map), "count");
const value = match result {
  .Some(n) => n,
  .None => 0,
};
`);

    expect(executeValue(result.js)).toBe(0);
    expect(result.js).toContain('"Option.None"');
  });

  test("rejects mismatched map value types inferred from the map itself", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/collections/map.{type Map};",
            "import @std/core.{type Option};",
            "",
            "export fn main(): void {",
            "  let counts: Map<string, number> = map.new();",
            '  map.insert(counts, "a", 1);',
            '  const value: Option<string> = map.get(counts, "a");',
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'Map<string, string>', got 'Map<string, number>'.",
    );
  });

  test("rejects map key types that do not match the map key type", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/collections/map.{type Map};",
            "",
            "export fn main(): void {",
            "  let counts: Map<string, number> = map.new();",
            "  map.insert(counts, 1, 1);",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
    );
  });

  test("compiles expanded standard-library helpers", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/array;",
            "import @std/option;",
            "import @std/parse.{type ParseError};",
            "import @std/result;",
            "import @std/string as strings;",
            "import @std/core.{type Option, type Result};",
            "",
            "export fn main(): void {",
            '  let items = ["a", "b"];',
            '  const joined = strings.join(items, "-");',
            '  const parts = strings.split(joined, "-");',
            "  const last = array.last(parts);",
            "  const popped = array.pop(items);",
            "  const nested: Option<Option<number>> = .Some(.Some(41));",
            "  const flat = option.flatten(nested);",
            '  const parsed = parse.parse_int(" 42 ");',
            "  const total = result.unwrap_or(parsed, 0) + option.unwrap_or(flat, 0);",
            "  if total == 83 {",
            '    strings.replace_all("x-y", "x", "z");',
            "  }",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.path).sort()).toContain("__polena_std/parse.js");
    const indexJs = result.files.find((file) => file.path === "index.js")?.contents ?? "";
    const parseJs =
      result.files.find((file) => file.path === "__polena_std/parse.js")?.contents ?? "";
    expect(indexJs).toContain("join");
    expect(parseJs).toContain("parseInt");
  });

  test("compiles parse_int through the standard library", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/parse.{type ParseError};",
            "import @std/result;",
            "import @std/core.{type Result};",
            "",
            "export fn main(): void {",
            '  const parsed: Result<number, ParseError> = parse.parse_int("42abc");',
            "  result.unwrap_or(parsed, 0);",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const parseJs =
      result.files.find((file) => file.path === "__polena_std/parse.js")?.contents ?? "";
    expect(parseJs).toContain("ParseError.Invalid");
    expect(parseJs).toContain("parseInt");
  });

  test("supports explicit core standard-library type imports", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/core.{type Option} as core;",
            "",
            "export fn main(): void {",
            "  const value: Option<number> = .Some(1);",
            '  core.println("ok");',
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.path).sort()).toEqual([
      "__polena_std/core.js",
      "index.js",
    ]);
  });

  test("emits imported standard-library enum constructors through type aliases", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "import @std/core.{type Option as Maybe};",
            "",
            "export fn main(): void {",
            "  const value: Maybe<number> = Maybe.Some(1);",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.files.find((file) => file.path === "index.js")?.contents).toContain(
      'tag: "Option.Some"',
    );
    expect(result.files.find((file) => file.path === "index.js")?.contents).not.toContain(
      "Maybe.Some",
    );
  });

  test("emits shorthand enum constructors using resolved imported enum definitions", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/box_payload.plna",
          source: ["export type Box = enum {", "  Wrap(number),", "};"].join("\n"),
        },
        {
          path: "app/src/box_fieldless.plna",
          source: ["export type Box = enum {", "  Wrap,", "};"].join("\n"),
        },
        {
          path: "app/src/index.plna",
          source: [
            "import @/box_payload.{type Box as PayloadBox};",
            "import @/box_fieldless.{type Box as FieldlessBox};",
            "",
            "export fn main(): void {",
            "  const payload: PayloadBox = .Wrap(1);",
            "  const fieldless: FieldlessBox = .Wrap;",
            "  const value = match payload {",
            "    .Wrap(inner) => inner,",
            "  };",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const output = result.files.find((file) => file.path === "index.js")?.contents ?? "";
    expect(output).toContain('{ tag: "Box.Wrap", values: [1] }');
    expect(output).toContain(".tag ??");
    expect(output).toContain(".values[0]");
    expect(output).not.toContain('"Box.Wrap"(1)');
  });

  test("keeps same-name enum types from different modules distinct", () => {
    const assignment = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/left.plna",
          source: "export type Box = enum { Wrap };",
        },
        {
          path: "app/src/right.plna",
          source: "export type Box = enum { Wrap };",
        },
        {
          path: "app/src/index.plna",
          source: [
            "import @/left.{type Box as LeftBox};",
            "import @/right.{type Box as RightBox};",
            "",
            "export fn main(): void {",
            "  const value: LeftBox = RightBox.Wrap;",
            "}",
          ].join("\n"),
        },
      ],
    });
    const equality = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/left.plna",
          source: "export type Box = enum { Wrap };",
        },
        {
          path: "app/src/right.plna",
          source: "export type Box = enum { Wrap };",
        },
        {
          path: "app/src/index.plna",
          source: [
            "import @/left.{type Box as LeftBox};",
            "import @/right.{type Box as RightBox};",
            "",
            "export fn main(): void {",
            "  const leftValue: LeftBox = LeftBox.Wrap;",
            "  const rightValue: RightBox = RightBox.Wrap;",
            "  const same = leftValue == rightValue;",
            "}",
          ].join("\n"),
        },
      ],
    });
    const generic = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/left.plna",
          source: "export type Box<T> = enum { Wrap(T) };",
        },
        {
          path: "app/src/right.plna",
          source: "export type Box<T> = enum { Wrap(T) };",
        },
        {
          path: "app/src/index.plna",
          source: [
            "import @/left.{type Box as LeftBox};",
            "import @/right.{type Box as RightBox};",
            "",
            "export fn main(): void {",
            "  const value: LeftBox<number> = RightBox.Wrap(1);",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(assignment.ok).toBe(false);
    expect(assignment.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'Box', got 'Box'.",
    );
    expect(equality.ok).toBe(false);
    expect(equality.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '==' requires compatible operands, got 'Box' and 'Box'.",
    );
    expect(generic.ok).toBe(false);
    expect(generic.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'LeftBox<number>', got 'RightBox<number>'.",
    );
  });

  test("requires a runtime for main command-line arguments", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: "export fn main(args: []string): void {}",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "'main' with command-line arguments requires a runtime in polena.toml.",
    );
  });

  test("rejects missing current-package modules", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: "import @/missing;\nexport fn main(): void {}",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing module '@/missing'.",
    );
  });

  test("analyzes package diagnostics with source paths", () => {
    const result = analyzePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: "import @/users.{greeting};\nexport fn main(): void {}",
        },
        {
          path: "app/src/users.plna",
          source: "export const name = 1;",
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: "app/src/index.plna",
        diagnostic: expect.objectContaining({
          message: "Module '@/users' does not export value 'greeting'.",
        }),
      }),
    );
  });
});
