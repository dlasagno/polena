import { describe, expect, test } from "bun:test";
import { compile, compilePackage } from "../compiler";
import { coreTypes, executeValue, expectCompileOk } from "./test-helpers";

describe("compiler enums, directives, and generics", () => {
  test("supports fieldless enum values and equality", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const red = Color.Red;
const blue: Color = .Blue;
const value = red != blue;
`);

    expect(executeValue(result.js)).toBe(true);
    expect(result.js).not.toContain("const Color");
    expect(result.js).toContain('"Color.Red"');
    expect(result.js).toContain('"Color.Blue"');
  });

  test("supports exhaustive match expressions with dot and qualified patterns", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const color = Color.Green;
const value = match color {
  .Red => "red",
  Color.Green => "green",
  .Blue => "blue",
};
`);

    expect(executeValue(result.js)).toBe("green");
    expect(result.js).toContain("switch");
    expect(result.js).toContain('case "Color.Green"');
  });

  test("supports wildcard match arms", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const color = Color.Blue;
const value = match color {
  .Red => "red",
  _ => "other",
};
`);

    expect(executeValue(result.js)).toBe("other");
    expect(result.js).toContain("default:");
  });

  test("supports contextual enum shorthand in function arguments", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Blue,
};

fn label(color: Color): string {
  match color {
    .Red => "red",
    .Blue => "blue",
  }
}

const value = label(.Blue);
`);

    expect(executeValue(result.js)).toBe("blue");
  });

  test("supports enum variants with positional payloads", () => {
    const result = expectCompileOk(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Move(10, 20);
const value = match message {
  .Move(x, y) => "Move to \${x}, \${y}",
  .Write(_) => "write",
  .Quit => "quit",
};
`);

    expect(executeValue(result.js)).toBe("Move to 10, 20");
    expect(result.js).toContain('tag: "Message.Move"');
    expect(result.js).toContain("values: [10, 20]");
    expect(result.js).toContain(".tag ??");
  });

  test("supports enum and object introspection directives", () => {
    const result = expectCompileOk(`
type Color = enum {
  Red,
  Green,
  Blue,
};

type User = {
  id: string,
  name: string,
  active: boolean,
};

const names = @enumVariantNames(Color);
const values = @enumValues(Color);
const fields = @objectFieldNames(User);
const value = names[1] ++ ":" ++ fields[2];
`);

    expect(executeValue(result.js)).toBe("Green:active");
    expect(result.js).toContain('["Red", "Green", "Blue"]');
    expect(result.js).toContain('["Color.Red", "Color.Green", "Color.Blue"]');
    expect(result.js).toContain('["id", "name", "active"]');
  });

  test("supports JavaScript target escape directives", () => {
    const result = expectCompileOk(`
${coreTypes}

fn length(input: string): number {
  @target.js("$0.length", number, input)
}

fn maybe_env(): Option<string> {
  @target.js.option("undefined", string)
}

fn parse(input: string): Result<unknown, unknown> {
  @target.js.result("JSON.parse($0)", unknown, unknown, input)
}

const parsed = parse("{\\"name\\":\\"Ada\\"}");
const parsedValue = match parsed {
  .Ok(_) => length("Ada"),
  .Err(_) => 0,
};
const missingValue = match maybe_env() {
  .Some(value) => length(value),
  .None => 39,
};
const value = parsedValue + missingValue;
`);

    expect(executeValue(result.js)).toBe(42);
    expect(result.js).toContain(".length");
    expect(result.js).toContain('"Option.None"');
    expect(result.js).toContain('"Result.Ok"');
    expect(result.js).toContain('"Result.Err"');
  });

  test("rejects invalid JavaScript target escape directives", () => {
    const missingType = compile('const value = @target.js("Date.now()");');
    expect(missingType.ok).toBe(false);
    expect(missingType.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Directive '@target.js' expects at least 2 operands, got 1.",
    );

    const nonLiteral = compile(`
const template = "Date.now()";
const value = @target.js(template, number);
`);
    expect(nonLiteral.ok).toBe(false);
    expect(nonLiteral.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Directive '@target.js' expects a string literal template.",
    );

    const placeholder = compile('const value = @target.js("$1 + $", number, 1);');
    expect(placeholder.ok).toBe(false);
    expect(placeholder.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Target placeholder '$1' has no matching runtime operand.",
    );
    expect(placeholder.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed target placeholder in '@target.js'.",
    );

    const unused = compile('const value = @target.js("$0", number, 1, 2);');
    expect(unused.ok).toBe(false);
    expect(unused.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Runtime operand 1 is not used by target template.",
    );
  });

  test("requires package opt-in for JavaScript target escape directives", () => {
    const result = compilePackage({
      manifest: { name: "app", version: "0.1.0", target: "executable" },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "export fn main(): void {",
            '  @target.js("console.log($0)", void, "hello")',
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
      "Target escape directive '@target.js' requires an unsafe opt-in.",
    );
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("PLN232");
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === "PLN232")?.label).toBe(
      "add [unsafe] target_escapes = true to polena.toml",
    );
  });

  test("allows JavaScript target escape directives with package opt-in", () => {
    const result = compilePackage({
      manifest: {
        name: "app",
        version: "0.1.0",
        target: "executable",
        unsafe: { targetEscapes: true },
      },
      rootDir: "app",
      sourceDir: "app/src",
      files: [
        {
          path: "app/src/index.plna",
          source: [
            "export fn main(): void {",
            '  @target.js("console.log($0)", void, "hello")',
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
      "console.log",
    );
  });

  test("rejects invalid compiler directive use without cascading name diagnostics", () => {
    const unknown = compile("const value = @missing(Color);");

    expect(unknown.ok).toBe(false);
    expect(unknown.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Unknown compiler directive '@missing'.",
    ]);

    const wrongKind = compile(`
type User = {
  id: string,
};

const value = @enumVariantNames(User);
`);

    expect(wrongKind.ok).toBe(false);
    expect(wrongKind.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Directive '@enumVariantNames' requires an enum type operand.",
    );

    const payloadEnum = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const value = @enumValues(Message);
`);

    expect(payloadEnum.ok).toBe(false);
    expect(payloadEnum.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Directive '@enumValues' requires a fieldless enum type; 'Message.Move' has associated data.",
    );
  });

  test("supports generic object aliases and aliases over generic instantiations", () => {
    const result = expectCompileOk(`
type Pair<A, B> = { first: A, second: B };
type StringPair<V> = Pair<string, V>;

const pair: StringPair<number> = { first: "x", second: 1 };
const value = pair.second;
`);

    expect(executeValue(result.js)).toBe(1);
  });

  test("supports generic enum construction and payload matching", () => {
    const result = expectCompileOk(`
${coreTypes}

const one = Option.Some(1);
const empty: Option<number> = .None;
const nested: Option<Option<number>> = .Some(one);
const value = match nested {
  .Some(inner) => match inner {
    .Some(value) => value,
    .None => 0,
  },
  .None => 0,
};
`);

    expect(executeValue(result.js)).toBe(1);
  });

  test("supports optional type syntax as Option shorthand", () => {
    const result = expectCompileOk(`
${coreTypes}

type User = {
  nickname: ?string,
  scores: []?number,
};

const user: User = {
  nickname: .Some("Ada"),
  scores: [.Some(1), .None],
};

const fallback: ??number = .Some(.None);
const value = match user.nickname {
  .Some(name) => name,
  .None => "Anonymous",
};
`);

    expect(executeValue(result.js)).toBe("Ada");
    expect(result.js).toContain('"Option.Some"');
    expect(result.js).toContain('"Option.None"');
  });

  test("supports locally defined Option and Result types", () => {
    const result = expectCompileOk(`
${coreTypes}

type ParseError = enum {
  Empty,
  Invalid,
};

const present = Option.Some(42);
const missing: Option<number> = .None;
const parsed: Result<number, ParseError> = .Ok(10);
const failed: Result<number, ParseError> = .Err(ParseError.Empty);

const optionValue = match present {
  .Some(value) => value,
  .None => 0,
};
const resultValue = match parsed {
  .Ok(value) => value,
  .Err(_) => 0,
};
const value = optionValue + resultValue;
`);

    expect(executeValue(result.js)).toBe(52);
    expect(result.js).toContain('"Option.Some"');
    expect(result.js).toContain('"Result.Ok"');
    expect(result.js).toContain('"Result.Err"');
    expect(result.js).toContain('"Option.None"');
    expect(result.js).toContain("const missing =");
    expect(result.js).toContain("const failed =");
  });

  test("supports safe array get through in-scope Option", () => {
    const result = expectCompileOk(`
${coreTypes}

const values = [10, 20];
const first = match values.get(0) {
  .Some(value) => value,
  .None => 0,
};
const missing = match values.get(4) {
  .Some(value) => value,
  .None => 5,
};
const value = first + missing;
`);

    expect(executeValue(result.js)).toBe(15);
    expect(result.js).toContain("function __polenaArrayGet");
  });

  test("rejects invalid safe array get calls", () => {
    const wrongIndex = compile('const value = [1].get("0");');
    expect(wrongIndex.ok).toBe(false);
    expect(wrongIndex.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );

    const nonArray = compile("const value = 1.get(0);");
    expect(nonArray.ok).toBe(false);
    expect(nonArray.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'get' on type 'number'.",
    );
  });

  test("supports generic functions over arrays, objects, and enums", () => {
    const result = expectCompileOk(`
${coreTypes}

type Box<T> = { value: T };

fn identity<T>(value: T): T {
  value
}

fn first<T>(items: []T): Option<T> {
  if items.length == 0 {
    .None
  } else {
    .Some(items[0])
  }
}

fn unbox<T>(box: Box<T>): T {
  box.value
}

const numberValue = identity(41) + 1;
const stringValue = identity("ok");
const boxed = unbox({ value: stringValue });
const firstValue = match first([numberValue]) {
  .Some(value) => value,
  .None => 0,
};
const value = if boxed == "ok" { firstValue } else { 0 };
`);

    expect(executeValue(result.js)).toBe(42);
    expect(result.js).toContain("function identity(value)");
    expect(result.js).toContain("function first(items)");
  });

  test("infers generic function return type from context", () => {
    const result = expectCompileOk(`
${coreTypes}

fn none<T>(): Option<T> {
  .None
}

const value: Option<number> = none();
`);

    expect(result.js).toContain("function none()");
    expect(result.js).toContain('"Option.None"');
  });

  test("supports explicit generic function call type arguments", () => {
    const result = expectCompileOk(`
${coreTypes}

fn identity<T>(value: T): T {
  value
}

fn none<T>(): Option<T> {
  .None
}

fn forward<T>(value: T): T {
  identity<T>(value)
}

const numberValue = identity<number>(41) + 1;
const forwarded = forward<number>(numberValue);
const empty = none<string>();
const value = match empty {
  .Some(_) => 0,
  .None => forwarded,
};
`);

    expect(executeValue(result.js)).toBe(42);
    expect(result.js).toContain("identity(41)");
    expect(result.js).toContain("none()");
  });

  test("rejects invalid generic type argument usage", () => {
    const missing = compile(`
type Box<T> = { value: T };
const box: Box = { value: 1 };
`);
    expect(missing.ok).toBe(false);
    expect(missing.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Generic type 'Box' requires 1 type argument(s).",
    );

    const extra = compile(`
type Score = number;
const score: Score<string> = 1;
`);
    expect(extra.ok).toBe(false);
    expect(extra.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Type 'Score' does not take type arguments.",
    );

    const userOption = compile("type Option<T> = enum { Some(T), None };");
    expect(userOption.ok).toBe(true);
  });

  test("rejects invalid generic function usage", () => {
    const duplicate = compile("fn bad<T, T>(value: T): T { value }");
    expect(duplicate.ok).toBe(false);
    expect(duplicate.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate type parameter 'T'.",
    );

    const cannotInfer = compile(`
${coreTypes}

fn make<T>(): Option<T> {
  .None
}

const value = make();
`);
    expect(cannotInfer.ok).toBe(false);
    expect(cannotInfer.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer type argument(s) 'T' for 'make'.",
    );

    const wrongTypeArgumentCount = compile(`
fn pair<A, B>(left: A, right: B): A {
  left
}

const value = pair<number>(1, "two");
`);
    expect(wrongTypeArgumentCount.ok).toBe(false);
    expect(wrongTypeArgumentCount.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 2 type argument(s), got 1.",
    );

    const nonGenericTypeArguments = compile(`
fn double(value: number): number {
  value + value
}

const value = double<number>(1);
`);
    expect(nonGenericTypeArguments.ok).toBe(false);
    expect(nonGenericTypeArguments.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "This function does not take type arguments.",
    );

    const mismatch = compile(`
fn choose<T>(left: T, right: T): T {
  left
}

const value = choose(1, "two");
`);
    expect(mismatch.ok).toBe(false);
    expect(mismatch.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects generic enum construction when type arguments cannot be inferred", () => {
    const result = compile(`
${coreTypes}

const empty = Option.None;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer type arguments for 'Option.None'.",
    );
  });

  test("supports contextual shorthand construction and object payloads", () => {
    const result = expectCompileOk(`
type Message = enum {
  Move({ x: number, y: number }),
  Write(string),
  Quit,
};

fn label(message: Message): string {
  match message {
    .Move(pos) => "Move to \${pos.x}, \${pos.y}",
    .Write(value) => value,
    .Quit => "Quit",
  }
}

const direct: Message = .Move({ x: 3, y: 4 });
const value = label(.Move({ x: 10, y: 20 }));
`);

    expect(executeValue(result.js)).toBe("Move to 10, 20");
  });

  test("supports wildcard payload patterns", () => {
    const result = expectCompileOk(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Write("hello");
const value = match message {
  .Move(_, _) => "move",
  .Write(_) => "write",
  .Quit => "quit",
};
`);

    expect(executeValue(result.js)).toBe("write");
  });

  test("rejects duplicate enum variants", () => {
    const result = compile(`
type Color = enum {
  Red,
  Red,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate enum variant 'Red'.",
    );
  });

  test("rejects unknown enum variants", () => {
    const result = compile(`
type Color = enum {
  Red,
};

const value = Color.Blue;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown enum variant 'Color.Blue'.",
    );
  });

  test("rejects enum shorthand without contextual type", () => {
    const result = compile(`
type Color = enum {
  Red,
};

const value = .Red;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer enum type for '.Red'.",
    );
  });

  test("rejects invalid enum payload construction", () => {
    const makeConstructor = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const makeMove = Message.Move;
`);
    expect(makeConstructor.ok).toBe(false);
    expect(makeConstructor.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Move' requires 2 argument(s).",
    );

    const wrongArity = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Move(10);
`);
    expect(wrongArity.ok).toBe(false);
    expect(wrongArity.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 2 argument(s), got 1.",
    );

    const wrongTypes = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Move("x", "y");
`);
    expect(wrongTypes.ok).toBe(false);
    expect(wrongTypes.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );

    const fieldlessCall = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Quit();
`);
    expect(fieldlessCall.ok).toBe(false);
    expect(fieldlessCall.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Quit' has no associated data.",
    );

    const shorthandWithoutContext = compile(`
type Message = enum {
  Move(number, number),
};

const message = .Move(1, 2);
`);
    expect(shorthandWithoutContext.ok).toBe(false);
    expect(shorthandWithoutContext.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer enum type for '.Move'.",
    );
  });

  test("rejects equality across different enum types", () => {
    const result = compile(`
type Color = enum {
  Red,
};

type Status = enum {
  Red,
};

const value = Color.Red == Status.Red;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '==' requires compatible operands, got 'Color' and 'Status'.",
    );
  });

  test("rejects equality for enums with associated data", () => {
    const result = compile(`
type Message = enum {
  Write(string),
  Quit,
};

const value = Message.Quit == Message.Quit;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '==' cannot compare 'Message' values.",
    );
  });

  test("rejects enum ordering", () => {
    const result = compile(`
type Color = enum {
  Red,
  Blue,
};

const value = Color.Red < Color.Blue;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' cannot order 'Color' values.",
    );
  });

  test("rejects non-exhaustive enum matches", () => {
    const result = compile(`
type Color = enum {
  Red,
  Green,
  Blue,
};

const color = Color.Red;
const value = match color {
  .Red => "red",
  .Green => "green",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Non-exhaustive match; missing '.Blue'.",
    );
  });

  test("rejects invalid enum payload match patterns", () => {
    const wrongArity = compile(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Move(1, 2);
const value = match message {
  .Move(x) => "move",
  .Write(_) => "write",
  .Quit => "quit",
};
`);
    expect(wrongArity.ok).toBe(false);
    expect(wrongArity.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 2 payload pattern(s), got 1.",
    );

    const omittedPayload = compile(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Write("hello");
const value = match message {
  .Move(_, _) => "move",
  .Write => "write",
  .Quit => "quit",
};
`);
    expect(omittedPayload.ok).toBe(false);
    expect(omittedPayload.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Write' requires 1 payload pattern(s).",
    );

    const fieldlessPayload = compile(`
type Message = enum {
  Move(number, number),
  Write(string),
  Quit,
};

const message = Message.Quit;
const value = match message {
  .Move(_, _) => "move",
  .Write(_) => "write",
  .Quit() => "quit",
};
`);
    expect(fieldlessPayload.ok).toBe(false);
    expect(fieldlessPayload.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Enum variant 'Message.Quit' has no associated data.",
    );
  });

  test("rejects invalid enum payload pattern bindings", () => {
    const duplicateBinding = compile(`
type Message = enum {
  Move(number, number),
  Quit,
};

const message = Message.Move(1, 2);
const value = match message {
  .Move(x, x) => "move",
  .Quit => "quit",
};
`);
    expect(duplicateBinding.ok).toBe(false);
    expect(duplicateBinding.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate pattern binding 'x'.",
    );

    const shadowedBinding = compile(`
type Message = enum {
  Write(string),
  Quit,
};

const text = "outer";
const message = Message.Write("inner");
const value = match message {
  .Write(text) => text,
  .Quit => "",
};
`);
    expect(shadowedBinding.ok).toBe(false);
    expect(shadowedBinding.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Name 'text' shadows an existing name.",
    );

    const outOfScopeBinding = compile(`
type Message = enum {
  Write(string),
  Quit,
};

const message = Message.Write("inner");
const value = match message {
  .Write(text) => text,
  .Quit => "",
};
const other = text;
`);
    expect(outOfScopeBinding.ok).toBe(false);
    expect(outOfScopeBinding.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown name 'text'.",
    );
  });

  test("rejects duplicate and unreachable match arms", () => {
    const duplicateResult = compile(`
type Color = enum {
  Red,
  Blue,
};

const color = Color.Red;
const value = match color {
  .Red => "red",
  .Red => "again",
  .Blue => "blue",
};
`);

    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate match arm for '.Red'.",
    );

    const unreachableResult = compile(`
type Color = enum {
  Red,
  Blue,
};

const color = Color.Red;
const value = match color {
  _ => "any",
  .Blue => "blue",
};
`);

    expect(unreachableResult.ok).toBe(false);
    expect(unreachableResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unreachable match arm.",
    );
  });

  test("rejects qualified match patterns from another enum", () => {
    const result = compile(`
type Color = enum {
  Red,
  Blue,
};

type Status = enum {
  Red,
};

const color = Color.Red;
const value = match color {
  Status.Red => "red",
  .Blue => "blue",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Match pattern uses enum 'Status', but scrutinee has type 'Color'.",
    );
  });

  test("rejects match arm result type mismatches", () => {
    const result = compile(`
type Color = enum {
  Red,
  Blue,
};

const color = Color.Red;
const value = match color {
  .Red => "red",
  .Blue => 1,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
    );
  });
});
