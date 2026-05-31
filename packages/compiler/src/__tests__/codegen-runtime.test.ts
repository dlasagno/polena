import { describe, expect, test } from "bun:test";
import { compile, compilePackage } from "../compiler";
import { executeValue, expectCompileOk, expectPanic } from "./test-helpers";

describe("compiler code generation and runtime behavior", () => {
  test("compiles and runs a tiny program", () => {
    const result = expectCompileOk(`
fn add(a: number, b: number): number {
  a + b
}

const value = add(20, 22);
`);

    expect(result.js).toContain("function add(a, b)");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports JavaScript-backed println functions", () => {
    const result = expectCompileOk(`
fn println(message: string): void {
  @target.js("console.log($0)", void, message)
}

println("Hello");
`);

    expect(result.js).toContain("return console.log(message);");
    expect(result.js).toContain('println("Hello");');
  });

  test("supports interpolation in println calls", () => {
    const result = expectCompileOk(`
fn println(message: string): void {
  @target.js("console.log($0)", void, message)
}

const value = 42;
println("value ${"$"}{value}");
`);

    expect(result.js).toContain(["println(`value ", "$", "{value}`);"].join(""));
  });

  test("supports explicit return statements", () => {
    const result = expectCompileOk(`
fn identity(value: string): string {
  return value;
}

const value = identity("Ada");
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("supports function parameters and return values", () => {
    const result = expectCompileOk(`
fn apply(value: number, op: fn(number) -> number): number {
  op(value)
}

fn inc(value: number): number {
  value + 1
}

const value = apply(41, inc);
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("supports anonymous functions with captures", () => {
    const result = expectCompileOk(`
fn makeAdder(base: number): fn(number) -> number {
  fn (value: number): number {
    value + base
  }
}

const addTwo = makeAdder(2);
const value = addTwo(40);
`);

    expect(result.js).toContain("return function (value)");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports anonymous functions inside generic functions", () => {
    const result = expectCompileOk(`
fn constant<T>(value: T): fn() -> T {
  fn (): T {
    value
  }
}

const getValue = constant(42);
const value = getValue();
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("infers generic function arguments through function parameter types", () => {
    const result = expectCompileOk(`
fn apply<T, U>(value: T, transform: fn(T) -> U): U {
  transform(value)
}

const value = apply(41, fn (input: number): string {
  "value ${"$"}{input + 1}"
});
`);

    expect(executeValue(result.js)).toBe("value 42");
  });

  test("supports value-producing if expressions", () => {
    const result = expectCompileOk(`
const enabled = true;
const value = if enabled {
  "yes"
} else {
  "no"
};
`);

    expect(executeValue(result.js)).toBe("yes");
  });

  test("supports interpolated strings", () => {
    const result = expectCompileOk(`
let name = "Ada";
const value = "Hello ${"$"}{name}!";
`);

    expect(result.js).toContain(["`Hello ", "$", "{name}", "!`"].join(""));
    expect(executeValue(result.js)).toBe("Hello Ada!");
  });

  test("supports multiline strings with interpolation", () => {
    const result = expectCompileOk(`
let name = "Ada";
const value = \\\\Hello
  \\\\\${name}
;
`);

    expect(executeValue(result.js)).toBe("Hello\nAda");
  });

  test("preserves supported string escape sequences", () => {
    const result = expectCompileOk(String.raw`
const value = "line\nnext\tindent";
`);

    expect(executeValue(result.js)).toBe("line\nnext\tindent");
  });

  test("supports string concatenation", () => {
    const result = expectCompileOk(`
const first = "Ada";
const value = "Hello, " ++ first ++ "!";
`);

    expect(result.js).toContain('"Hello, ".concat(first)');
    expect(executeValue(result.js)).toBe("Hello, Ada!");
  });

  test("supports if statements without else branches", () => {
    const result = expectCompileOk(`
fn choose(enabled: boolean): number {
  if enabled {
    return 1;
  }

  0
}

const value = choose(true);
`);

    expect(executeValue(result.js)).toBe(1);
  });

  test("supports statement while loops", () => {
    const result = expectCompileOk(`
let total = 0;
let i = 0;

while i < 4 : (i += 1) {
  total += i;
}

const value = total;
`);

    expect(result.js).toContain("while ((i < 4))");
    expect(executeValue(result.js)).toBe(6);
  });

  test("runs while continuation expressions before continue", () => {
    const result = expectCompileOk(`
let total = 0;
let i = 0;

while i < 5 : (i += 1) {
  if i == 2 {
    continue;
  }

  total += i;
}

const value = total;
`);

    expect(executeValue(result.js)).toBe(8);
  });

  test("supports value-producing while expressions", () => {
    const result = expectCompileOk(`
let i = 0;

const value = while i < 6 : (i += 1) {
  if i == 4 {
    break i * 10;
  }
} else {
  -1
};
`);

    expect(result.js).toContain("let __whileResult");
    expect(executeValue(result.js)).toBe(40);
  });

  test("indents nested if expression output", () => {
    const result = expectCompileOk(`
fn describeScore(score: number): string {
  if score >= 90 {
    "excellent"
  } else {
    if score >= 70 {
      "passing"
    } else {
      "needs work"
    }
  }
}

const value = describeScore(72);
`);

    expect(result.js).toContain(
      [
        "function describeScore(score) {",
        "  return (() => {",
        "    if ((score >= 90)) {",
        '      return "excellent";',
        "    } else {",
        "      return (() => {",
        "        if ((score >= 70)) {",
        '          return "passing";',
        "        } else {",
        '          return "needs work";',
        "        }",
        "      })();",
        "    }",
        "  })();",
        "}",
      ].join("\n"),
    );
    expect(executeValue(result.js)).toBe("passing");
  });

  test("compiles the README MVP example shape", () => {
    const result = expectCompileOk(`
const answer: number = 40 + 2;
let name: string = "Ada";

fn add(a: number, b: number): number {
  a + b
}

const value = add(answer, 1);
`);

    expect(result.js).toContain('let name = "Ada";');
    expect(executeValue(result.js)).toBe(43);
  });

  test("compiles the checked-in package example", () => {
    const result = compilePackage({
      manifest: { name: "basic", version: "0.1.0", target: "executable" },
      rootDir: "examples/basic",
      sourceDir: "examples/basic/src",
      files: [
        {
          path: "examples/basic/src/index.plna",
          source: [
            "import @/users.{type User, greeting} as users;",
            "export fn main(): void {",
            '  const user: User = { name: "Ada" };',
            "  const message = users.greeting(user);",
            "}",
          ].join("\n"),
        },
        {
          path: "examples/basic/src/users.plna",
          source: [
            "export type User = {",
            "  name: string,",
            "};",
            "export fn greeting(user: User): string {",
            ['  "Hello ', "$", '{user.name}"'].join(""),
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
      'import * as users from "./users.js";',
    );
    expect(result.files.find((file) => file.path === "users.js")?.contents).toContain(
      "export function greeting",
    );
  });

  test("supports named type aliases in annotations", () => {
    const result = expectCompileOk(`
type Score = number;
type Scores = []Score;
type Matrix = []Scores;

fn first(values: Scores): Score {
  values[0]
}

const scores: Scores = [40, 2];
const matrix: Matrix = [scores];
const value: Score = first(matrix[0]);
`);

    expect(result.js).not.toContain("type Score");
    expect(executeValue(result.js)).toBe(40);
  });

  test("keeps type and value namespaces separate", () => {
    const result = expectCompileOk(`
type Label = string;
const Label = "Ada";
const value: Label = Label;
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("supports source unknown as an explicit boundary type", () => {
    const result = expectCompileOk(`
type Json = unknown;

fn identity(value: Json): unknown {
  value
}

const value: unknown = identity(1);
`);

    expect(result.js).not.toContain("type Json");
    expect(executeValue(result.js)).toBe(1);
  });

  test("rejects implicit conversion from unknown to concrete types", () => {
    const result = compile(`
const boundary: unknown = 1;
const value: number = boundary;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'unknown'.",
    );
  });

  test("rejects inspecting unknown values", () => {
    const result = compile(`
const boundary: unknown = { name: "Ada" };
const value = boundary.name;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'name' on type 'unknown'.",
    );
  });

  test("supports opaque type declarations as nominal types", () => {
    const result = expectCompileOk(`
type Date = opaque;

fn keep(date: Date): Date {
  date
}
`);

    expect(result.js).not.toContain("type Date");
  });

  test("rejects assigning between distinct opaque types", () => {
    const result = compile(`
type Date = opaque;
type Handle = opaque;

fn convert(date: Date): Handle {
  date
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'Handle', got 'Date'.",
    );
  });

  test("supports generic opaque type declarations", () => {
    const result = expectCompileOk(`
type Box<T> = opaque;

fn keep<T>(box: Box<T>): Box<T> {
  box
}
`);

    expect(result.js).not.toContain("type Box");
  });

  test("rejects assigning between distinct generic opaque instantiations", () => {
    const result = compile(`
type Box<T> = opaque;

fn convert(box: Box<number>): Box<string> {
  box
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'Box<string>', got 'Box<number>'.",
    );
  });

  test("supports exact object literals with named object types", () => {
    const result = expectCompileOk(`
type User = {
  id: string,
  score: number,
};

const value: User = {
  score: 90,
  id: "ada",
};
`);

    expect(result.js).toContain('const value = { score: 90, id: "ada" };');
    const execute = new Function(`${result.js}\nreturn value.score;`) as () => unknown;
    expect(execute()).toBe(90);
  });

  test("supports object property access", () => {
    const result = expectCompileOk(`
type User = {
  name: string,
  score: number,
};

const user: User = { name: "Ada", score: 42 };
const value = user.name;
`);

    expect(result.js).toContain("user.name");
    expect(executeValue(result.js)).toBe("Ada");
  });

  test("supports object property access on inferred object types", () => {
    const result = expectCompileOk(`
const point = { x: 20, y: 22 };
const value = point.x + point.y;
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("supports object field assignment through const bindings", () => {
    const result = expectCompileOk(`
const user = { name: "Ada", score: 1 };
user.name = "Grace";
const value = user.name;
`);

    expect(result.js).toContain('user.name = "Grace";');
    expect(executeValue(result.js)).toBe("Grace");
  });

  test("supports compound assignment on object fields", () => {
    const result = expectCompileOk(`
const user = { score: 40 };
user.score += 2;
const value = user.score;
`);

    expect(result.js).toContain("user.score += 2;");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports object field assignment through function parameters", () => {
    const result = expectCompileOk(`
type User = {
  name: string,
};

fn rename(user: User): void {
  user.name = "Grace";
}

const user: User = { name: "Ada" };
rename(user);
const value = user.name;
`);

    expect(executeValue(result.js)).toBe("Grace");
  });

  test("infers exact object literal types", () => {
    const result = expectCompileOk(`
const user = {
  id: "ada",
  score: 90,
};

const value = user;
`);

    expect(result.js).toContain('const user = { id: "ada", score: 90 };');
  });

  test("supports reassigning let bindings", () => {
    const result = expectCompileOk(`
let count = 40;
count = count + 2;

const value = count;
`);

    expect(result.js).toContain("count = (count + 2);");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports compound assignment on let bindings", () => {
    const result = expectCompileOk(`
let count = 40;
count += 2;
count *= 2;

const value = count;
`);

    expect(result.js).toContain("count += 2;");
    expect(result.js).toContain("count *= 2;");
    expect(executeValue(result.js)).toBe(84);
  });

  test("supports remainder compound assignment", () => {
    const result = expectCompileOk(`
let count = 17;
count %= 5;

const value = count;
`);

    expect(result.js).toContain("count %= 5;");
    expect(executeValue(result.js)).toBe(2);
  });

  test("supports bigint arithmetic and compound assignment", () => {
    const result = expectCompileOk(`
fn double(value: bigint): bigint {
  value + value
}

let total: bigint = 40n;
total += 2n;

const value = double(total);
`);

    expect(result.js).toContain("40n");
    expect(result.js).toContain("total += 2n;");
    expect(executeValue(result.js)).toBe(84n);
  });

  test("supports bigint ordering", () => {
    const result = expectCompileOk("const value = 2n >= 1n;");

    expect(executeValue(result.js)).toBe(true);
  });

  test("supports non-decimal and exponent number literals", () => {
    const result = expectCompileOk("const value = 0xff + 0o70 + 0b10 + 1e3 + 1.5e1;");

    expect(executeValue(result.js)).toBe(1328);
  });

  test("supports array literals and checked indexing", () => {
    const result = expectCompileOk(`
const values = [20, 22];
const value = values[0] + values[1];
`);

    expect(result.js).toContain("function __polenaIndex");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports array concatenation", () => {
    const result = expectCompileOk(`
const left = [20];
const right = [22];
const values = left ++ right;
const value = values[0] + values[1];
`);

    expect(result.js).toContain("left.concat(right)");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports typed empty arrays and array length", () => {
    const result = expectCompileOk(`
const values: []number = [];
const value = values.length;
`);

    expect(result.js).not.toContain("function __polenaIndex");
    expect(executeValue(result.js)).toBe(0);
  });

  test("supports array function parameters and returns", () => {
    const result = expectCompileOk(`
fn pair(a: number, b: number): []number {
  [a, b]
}

const value = pair(20, 22)[1];
`);

    expect(executeValue(result.js)).toBe(22);
  });

  test("supports nested arrays", () => {
    const result = expectCompileOk(`
const values: [][]number = [[1], [42]];
const value = values[1][0];
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("supports checked array element assignment", () => {
    const result = expectCompileOk(`
const values = [1, 2];
values[0] = 40;
values[1] = 2;
const value = values[0] + values[1];
`);

    expect(result.js).toContain("function __polenaIndexSet");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports checked compound assignment on array elements", () => {
    const result = expectCompileOk(`
const values = [40, 2];
values[0] += values[1];
const value = values[0];
`);

    expect(result.js).toContain("function __polenaIndexUpdate");
    expect(executeValue(result.js)).toBe(42);
  });

  test("supports checked compound assignment on bigint array elements", () => {
    const result = expectCompileOk(`
const values = [40n, 2n];
values[0] += values[1];
const value = values[0];
`);

    expect(executeValue(result.js)).toBe(42n);
  });

  test("emits JavaScript-safe names for reserved identifiers and compiler helper names", () => {
    const result = expectCompileOk(`
const default = 40;
const __polenaIndex = [2];
const value = default + __polenaIndex[0];
`);

    expect(result.js).toContain("const $polena$default = 40;");
    expect(result.js).toContain("const $polena$__polenaIndex = [2];");
    expect(executeValue(result.js)).toBe(42);
  });

  test("throws on out-of-bounds array indexes", () => {
    const result = expectCompileOk(`
const values = [1];
const value = values[1];
`);

    expectPanic(result.js, "array index out of bounds");
  });

  test("throws on fractional array indexes", () => {
    const result = expectCompileOk(`
const values = [1];
const value = values[0.5];
`);

    expectPanic(result.js, "array index out of bounds");
  });

  test("throws on out-of-bounds array assignment indexes", () => {
    const result = expectCompileOk(`
const values = [1];
values[1] = 2;
const value = values[0];
`);

    expectPanic(result.js, "array index out of bounds");
  });

  test("throws on out-of-bounds array compound assignment indexes", () => {
    const result = expectCompileOk(`
const values = [1];
values[1] += 2;
const value = values[0];
`);

    expectPanic(result.js, "array index out of bounds");
  });

  test("emits a PolenaPanic helper for the panic keyword and throws at runtime", () => {
    const result = expectCompileOk(`
fn boom(): number {
  panic "boom"
}

const value = boom();
`);

    expect(result.js).toContain("class PolenaPanic extends Error");
    expect(result.js).toContain('__polenaPanic("boom")');
    expectPanic(result.js, "boom");
  });

  test("supports panic in expression position with a string interpolation message", () => {
    const result = expectCompileOk(`
fn pick(flag: boolean): number {
  const value = if flag {
    1
  } else {
    panic "no value for \${flag}"
  };
  value
}

const value = pick(false);
`);

    expectPanic(result.js, "no value for false");
  });

  test("treats panic as a diverging expression so the function needs no other return", () => {
    const result = compile(`
fn always(): number {
  panic "unreachable"
}
`);

    expect(result.ok).toBe(true);
  });

  test("requires panic messages to be strings", () => {
    const result = compile(`
fn boom(): number {
  panic 42
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
    );
  });

  test("accepts never as a return type for a diverging function", () => {
    const result = compile(`
fn fail(message: string): never {
  panic message
}

fn use(): number {
  const value = fail("boom");
  value
}
`);

    expect(result.ok).toBe(true);
  });

  test("absorbs never branches when computing match result types", () => {
    const result = compile(`
type Choice = enum {
  First,
  Second,
};

fn pick(choice: Choice): number {
  match choice {
    .First => 1,
    .Second => panic "no second",
  }
}
`);

    expect(result.ok).toBe(true);
  });
});
