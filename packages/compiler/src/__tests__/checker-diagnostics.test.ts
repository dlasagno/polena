import { describe, expect, test } from "bun:test";
import { compile } from "../compiler";
import { executeValue, expectCompileOk } from "./test-helpers";

describe("compiler checking and diagnostics", () => {
  test("rejects non-boolean if conditions", () => {
    const result = compile("const value = if 1 { 1 } else { 0 };");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'boolean', got 'number'.",
    );
  });

  test("rejects unterminated string interpolation", () => {
    const result = compile('const value = "Hello ${name";');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unterminated string interpolation.",
    );
  });

  test("rejects invalid interpolation expressions", () => {
    const result = compile(['const value = "Hello ', "$", "{if}", '";'].join(""));

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Invalid interpolation expression.",
    );
  });

  test("rejects non-boolean while conditions", () => {
    const result = compile("while 1 { break; }");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'boolean', got 'number'.",
    );
  });

  test("rejects incompatible if branch types", () => {
    const result = compile('const value = if true { 1 } else { "no" };');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects value-producing if expressions without else branches", () => {
    const result = compile("const value = if true { 1 };");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "If expression used as a value must have an else branch.",
    );
  });

  test("rejects value-producing while expressions without else branches", () => {
    const result = compile(`
let i = 0;
const value = while i < 3 : (i += 1) {
  break i;
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "While expression used as a value must have an else branch.",
    );
  });

  test("rejects break outside loops", () => {
    const result = compile("break;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Break statement must be inside a loop.",
    );
  });

  test("rejects continue outside loops", () => {
    const result = compile("continue;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Continue statement must be inside a loop.",
    );
  });

  test("rejects break values in statement while loops", () => {
    const result = compile(`
while true {
  break 1;
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Break with a value is only allowed inside value-producing while expressions.",
    );
  });

  test("rejects plain break in value-producing while expressions", () => {
    const result = compile(`
let i = 0;
const value = while i < 3 : (i += 1) {
  if i == 1 {
    break;
  }
} else {
  0
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Value-producing while expressions must use 'break value;'.",
    );
  });

  test("rejects incompatible while exit value types", () => {
    const result = compile(`
let i = 0;
const value = while i < 3 : (i += 1) {
  if i == 1 {
    break 1;
  }
} else {
  "no"
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects unknown names", () => {
    const result = compile("const value = missing;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown name 'missing'.",
    );
  });

  test("rejects duplicate local variables", () => {
    const result = compile(`
fn value(): number {
  const count = 1;
  const count = 2;
  count
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate name 'count'.",
    );
  });

  test("rejects duplicate top-level variable and function names", () => {
    const result = compile(`
const value = 1;

fn value(): number {
  2
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate name 'value'.",
    );
  });

  test("rejects local variables that duplicate parameters", () => {
    const result = compile(`
fn value(count: number): number {
  const count = 1;
  count
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate name 'count'.",
    );
  });

  test("rejects shadowing names from outer scopes", () => {
    const result = compile(`
const count = 1;
const value = if true {
  const count = 2;
  count
} else {
  count
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Name 'count' shadows an existing name.",
    );
  });

  test("rejects incompatible binary operands", () => {
    const result = compile('const value = 1 + "x";');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects mixing number and bigint in arithmetic", () => {
    const result = compile("const value = 1 + 2n;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '+' requires compatible operands, got 'number' and 'bigint'.",
    );
  });

  test("rejects concatenating unsupported operand types", () => {
    const result = compile("const value = 1 ++ 2;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '++' requires string or array operands, got 'number' and 'number'.",
    );
  });

  test("rejects array concatenation with incompatible element types", () => {
    const result = compile('const value = [1] ++ ["x"];');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '++' requires compatible array element types, got 'number' and 'string'.",
    );
  });

  test("rejects array equality", () => {
    const result = compile(`
const left = [1];
const right = [1];
const value = left == right;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '==' cannot compare '[]number' values.",
    );
  });

  test("rejects function equality", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

const value = add != add;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '!=' cannot compare 'function' values.",
    );
  });

  test("rejects ordering non-numeric primitive values", () => {
    const stringResult = compile('const value = "a" < "b";');
    const booleanResult = compile("const value = true > false;");

    expect(stringResult.ok).toBe(false);
    expect(stringResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' cannot order 'string' values.",
    );
    expect(booleanResult.ok).toBe(false);
    expect(booleanResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '>' cannot order 'boolean' values.",
    );
  });

  test("rejects ordering arrays", () => {
    const result = compile(`
const left = [1];
const right = [1];
const value = left < right;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' cannot order '[]number' values.",
    );
  });

  test("rejects ordering functions", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

const value = add > add;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '>' cannot order 'function' values.",
    );
  });

  test("rejects mixed number and bigint ordering", () => {
    const result = compile("const value = 1 < 2n;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Operator '<' requires compatible operands, got 'number' and 'bigint'.",
    );
  });

  test("rejects mixed array element types", () => {
    const result = compile('const values = [1, "x"];');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects untyped empty arrays", () => {
    const result = compile("const values = [];");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot infer the element type of an empty array.",
    );
  });

  test("rejects array literals that do not match annotations", () => {
    const result = compile('const values: []number = ["x"];');

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected '[]number', got '[]string'.",
    );
  });

  test("rejects indexing non-array values", () => {
    const result = compile("const value = 1[0];");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot index value of type 'number'.",
    );
  });

  test("rejects non-number array indexes", () => {
    const result = compile(`
const values = [1];
const value = values["0"];
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects unknown array properties", () => {
    const result = compile(`
const values = [1];
const value = values.size;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'size' on type '[]number'.",
    );
  });

  test("rejects length access on non-array values", () => {
    const result = compile("const value = 1.length;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'length' on type 'number'.",
    );
  });

  test("rejects unknown object properties", () => {
    const result = compile(`
type User = {
  name: string,
};

const user: User = { name: "Ada" };
const value = user.email;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'email' on type '{ name: string }'.",
    );
  });

  test("rejects unknown object properties in assignments", () => {
    const result = compile(`
const user = { name: "Ada" };
user.email = "a@example.com";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown property 'email' on type '{ name: string }'.",
    );
  });

  test("rejects incompatible object field assignment values", () => {
    const result = compile(`
const user = { name: "Ada" };
user.name = 42;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
    );
  });

  test("rejects incompatible array element assignment values", () => {
    const result = compile(`
const values = [1];
values[0] = "no";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects compound assignment on non-numeric object fields", () => {
    const result = compile(`
const user = { name: "Ada" };
user.name += 1;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects compound assignment on non-numeric array elements", () => {
    const result = compile(`
const values = ["Ada"];
values[0] += 1;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects assigning the wrong type to a let binding", () => {
    const result = compile(`
let count = 1;
count = "Ada";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects assigning to const bindings", () => {
    const result = compile(`
const count = 1;
count = 2;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot assign to 'count'.",
    );
  });

  test("rejects compound assignment on const bindings", () => {
    const result = compile(`
const count = 1;
count += 2;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot assign to 'count'.",
    );
  });

  test("rejects assigning to unknown names", () => {
    const result = compile("missing = 1;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown name 'missing'.",
    );
  });

  test("rejects assigning to function names", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

add = add;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Cannot assign to 'add'.",
    );
  });

  test("rejects compound assignment on non-numeric bindings", () => {
    const result = compile(`
let name = "Ada";
name += 1;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects non-numeric right-hand sides in compound assignment", () => {
    const result = compile(`
let count = 1;
count += "Ada";
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'number', got 'string'.",
    );
  });

  test("rejects bigint literals with fractional parts", () => {
    const result = compile("const value = 1.5n;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Bigint literals cannot have a fractional part.",
    );
  });

  test("rejects base-prefixed number literals without digits", () => {
    const result = compile("const value = 0x;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed hexadecimal literal.",
    );
  });

  test("rejects malformed numeric separator placement", () => {
    const sources = ["const value = 1_;", "const value = 1__2;", "const value = 1e_2;"];

    for (const source of sources) {
      const result = compile(source);
      expect(result.ok).toBe(false);
      expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
        "Malformed number literal.",
      );
    }
  });

  test("rejects malformed exponent number literals", () => {
    const result = compile("const value = 1e;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed number literal.",
    );
  });

  test("rejects trailing text after decimal bigint suffixes", () => {
    const result = compile("const value = 1number;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed bigint literal.",
    );
  });

  test("rejects invalid digits in base-prefixed number literals", () => {
    const binaryResult = compile("const value = 0b102;");

    expect(binaryResult.ok).toBe(false);
    expect(binaryResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed binary literal.",
    );

    const separatorResult = compile("const value = 0x_FF;");

    expect(separatorResult.ok).toBe(false);
    expect(separatorResult.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Malformed hexadecimal literal.",
    );
  });

  test("rejects wrong function call arity", () => {
    const result = compile(`
fn add(a: number, b: number): number {
  a + b
}

const value = add(1);
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 2 argument(s), got 1.",
    );
  });

  test("rejects duplicate type names", () => {
    const result = compile(`
type Score = number;
type Score = string;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate type name 'Score'.",
    );
  });

  test("rejects unknown type names", () => {
    const result = compile("const value: Missing = 1;");

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown type 'Missing'.",
    );
  });

  test("rejects recursive type aliases", () => {
    const result = compile(`
type Scores = []Scores;
const value: Scores = [];
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Recursive type alias 'Scores'.",
    );
  });

  test("rejects object literals with missing fields", () => {
    const result = compile(`
type User = {
  id: string,
  score: number,
};

const value: User = {
  id: "ada",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing object field 'score'.",
    );
  });

  test("rejects object literals with extra fields", () => {
    const result = compile(`
type User = {
  id: string,
};

const value: User = {
  id: "ada",
  score: 90,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Unknown object field 'score'.",
    );
  });

  test("rejects duplicate object literal fields", () => {
    const result = compile(`
const value = {
  id: "ada",
  id: "grace",
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate object field 'id'.",
    );
  });

  test("rejects duplicate object type fields", () => {
    const result = compile(`
type User = {
  id: string,
  id: number,
};
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Duplicate object field 'id'.",
    );
  });

  test("supports structural object assignment from non-literal values", () => {
    const result = expectCompileOk(`
type Named = {
  name: string,
};

const user = {
  id: "ada",
  name: "Ada",
};

const named: Named = user;
const value = named.name;
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("supports structural object arguments", () => {
    const result = expectCompileOk(`
type Named = {
  name: string,
};

fn greet(value: Named): string {
  "Hello \${value.name}"
}

const user = {
  id: "ada",
  name: "Ada",
};

const value = greet(user);
`);

    expect(executeValue(result.js)).toBe("Hello Ada");
  });

  test("accepts functions where all if branches return explicitly", () => {
    const result = expectCompileOk(`
fn choose(enabled: boolean): number {
  if enabled {
    return 40;
  } else {
    return 42;
  };
}

const value = choose(false);
`);

    expect(executeValue(result.js)).toBe(42);
  });

  test("accepts final if expressions where all branches return explicitly", () => {
    const result = expectCompileOk(`
fn choose(enabled: boolean): number {
  if enabled {
    return 40;
  } else {
    return 42;
  }
}

const value = choose(true);
`);

    expect(executeValue(result.js)).toBe(40);
  });

  test("rejects functions where an if branch can fall through", () => {
    const result = compile(`
fn choose(enabled: boolean): number {
  if enabled {
    return 42;
  };
}
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Function 'choose' must return 'number'.",
    );
  });

  test("supports nested structural object assignment", () => {
    const result = expectCompileOk(`
type NamedBox = {
  value: {
    name: string,
  },
};

const userBox = {
  value: {
    id: "ada",
    name: "Ada",
  },
};

const namedBox: NamedBox = userBox;
const value = namedBox.value.name;
`);

    expect(executeValue(result.js)).toBe("Ada");
  });

  test("rejects structural object assignment with missing fields", () => {
    const result = compile(`
type User = {
  id: string,
  name: string,
};

const named = {
  name: "Ada",
};

const user: User = named;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing object field 'id'.",
    );
  });

  test("rejects nested structural object assignment with missing fields", () => {
    const result = compile(`
type NamedBox = {
  value: {
    name: string,
  },
};

const box = {
  value: {
    id: "ada",
  },
};

const namedBox: NamedBox = box;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Missing object field 'value.name'.",
    );
  });

  test("rejects structural object assignment with incompatible field types", () => {
    const result = compile(`
type User = {
  id: string,
};

const value = {
  id: 1,
};

const user: User = value;
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Object field 'id' has type 'number', expected 'string'.",
    );
  });

  test("rejects wrong println argument types", () => {
    const result = compile(`
fn println(message: string): void {
  @target.js("console.log($0)", void, message)
}

println(1);
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 'string', got 'number'.",
    );
  });

  test("rejects wrong println arity", () => {
    const result = compile(`
fn println(message: string): void {
  @target.js("console.log($0)", void, message)
}

println();
`);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toContain(
      "Expected 1 argument(s), got 0.",
    );
  });
});
