# Language Specification

Status: early draft  
Primary target: JavaScript  
Source encoding: UTF-8

---

# 1. Design Goals

This language is designed for modern web development and aims to provide a safer, simpler, and more predictable developer experience than JavaScript and TypeScript.

The primary goals are:

- Compile directly to JavaScript.
- Generate type declaration files for consumption by TypeScript and JavaScript tooling.
- Work with existing JavaScript and TypeScript code in the future.
- Be compatible with the npm ecosystem where practical.
- Offer familiar syntax to TypeScript/JavaScript developers.
- Remove ambiguous JavaScript behavior.
- Provide a simpler and more robust type system than TypeScript.
- Prevent common runtime errors such as accessing properties of `undefined`.
- Avoid truthiness-based control flow.
- Provide explicit error handling using result types instead of exceptions.
- Support fast compilation with type checking.
- Provide a consistent standard library.
- Be easy for humans, tooling, and LLMs to read and generate.
- Eventually support compile-time metaprogramming inspired by Zig.

Non-goals for the initial version:

- Supporting C or WebAssembly compilation.
- Full JavaScript runtime semantic compatibility.
- Recreating TypeScript’s advanced type-level programming system.
- Supporting classes as a first-class user-facing construct.
- Supporting `throw`/`try`/`catch` as ordinary error handling.

---

# 2. Source Code

Source files are expected to be UTF-8 encoded.

Line endings may be LF or CRLF, but line comments end at LF.

---

# 3. Comments

The language supports only line comments. Block comments are not part of the
language.

```tsx
// This is a line comment. It starts with "//" and ends at the next LF.
```

Two doc-comment forms are recognized:

- `///` introduces an **item doc comment**, attached to the declaration that
  immediately follows it. Multiple consecutive `///` lines form a single
  doc-comment block.
- `//!` introduces a **module doc comment**, attached to the enclosing module.
  Module doc comments must appear at the top of a file, before any
  declaration.

```tsx
//! This module implements basic parser helpers.

/// Parses a single line, returning the trimmed contents.
///
/// Returns `.None` for an empty line.
export fn parseLine(input: string): Option<string> {
	// ...
}
```

Doc-comment content is treated as Markdown by external documentation
tooling. The compiler does not validate or render doc-comment content; it
only attaches the text to the corresponding declaration or module.

---

# 4. Primitive Types

The primitive types are:

```tsx
number
bigint
boolean
string
```

All primitive values are immutable.

Primitive values are based on JavaScript primitives at runtime, but the language gives them stricter and safer static semantics.

---

# 5. Number

The `number` type represents a 64-bit floating-point number, equivalent to JavaScript’s `number`.

Integer-looking literals are still values of type `number`.

```tsx
1
1.05
0.255e3
1_000_000

0xff
0o70
0b1100
```

Supported forms:

```tsx
123
123.456
1e9
1.5e-3
0xff
0o755
0b1010
```

Underscores may be used for readability:

```tsx
1_000_000
```

Underscores do not affect the value.

---

# 6. Bigint

The `bigint` type represents arbitrary-size integers.

A bigint literal uses the same syntax as a number literal, followed by `n`.

```tsx
1n
1_000_000n

0xffn
0o70n
0b1100n
```

Unlike `number`, bigint values cannot represent fractional values.

The following is invalid:

```tsx
1.5n
```

---

# 7. Boolean

The `boolean` type has exactly two values:

```tsx
true
false
```

Only values of type `boolean` may be used in conditionals and logical operations.

The following is invalid:

```tsx
const count = 0;

if count {
	// Invalid: count is number, not boolean.
}
```

Instead, comparisons must be explicit:

```tsx
if count != 0 {
	// Valid.
}
```

---

# 8. String

The `string` type represents immutable text values.

Basic string literals use double quotes:

```tsx
"Hello"
"This is a string"
```

Strings support interpolation:

```tsx
"Hello ${name}"
```

Plain string literals do not require runtime interpolation. Interpolated strings are evaluated at runtime.

Multiline strings use repeated `\\` line prefixes that can be indented as much as needed, the text starts after the `\\` on each line:

```tsx
\\This is a
\\multiline string.
\\This supports
\\${interpolation} too.
```

---

## 8.1 Escape Sequences

The following escape sequences are supported in string literals:

| Escape sequence | Value |
|---|---|
| `\0` | U+0000 NUL |
| `\t` | U+0009 horizontal tab |
| `\n` | U+000A line feed |
| `\r` | U+000D carriage return |
| `\"` | U+0022 quotation mark |
| `\\` | U+005C backslash |

Additional Unicode escape forms are **TBD**.

---

# 9. Identifiers

Identifiers must follow these rules:

- May contain letters, digits, underscores, and `$`.
- Must not start with a digit.
- Are case-sensitive.
- Must not be reserved words.

Examples:

```tsx
name
userName
$user
_internal
value2
```

Invalid examples:

```tsx
2value
const
fn
if
```

Unicode identifiers are **TBD**.

---

# 10. Reserved Words

The following words are reserved:

```tsx
and
as
bigint
boolean
break
comptime
const
continue
else
enum
false
fn
if
impl
let
match
number
or
return
string
trait
true
type
unknown
while
```

Additional reserved words may be added as the language evolves.

---

# 11. Variables

The language has two variable declaration forms:

```tsx
const
let
```

A `const` binding cannot be reassigned.

A `let` binding can be reassigned.

Variables must be initialized when declared.

```tsx
const name: string = "Ada";
let count: number = 0;
```

The following is invalid:

```tsx
let count: number;
```

---

## 11.1 Type Inference

Type annotations may be omitted when the type can be inferred from the initializer.

```tsx
const pi = 3.14;       // number
const name = "Ada";    // string
const active = true;   // boolean
```

---

## 11.2 Reassignment

Only `let` bindings may be reassigned.

```tsx
let count = 0;
count = count + 1;
```

The following is invalid:

```tsx
const count = 0;
count = count + 1;
```

---

## 11.3 Shadowing

The initial compiler MVP does not allow a declaration to reuse a name that is
already declared in the same scope or in an outer scope.

More expressive shadowing behavior is **TBD**, including Rust-style variable
redeclaration shadowing where a name may be redeclared to produce a new binding,
possibly with a different type.

Potential options:

1. Allow shadowing in inner scopes.
2. Disallow shadowing entirely.
3. Allow explicit shadowing using a dedicated syntax.
4. Allow same-scope variable redeclaration shadowing.

---

# 12. Statements and Semicolons

Statements must end with semicolons.

```tsx
const a = 1;
const b = 2;
```

Some constructs contain blocks that may evaluate to a value. In such blocks, the final expression must not have a semicolon.

```tsx
const sum = {
	const a = 1;
	const b = 2;
	a + b
};
```

A final expression with a semicolon is treated as a statement and its value is discarded.

---

# 13. Blocks

A block is a sequence of statements surrounded by braces.

```tsx
{
	const a = 1;
	const b = 2;
}
```

Blocks may be evaluable.

An evaluable block ends with an expression without a semicolon:

```tsx
{
	const a = 1;
	const b = 2;
	a + b
}
```

The value of the block is the value of the final expression.

A block without a final expression has type `void`.

```tsx
{
	const a = 1;
	const b = 2;
}
```

---

# 14. Void

The `void` type represents the absence of a meaningful value.

Functions that do not return a value have return type `void`.

```tsx
fn log(message: string): void {
	console.log(message);
}
```

`void` values cannot be meaningfully inspected or compared.

---

# 15. Operators

---

## 15.1 Arithmetic Operators

Arithmetic operators operate on numeric values.

```tsx
1 + 2.0
5 - 1.5
2 * 3
6 / 2
7 % 3
2 ** 8
```

Initial supported signatures:

```tsx
number + number = number
number - number = number
number * number = number
number / number = number
number % number = number
number ** number = number

bigint + bigint = bigint
bigint - bigint = bigint
bigint * bigint = bigint
bigint / bigint = bigint
bigint % bigint = bigint
```

Mixing `number` and `bigint` is invalid without explicit conversion.

```tsx
1 + 2n // Invalid.
```

Bigint exponentiation is **TBD**.

Division behavior for bigint is **TBD**.

---

## 15.2 Comparison Operators

Comparison operators can only be applied to values with compatible types and
supported comparison operations.

```tsx
1 == 1
3 != 1
5 > 3
5 >= 5
4 < 7
8 <= 9
```

Supported ordering signatures:

```tsx
number > number = boolean
number >= number = boolean
number < number = boolean
number <= number = boolean

bigint > bigint = boolean
bigint >= bigint = boolean
bigint < bigint = boolean
bigint <= bigint = boolean
```

Ordering is not supported for `boolean`, `string`, arrays, objects, functions,
or mixed `number`/`bigint` operands.

Ordering support for future user-defined types is **TBD**.

Equality support is type-specific:

- primitive values may be compared with `==` and `!=`,
- fieldless enum values may be compared with `==` and `!=` when both operands
  have the same enum type,
- object values cannot be compared with `==` or `!=`,
- array values cannot be compared with `==` or `!=`,
- function values cannot be compared with `==` or `!=`,
- equality for enums with associated data, `Option`, `Result`, and other
  user-defined types is **TBD**.

For primitive values, comparisons follow the language's own semantics.

Comparing unrelated types is invalid:

```tsx
1 == "1" // Invalid.
```

Because equality does not perform implicit coercion, there is no `===` operator.

Objects and arrays cannot be compared with `==` or `!=`.

```tsx
const a = { x: 1 };
const b = { x: 1 };
a == b // Invalid.
```

```tsx
const xs = [1];
const ys = [1];
xs == ys // Invalid.
```

Use explicit functions for reference or structural comparison.

```tsx
sameRef(a, b)
deepEqual(a, b)
User.equals(a, b)
```

Exact standard-library names for these operations are **TBD**.

---

## 15.3 Logical Operators

Logical operators only operate on booleans.

```tsx
true and true
false or true
!true
```

Supported signatures:

```tsx
boolean and boolean = boolean
boolean or boolean = boolean
!boolean = boolean
```

Unlike JavaScript’s `&&` and `||`, `and` and `or` do not return arbitrary operand values.

The following is invalid:

```tsx
const value = name or "Anonymous";
```

Use explicit optional/defaulting operators for optional values.

---

## 15.4 Assignment Operators

Basic assignment:

```tsx
x = value;
```

Compound assignment is supported for numeric values:

```tsx
x += 1;
x -= 1;
x *= 2;
x /= 2;
x %= 2;
```

Compound assignment may target bindings, object fields, or array elements when
the target value and right-hand side have the same numeric type.

Additional compound operators are **TBD**.

---

## 15.5 String and Array Concatenation

The `++` operator concatenates strings and arrays.

```tsx
"Hello, " ++ "world"
[1] ++ [2, 3]
```

Supported signatures:

```tsx
string ++ string = string
[]T ++ []T = []T
```

For arrays, both operands must contain the same element type.

```tsx
[1] ++ ["x"] // Invalid.
```

---

# 16. Arrays

Arrays are ordered collections of values of the same type.

```tsx
const empty = [];
const numbers = [1, 2, 3];
```

The type syntax for arrays places brackets before the element type:

```tsx
[]number
[]string
[]User
```

Example:

```tsx
const numbers: []number = [1, 2, 3];
```

The type of an empty array cannot always be inferred:

```tsx
const values = []; // Invalid unless context determines the element type.
```

Valid examples:

```tsx
const values: []number = [];
const other: []number = []number{};
```

Literal syntax for explicitly typed empty arrays is **TBD**.

---

## 16.1 Array Length

Arrays expose their length as a property:

```tsx
numbers.length
```

`length` currently has type `number`.

A dedicated array index type is desirable. A likely name is:

```tsx
Index
```

Whether `length` should continue to return `number` or eventually return
`Index` is **TBD**.

The conversion model between `number`, `Index`, and any future integer types is
**TBD**.

---

## 16.2 Array Indexing

Array indexing uses square brackets:

```tsx
const first = numbers[0];
```

Indexing is checked by default.

If the index is out of bounds, the program panics.

```tsx
const value = numbers[index]; // Type: number. Panics if index is invalid.
```

The current JavaScript backend emits a runtime bounds check for this operation
and accepts integer-valued `number` indexes. Negative, fractional, `NaN`, and
out-of-bounds indexes panic at runtime.

The intended long-term direction is that arbitrary `number` values should not
necessarily be valid indexes. Integer literals may be allowed in index contexts:

```tsx
values[0]
```

But the following should be rejected or checked:

```tsx
values[1.5] // Invalid or checked.
values[-1]  // Invalid or checked.
```

This operation does not return `undefined`.

Array indexing never produces an untyped missing value.

Array elements may be assigned by index:

```tsx
values[0] = "Ada";
```

Index assignment checks index validity at runtime under the same rules as index
access. Invalid indexes panic. The assigned value must be compatible with the
array element type.

In the MVP, array values are mutable sequence values. `const` and `let` control
whether a binding can be reassigned; they do not freeze or deeply mutate the
array value itself.

---

## 16.3 Safe Array Access

Safe array access returns an optional value.

```tsx
const value = numbers.get(index);
```

The type of `get` is:

```tsx
fn get(index: number): Option<T>
```

The final parameter type may become `Index`.

Example:

```tsx
const label = match numbers.get(index) {
	.Some(value) => "Value: ${value}",
	.None => "No value",
};
```

---

## 16.4 Unsafe Array Access

An explicit unsafe indexing operation may be added later for performance-critical code.

Possible syntax:

```tsx
const value = numbers.unsafeGet(index);
```

or:

```tsx
const value = unsafe numbers[index];
```

This is **TBD**.

Safe code must not rely on unchecked indexing.

---

## 16.5 Bounds Checks and Build Modes

The language may support multiple build modes, such as:

- development mode,
- safe production mode,
- performance mode.

Build modes may affect:

- amount of runtime checking,
- diagnostic quality,
- panic messages,
- emitted debugging metadata,
- optimization level.

However, build modes must not silently change the meaning of safe code.

Checked operations remain checked unless the compiler can prove the check unnecessary.

Example:

```tsx
let i = 0;

while i < numbers.length {
	const value = numbers[i]; // Compiler may prove this access is safe.
	i += 1;
}
```

Explicit unsafe operations are the mechanism for opting out of checks.

---

# 17. Objects

Objects are fixed-shape structured values.

They resemble JavaScript object literals syntactically but are semantically closer to structs.

```tsx
const user = {
	id: "1",
	name: "Ada",
	active: true,
};
```

Properties are accessed with dot notation:

```tsx
user.name
```

Objects cannot be used as hash maps. Use a `Map` type for dynamic key/value storage.

Dynamic property access is **TBD**.

## 17.1 Mutability

In the MVP, object and array values use JavaScript-like runtime mutability.
`const` and `let` control binding mutability, not deep value mutability:

- `const` prevents rebinding,
- `let` allows rebinding,
- object fields may be assigned when the field is known and the value type is
  compatible,
- array elements may be assigned when the index and element value are valid.

`const` does not freeze the object or array value.

```tsx
const user = {
	name: "Ada",
};

user = { name: "Grace" }; // Invalid: rebinding a const binding.
user.name = "Grace";     // Valid: mutating the object value.
```

`let` permits rebinding the variable. It does not make nested values more or
less mutable than they otherwise are.

```tsx
let user = {
	name: "Ada",
};

user = { name: "Grace" }; // Valid: rebinding a let binding.
user.name = "Lovelace";   // Valid: mutating the object value.
```

Property assignment requires the property to be known on the object's static type
and the assigned value to be compatible with the property type.

```tsx
type User = {
	name: string,
};

const user: User = {
	name: "Ada",
};

user.name = "Grace"; // Valid.
user.email = "a@example.com"; // Invalid: User has no field email.
user.name = 42; // Invalid: name has type string.
```

Mutation through function parameters is allowed in the MVP because object and
array values are reference-like values at runtime.

```tsx
fn rename(user: User): void {
	user.name = "Grace";
}
```

Readonly fields, immutable collection types, ownership, borrowing, and deeper
immutability controls are deferred.

---

## 17.2 Object Types

Object types are written with property names and types:

```tsx
type User = {
	id: string,
	name: string,
	active: boolean,
};
```

Example:

```tsx
const user: User = {
	id: "1",
	name: "Ada",
	active: true,
};
```

---

## 17.3 Structural Typing

Object types are structural.

A value is compatible with an object type if it has the required fields with compatible types.

```tsx
type Named = {
	name: string,
};

const user = {
	id: "1",
	name: "Ada",
};

fn greet(value: Named): string {
	"Hello ${value.name}"
}

greet(user);
```

Extra fields are allowed when assigning to a narrower structural type.

Fresh object literals assigned directly to an annotated object type are checked
exactly. Missing fields and excess fields are rejected.

```tsx
const named: Named = {
	id: "1", // Invalid: fresh object literal has excess field id.
	name: "Ada",
};
```

The current compiler MVP parses and checks object type declarations, object
literals, structural object assignability, known-field property access, and
known-field property assignment.

---

## 17.4 Property Access Safety

Accessing a property that is not known to exist on a type is invalid.

```tsx
type User = {
	name: string,
};

fn getEmail(user: User): string {
	user.email // Invalid: User has no field email.
}
```

Property access never produces `undefined`.

---

# 18. Optional Values

The language does not expose JavaScript `null` or `undefined` as ordinary values.

Missing or optional values are represented explicitly using `Option<T>`.

`Option` is a generic enum type, following section 25:

```tsx
type Option<T> = enum {
	Some(T),
	None,
};
```

It is considered a fundamental standard-library type. Until generic type
declarations are implemented, `Option<T>` may be treated as a built-in
generic enum type. It follows the normal enum construction and match rules.

A shorthand surface syntax for optional types — `string?` for `Option<string>`
— is **TBD**. See section 18.2.

---

## 18.1 Option Values

Option values represent either the presence or absence of a value.

```tsx
const value: Option<string> = .Some("Ada");
const none: Option<string> = .None;
```

Example:

```tsx
const name = match user.nickname {
	.Some(value) => value,
	.None => "Anonymous",
};
```

---

## 18.2 Optional Object Fields

Optional object fields are **TBD**.

Possible syntax:

```tsx
type User = {
	id: string,
	name: string,
	email: string?,
};
```

This would be equivalent to:

```tsx
type User = {
	id: string,
	name: string,
	email: Option<string>,
};
```

The field itself would always exist semantically; its value would be optional.

---

## 18.3 Defaulting Operator

A defaulting operator may be added for `Option<T>`.

Possible syntax:

```tsx
const name = user.nickname ?? "Anonymous";
```

This is **TBD**.

---

# 19. Result Values and Error Handling

The language does not use exceptions for ordinary recoverable errors.

Recoverable errors are represented explicitly using `Result<T, E>`.

`Result` is a generic enum type, following section 25:

```tsx
type Result<T, E> = enum {
	Ok(T),
	Err(E),
};
```

It is considered a fundamental standard-library type. Until generic type
declarations are implemented, `Result<T, E>` may be treated as a built-in
generic enum type. It follows the normal enum construction and match rules.

```tsx
const result: Result<number, NumberError> = .Ok(42);
const error: Result<number, NumberError> = .Err(NumberError.Invalid);
```

---

## 19.1 Returning Results

Functions that may fail return a result.

```tsx
type ParseError = enum {
	InvalidNumber,
	OutOfRange,
};

fn parsePort(input: string): Result<number, ParseError> {
	// ...
}
```

---

## 19.2 Try Operator

The language may support a `try` operator for early-returning errors.

```tsx
fn loadUser(id: string): Result<User, LoadUserError> {
	const raw = try fetchUserJson(id);
	const user = try parseUser(raw);
	user
}
```

The behavior of `try expr` is:

- if `expr` evaluates to `.Ok(value)`, the expression evaluates to `value`;
- if `expr` evaluates to `.Err(error)`, the current function returns `.Err(error)`.

The exact typing and error-conversion rules are **TBD**.

---

## 19.3 Panic

A panic represents a programmer error or violated invariant. Panics are not
intended for ordinary recoverable errors — those are modeled with `Result`
(section 19).

Operations that panic include:

- checked array indexing out of bounds (section 16.2),
- explicit failed assertions,
- unreachable code paths (for example, exhaustiveness violations the checker
  could not prove at compile time and that occur at runtime through external
  data).

A panic produces an instance of the runtime class `PolenaPanic` and
terminates the current execution path. The instance carries:

- a human-readable message describing the panic,
- a kind tag identifying the panic category,
- the source span of the panicking operation when available.

For the JavaScript target, `PolenaPanic` is a subclass of the JavaScript
`Error` class. It is thrown by the runtime at the panic site. Polena has no
`try`/`catch` syntax that can intercept a `PolenaPanic`; the only way to
observe one from within Polena is by crossing the JavaScript interop
boundary (section 29), at which point JavaScript code is free to catch the
underlying `Error` like any other.

A program that panics is considered to have failed. The exit behavior of a
panicked program depends on the runtime environment and is not part of the
language proper.

Custom user-thrown panics, panic-from-`main` return-type conventions, and
the relationship between panics and async unwinding are **TBD**.

---

# 20. Enums

An enum is a nominal type with a fixed set of variants.

```tsx
type Color = enum {
	Red,
	Green,
	Blue,
};
```

Each enum declaration introduces a distinct nominal type. Enum types are not
structurally compatible with other enum types, even if they have the same
variant names and payload shapes.

```tsx
type UserKind = enum {
	Admin,
	Member,
};

type AccountKind = enum {
	Admin,
	Member,
};

const kind: UserKind = UserKind.Admin;
const other: AccountKind = kind; // Invalid.
```

Enum variants are scoped to their enum type. A variant name alone is not a
value.

```tsx
const red = Color.Red;
const alsoRed = Red; // Invalid.
```

`Color.Red` is enum variant syntax. It does not imply that `Color` exists as a
runtime object or metadata value.

```tsx
const value = Color; // Invalid.
const names = Color.names; // Invalid.
```

Runtime metadata for enum types is not emitted automatically. Enum reflection,
if provided, must be explicit:

```tsx
const names = @enumVariantNames(Color);
```

A fieldless variant is a singleton value of its enum type.

```tsx
const red = Color.Red;
```

The runtime representation of enum values is implementation-defined. Programs
must not depend on the emitted JavaScript representation of enum values.

For the current JavaScript target, enum values are emitted as tagged plain
objects of the form `{ tag: "VariantName" }` for fieldless variants and
`{ tag: "VariantName", payload: [...] }` for variants with associated data.
This is an informative description and may change without notice; programs
that introspect this shape are non-conforming.

When the enum type is known from context, the enum name may be omitted:

```tsx
const blue: Color = .Blue;
```

The shorthand form `.Variant` may be used only where the expected enum type is
known from context.

```tsx
const color = .Red; // Invalid: expected enum type is unknown.
```

---

## 20.1 Associated Data

Enum variants may carry associated data using positional fields.

```tsx
type Message = enum {
	Move(number, number),
	Write(string),
	Quit,
};

const move = Message.Move(10, 20);
const write = Message.Write("hello");
const quit = Message.Quit;
```

Associated-data variants are constructed with call syntax. The number and types
of constructor arguments must match the variant declaration exactly.

```tsx
Message.Move(10); // Invalid.
Message.Move("x", "y"); // Invalid.
```

Shorthand construction is allowed when the expected enum type is known:

```tsx
const move: Message = .Move(10, 20);
const quit: Message = .Quit;
```

Enum variants do not support named associated fields. Use a single object
payload when named data is desired.

```tsx
type Message = enum {
	Move { x: number, y: number }, // Invalid.
};
```

```tsx
type Message = enum {
	Move({ x: number, y: number }),
	Write(string),
	Quit,
};

const message = Message.Move({ x: 10, y: 20 });
```

Named constructor syntax is not supported.

```tsx
const message = Message.Move { x: 10, y: 20 }; // Invalid.
```

Variants with associated data are not first-class constructor functions in the
MVP. They may only be used directly in construction syntax.

```tsx
const move = Message.Move(1, 2); // Valid.

const makeMove = Message.Move; // Invalid in MVP.
const alsoMove = makeMove(1, 2);
```

---

# 21. Match Expressions

`match` evaluates a value against patterns.

It is primarily used with enums, `Option`, and `Result`.

The current compiler supports expression-valued match arms over enum variants.
Block arms and guards are not implemented yet.

```tsx
const label = match color {
	.Red => "red",
	.Green => "green",
	.Blue => "blue",
};
```

Qualified enum variant patterns are also supported:

```tsx
const label = match color {
	Color.Red => "red",
	Color.Green => "green",
	Color.Blue => "blue",
};
```

For variants with associated data, payload patterns list one pattern per
associated field:

```tsx
const text = match message {
	.Move(x, y) => "Move to ${x}, ${y}",
	.Write(value) => value,
	.Quit => "Quit",
};
```

Fieldless variants match without parentheses. Payload variants match with
parentheses, and a payload variant pattern must list exactly one pattern per
associated field. The wildcard pattern `_` can ignore a whole value or an
individual payload field.

```tsx
const label = match message {
	.Move(_, _) => "move",
	.Write(_) => "write",
	.Quit => "quit",
};
```

These patterns are invalid:

```tsx
match message {
	.Move(x) => "move", // Invalid: Move has two fields.
	.Write => "write", // Invalid: Write has one field.
	.Quit() => "quit", // Invalid: Quit has no fields.
}
```

When an enum variant uses an object payload, the payload is matched as a single
field. Destructuring, if added, is separate from enum syntax.

```tsx
const label = match message {
	.Move(pos) => "Move to ${pos.x}, ${pos.y}",
	.Write(value) => value,
	.Quit => "Quit",
};
```

Pattern bindings are scoped to the arm body. They follow the language's normal
binding and shadowing rules.

```tsx
const label = match message {
	.Write(text) => text,
	.Quit => "",
	.Move(x, y) => "${x}, ${y}",
};

text // Invalid.
```

Because shadowing is disallowed in the MVP, pattern bindings must not shadow
outer names.

```tsx
const text = "outer";

const label = match message {
	.Write(text) => text, // Invalid in MVP: shadows outer binding.
	_ => "",
};
```

---

## 21.1 Exhaustiveness

Matches over enums must be exhaustive.

```tsx
type Color = enum {
	Red,
	Green,
	Blue,
};

const label = match color {
	.Red => "red",
	.Green => "green",
	// Invalid: missing .Blue
};
```

The wildcard pattern `_` matches any remaining value:

```tsx
_ => "unknown"
```

Exhaustiveness is checked by variant. For payload variants, matching the
variant covers all possible payload values unless guards or nested patterns are
introduced later.

```tsx
type Message = enum {
	Move(number, number),
	Write(string),
	Quit,
};

const label = match message {
	.Move(x, y) => "move",
	.Write(value) => "write",
	.Quit => "quit",
}; // Exhaustive.
```

Duplicate match patterns are invalid. Match arms that can never be reached are
invalid.

```tsx
const label = match color {
	.Red => "red",
	.Red => "also red", // Invalid.
	.Green => "green",
	.Blue => "blue",
};
```

```tsx
const label = match color {
	_ => "anything",
	.Red => "red", // Invalid: unreachable.
};
```

---

## 21.2 Match Result Type

All match branches must evaluate to compatible types.

```tsx
const label = match color {
	.Red => "red",
	.Green => "green",
	.Blue => "blue",
};
```

The result type is `string`.

This is invalid:

```tsx
const value = match color {
	.Red => "red",
	.Green => 1,
	.Blue => true,
};
```

---

# 22. Control Flow

---

## 22.1 If Expressions

`if` is an expression.

The condition must be a `boolean`.

```tsx
const result = if 1 > 0 {
	"1 is greater than 0"
} else {
	"Impossible"
};
```

Parentheses around the condition are optional:

```tsx
if condition {
	// ...
}

if (condition) {
	// ...
}
```

For style consistency, the formatter may prefer one form. The canonical style is **TBD**.

---

## 22.2 If Branch Types

If an `if` expression is used as a value, all branches must evaluate to compatible types.

```tsx
const value = if enabled {
	1
} else {
	0
};
```

The following is invalid:

```tsx
const value = if enabled {
	1
} else {
	"no"
};
```

If an `if` is used as a statement and does not evaluate to a value, branch types may be `void`.

---

## 22.3 Else Requirement

If an `if` expression is used as a value, it must have an `else` branch.

```tsx
const value = if condition {
	1
}; // Invalid.
```

An `if` used as a statement may omit `else`.

```tsx
if condition {
	doSomething();
}
```

---

## 22.4 While Loops

A basic `while` loop repeats while its condition is true.

```tsx
while condition {
	// ...
}
```

The condition must be a `boolean`.

---

## 22.5 Break and Continue

Loops support `break` and `continue`.

```tsx
while condition {
	if shouldSkip {
		continue;
	}

	if shouldStop {
		break;
	}
}
```

---

## 22.6 While Continue Expression

A `while` loop may have a continue expression, inspired by Zig.

```tsx
let i = 0;

while i < end : (i += 1) {
	// Loop body.
}
```

The continue expression is executed after each iteration, including when `continue` is used.

Precise ordering rules are **TBD**.

---

## 22.7 While as Expression

A `while` loop may evaluate to a value by using `break value`.

```tsx
let i = 0;

const found = while i < items.length : (i += 1) {
	if items[i] == target {
		break true;
	}
} else {
	false
};
```

Rules:

- `break value` exits the loop with a value.
- The `else` block is evaluated if the loop condition becomes false normally.
- The `else` block is not evaluated if the loop exits using `break`.
- If a `while` is used as an expression, all possible exit values must have compatible types.

This feature is included but may be deferred in implementation.

---

# 23. Functions

Functions are declared using `fn`.

```tsx
fn add(a: number, b: number): number {
	a + b
}
```

Syntax:

```tsx
fn name(argName: ArgType, otherArg: OtherType): ReturnType {
	// body
}
```

The return type may be inferred when possible:

```tsx
fn add(a: number, b: number) {
	a + b
}
```

Return type inference rules are **TBD**.

---

## 23.1 Function Return Values

A function returns:

1. the value of an explicit `return` statement, or
2. the final expression of the function body if present.

```tsx
fn add(a: number, b: number): number {
	a + b
}
```

Equivalent explicit form:

```tsx
fn add(a: number, b: number): number {
	return a + b;
}
```

A function with no returned value has type `void`.

```tsx
fn log(message: string): void {
	console.log(message);
}
```

---

## 23.2 Return Statements

A `return` statement exits the current function.

```tsx
fn abs(value: number): number {
	if value < 0 {
		return -value;
	}

	value
}
```

A return statement must end with a semicolon.

```tsx
return value;
```

---

## 23.3 Anonymous Functions

Anonymous functions use `fn` without a name.

```tsx
const double = fn (value: number): number {
	value * 2
};
```

Return types may be inferred:

```tsx
const double = fn (value: number) {
	value * 2
};
```

Anonymous functions may be passed directly:

```tsx
const names = users.map(fn (user) {
	user.name
});
```

Arrow functions are not part of the language.

---

## 23.4 Function Types

Function type syntax is **TBD**.

Possible syntax:

```tsx
fn(number, number): number
```

Example:

```tsx
const op: fn(number, number): number = fn (a, b) {
	a + b
};
```

---

# 24. Type Declarations

All named types are declared using `type`.

```tsx
type User = {
	id: string,
	name: string,
};
```

Supported type declarations:

```tsx
type Name = string;

type User = {
	id: string,
	name: string,
};

type Color = enum {
	Red,
	Green,
	Blue,
};
```

There are no separate user-facing constructs like TypeScript's `interface`,
`class`, and `type` split.

Types are primarily compile-time constructs. Runtime metadata for types is not
emitted automatically.

Type names and value names may overlap. Types and values are resolved in the
namespace required by the syntactic context.

```tsx
type User = {
	id: string,
};

const User = "not a type";

const label: User = {
	id: User,
};
```

In the example above, `User` in the type annotation refers to the type, while
`User` in the initializer refers to the value.

Type aliases are transparent unless otherwise specified.

Nominal type aliases/newtypes are **TBD**.

Type declarations may also introduce generic type parameters. See section 25.

The current compiler MVP supports transparent aliases to existing types:

```tsx
type Score = number;
type Scores = []Score;
```

Object type bodies, enum type bodies, and generic type parameters are part of
the language direction but are not implemented in the MVP.

---

# 25. Generics

Polena supports a basic form of generics: **generic type declarations**.

A generic type declaration introduces one or more type parameters in angle
brackets after the type name:

```tsx
type Pagination<T> = {
	data: []T,
	page: number,
};

type Pair<A, B> = {
	first: A,
	second: B,
};

type Option<T> = enum {
	Some(T),
	None,
};

type Result<T, E> = enum {
	Ok(T),
	Err(E),
};
```

Type parameters are nominal names. Their scope is the body of the declaration
that introduces them. They may be used anywhere a type is expected inside the
body, including object field types, enum variant payloads, array element
types, and as type arguments to other generic types.

```tsx
type Tree<T> = enum {
	Leaf(T),
	Node([]Tree<T>),
};
```

Type parameters do not introduce value-level bindings. A bare type parameter
name is not a value.

Type parameter names must be unique within a single declaration:

```tsx
type Bad<T, T> = ...; // Invalid: duplicate type parameter T.
```

A type parameter shadows a same-named outer type within the body of the
declaration.

The intended direction is simple, predictable generics rather than
TypeScript-style advanced type-level programming. Higher-kinded types,
variance annotations, conditional types, mapped types, and arbitrary
type-level computation are non-goals.

---

## 25.1 Instantiation

A generic type is used by supplying type arguments in angle brackets:

```tsx
type UserPage = Pagination<User>;

const page: Pagination<User> = {
	data: [],
	page: 1,
};

const opt: Option<string> = .Some("Ada");
const result: Result<number, ParseError> = .Ok(42);
```

The number of type arguments must match the number of declared type
parameters exactly.

```tsx
const page: Pagination = ...; // Invalid: missing type argument.
const page: Pagination<User, number> = ...; // Invalid: too many type arguments.
```

A bare reference to a generic type name in a type position, without
arguments, is invalid.

Type arguments may themselves be any valid type, including other
instantiations of generic types.

```tsx
const nested: Option<Option<number>> = .Some(.Some(1));
const pages: []Pagination<User> = [];
```

Applying type arguments to a non-generic type is invalid:

```tsx
type Score = number;
const s: Score<string> = ...; // Invalid: Score has no type parameters.
```

---

## 25.2 Generic Enums

When a generic type declaration has an enum body, its variants are
instantiated along with the type. A variant's payload types are obtained by
substituting the declaration's type arguments for its type parameters.

```tsx
type Option<T> = enum {
	Some(T),
	None,
};

const one: Option<number> = Option.Some(1);
const name: Option<string> = .Some("Ada");
const empty: Option<number> = .None;
```

Enum variant construction follows the rules in section 20.1. The compiler
substitutes type arguments when checking payload types against variant
declarations.

For shorthand construction `.Variant(payload)`, the expected enum type
determines the type arguments. For qualified construction
`EnumName.Variant(payload)` without an expected type from context, the
compiler infers the type arguments from the payload values.

```tsx
const one = Option.Some(1);     // Inferred Option<number>.
const name = Option.Some("Ada"); // Inferred Option<string>.
```

When the type arguments cannot be uniquely determined from context or
payload values, an explicit annotation is required.

```tsx
const empty = Option.None; // Invalid: cannot determine type argument T.
const empty: Option<number> = .None; // Valid.
```

Explicit type-argument syntax at construction sites, such as
`Option<number>.Some(1)`, is **TBD**.

---

## 25.3 Generic Match Patterns

When matching against a value of an instantiated generic enum type, payload
patterns bind values whose types are the substituted variant payload types.

```tsx
const opt: Option<number> = .Some(1);

const label = match opt {
	.Some(value) => "got ${value}", // value: number
	.None => "nothing",
};
```

Exhaustiveness and arity rules from section 21 apply unchanged. Type
substitution is performed before patterns are checked against variant
payloads.

---

## 25.4 Type Identity

Two instantiations of the same generic type are identical when their type
arguments are identical.

```tsx
type Pair<A, B> = { first: A, second: B };

const p1: Pair<string, number> = { first: "a", second: 1 };
const p2: Pair<string, number> = p1; // Valid: same instantiation.
const p3: Pair<number, string> = p1; // Invalid: different instantiation.
```

Type aliases remain transparent (section 24). A type alias whose right-hand
side mentions type parameters is itself a generic type declaration.

```tsx
type StringPair<V> = Pair<string, V>;
```

Generic enum instantiations follow the nominal typing rule from section 20.
Two distinct generic enum declarations produce incompatible instantiations
even when their type arguments are the same.

---

## 25.5 Generic Functions

A function may declare type parameters in angle brackets immediately after
its name:

```tsx
fn first<T>(items: []T): Option<T> {
	// ...
}

fn pair<A, B>(a: A, b: B): Pair<A, B> {
	{ first: a, second: b }
}
```

Type parameters are nominal names. Their scope is the function's signature
and body. They may be used anywhere a type is expected, including parameter
types, the return type, and inside local declarations.

The uniqueness and shadowing rules from the start of section 25 apply:
parameter names must be distinct within a single function, and they shadow
same-named outer types within the function.

A generic function is called like any other function. Type arguments may be
supplied explicitly:

```tsx
const opt = first<number>(myArray);
```

When type arguments are omitted, the compiler infers them by unifying the
argument expressions' types against the parameter types declared in the
signature:

```tsx
const items: []string = ["a", "b"];
const opt = first(items); // Inferred: T = string.
```

If a type parameter cannot be uniquely determined from the call arguments,
an explicit type-argument list is required:

```tsx
fn make<T>(): Option<T> { .None }

const opt = make();                  // Invalid: cannot infer T.
const opt = make<number>();          // Valid.
const opt: Option<number> = make();  // Valid: inferred from context.
```

The number of explicit type arguments must match the number of declared type
parameters. Mismatches are invalid.

Type parameters are erased at compile time. The JavaScript emit for a
generic function is a single non-generic JavaScript function; calls to it
carry no type-argument information at runtime.

Constraints on type parameters remain **TBD** (section 25.6).

---

## 25.6 Constraints

Type parameter constraints are **TBD**. Constraints are expected to be
designed together with traits (section 26): the only meaningful constraints
in a language without traits are structural, and structural constraints
would need to be reconciled with whatever trait mechanism is added later.

---

# 26. Traits

Classes are not part of the core language.

Shared behavior may eventually be modeled using traits.

Possible syntax:

```tsx
trait Display {
	fn display(self): string;
}

impl Display for User {
	fn display(self): string {
		self.name
	}
}
```

Traits are **TBD** and may be deferred.

The likely initial approach is to start with plain functions and defer methods,
associated functions, `impl` blocks, and traits until the core language is more
stable.

---

# 27. Classes

User-defined classes are not part of the initial language.

The language may eventually support consuming JavaScript classes through interop declarations.

Example direction:

```tsx
declare type AbortController = extern object {
	signal: AbortSignal,
	fn abort(): void,
};

declare fn AbortController.new(): AbortController;
```

Class interop is **TBD**.

---

# 28. Unknown

The `unknown` type represents a value whose type is not statically known.

It is mainly intended for future JavaScript interop and dynamic data parsing.

Values of type `unknown` cannot be used directly.

```tsx
fn parseJson(input: string): Result<unknown, JsonError> {
	// ...
}
```

To use an `unknown` value, it must be validated, matched, or converted.

Exact rules are **TBD**.

---

# 29. JavaScript and TypeScript Interop

Interop is not part of the initial core, but the language is designed with JavaScript output and TypeScript ecosystem compatibility in mind.

Planned interop features:

- import JavaScript/TypeScript modules,
- consume compatible declaration files,
- generate TypeScript declaration files,
- optionally convert `.d.ts` files into the language’s own declaration format,
- represent unsafe/dynamic values as `unknown`,
- map `null` and `undefined` at boundaries into `Option<T>` where possible.

---

## 29.1 Native Declaration Files

The language may define its own declaration file format for external modules.

Possible syntax:

```tsx
declare module "slugify" {
	export fn slugify(input: string): string;
}
```

A converter may transform compatible `.d.ts` files into native declarations.

Unsupported TypeScript constructs may be converted to `unknown` or rejected.

This is **TBD**.

---

# 30. Modules and Packages

Polena code is organized into modules and packages.

A **module** is a single source file. A **package** is a directory of related
modules, identified by a `polena.toml` configuration file.

---

## 30.1 Modules

Each `.plna` file is a module. The filesystem layout determines the module
tree directly: there are no separate `mod` declarations.

A module body contains only declarations:

- `import` declarations,
- `type` declarations,
- `const` declarations (initializer must be a compile-time constant),
- `fn` declarations.

Free-standing statements and expressions at module scope are invalid.
Statements and expressions can only appear inside declaration bodies.

```tsx
const greeting = "Hello"; // OK: declaration with literal initializer.

println(greeting); // Invalid: free-standing expression at module scope.

fn run(): void {
	println(greeting); // OK: inside a function body.
}
```

Top-level `const` initializers must be evaluable at compile time. Function
calls and other runtime expressions are not permitted at module scope:

```tsx
const port = 8080;     // OK.
const env = readEnv(); // Invalid: runtime expression.
```

The initial set of compile-time-constant initializers includes:

- literal values (numbers, strings, booleans),
- references to other compile-time `const` bindings,
- arithmetic, comparison, and logical operators applied to compile-time
  constants,
- enum variant constructors applied to compile-time constants,
- array and object literals whose elements and fields are compile-time
  constants.

Compile-time evaluation beyond this set is **TBD** (section 32).

---

## 30.2 Module Names and Paths

A module's name is its path from the package's `src/` directory, with `/` as
the separator and no file extension. Modules inside the current package are
referenced with the `@/` prefix:

```
my_app/
    polena.toml
    src/
        index.plna          → module @/
        utils.plna          → module @/utils
        users/
            index.plna      → module @/users
            roles.plna      → module @/users/roles
```

An `index.plna` file represents its containing directory as a module. The
directory's path is the module's name; there is no `/index` segment in any
import path. A package's root entry module is therefore `src/index.plna`,
referenced internally as `@/`.

A directory must not contain both a file `<name>.plna` and a directory
`<name>/` whose `index.plna` would resolve to the same module name. Such a
conflict is an error.

A module's name is stable. It does not change based on which file imports it.

Import paths always begin with a reserved or package-rooted prefix
(section 30.4). Relative paths are not used.

External consumers reference a package's root module using the package name.
Submodules are reached by suffixing the path (section 30.4).

---

## 30.3 Visibility

Declarations are private to their module by default. The `export` keyword
makes a declaration available to other modules:

```tsx
export fn parseUser(input: string): Result<User, ParseError> {
	// ...
}

export type User = {
	id: string,
	name: string,
};

fn helper(): void {
	// Module-private.
}
```

`export` may appear on `fn`, `const`, and `type` declarations.

Re-exports (forwarding an imported name to a module's public surface) are
**TBD**.

A type may be exported while its constructors remain private. The exact syntax
and rules for opaque types are **TBD**.

---

## 30.4 Imports

`import` declarations bring names from other modules into scope.

Import paths begin with one of:

- `@/` — the current package,
- `@std/` — the standard library,
- a package name from the workspace or dependencies.

```tsx
import @/utils/parse;        // intra-package
import @std/io;              // standard library
import some_dep/foo;         // external dependency
```

The `@` sigil is also used elsewhere in the language for compiler directives
(section 32). The import-path forms `@/...` and `@<name>/...` are
unambiguous in import position.

The recommended style is the **qualified import**, which makes the imported
module available under a local name:

```tsx
import @/utils/parse;

fn run(): void {
	parse.line("hello");
}
```

The local name is the last segment of the import path. An alias may be given
with `as`:

```tsx
import @/utils/parse as p;

fn run(): void {
	p.line("hello");
}
```

**Unqualified imports** pull specific names directly into the importing
module's scope. The unqualified list uses the `type` keyword to import type
names:

```tsx
import @/users.{type User, parseUser};
```

The `type` keyword is required for every type name in an unqualified list.
This keeps the type/value namespace boundary explicit at the import site.

Imported names may be aliased individually:

```tsx
import @/users.{type User as DbUser, parseUser as parse};
```

An unqualified list adds names alongside the qualified module binding. The
qualified binding is always available. An `as` clause on the import aliases
the qualified binding and appears after the unqualified list:

```tsx
import @/users.{type User, parseUser} as u;
// u.parseUser, u.User, User, and parseUser are all in scope.
```

External packages are imported by package name. A package's root module
(its `src/index.plna`) is imported with the bare package name; submodules
are reached by suffixing the path:

```tsx
import some_dep;             // some_dep's root module
import some_dep/foo;         // a submodule of some_dep
```

Importing the current package's own root module from within the package
(`import @/;` or `import @;`) is **TBD**.

There are no default exports. There are no glob (`*`) imports.

Imports must appear at the top of a module, before any other declaration.

Circular imports are invalid. Module dependency cycles are reported as errors
at every `import` statement that participates in the cycle.

---

## 30.5 Standard Library Imports

The `@std` prefix is reserved for the standard library.

Standard library modules are organized by runtime applicability:

- `@std/<module>` — modules that work in every supported runtime
  (for example `@std/option`, `@std/result`, `@std/list`, `@std/string`).
- `@std/node/<module>` — modules that only work on the Node.js runtime
  (for example `@std/node/fs`).
- `@std/browser/<module>` — modules that only work in a browser runtime
  (for example `@std/browser/dom`).

```tsx
import @std/io;
import @std/node/fs;
import @std/browser/dom;
```

A package's compilation target (a `polena.toml` field — see section 30.6
and the open question in section 38) declares which runtime namespaces it
may import from. Importing a runtime-specific module that is incompatible
with the package's compilation target is an error at the import site.

The transitive propagation rule — that a library importing a
runtime-specific module is itself constrained to that runtime and must
declare so — is **TBD**.

The full contents of the standard library are **TBD** and intentionally
small for the prototype. Until specific stdlib modules ship, the prelude
(see `docs/prelude.md`) provides a small set of names implicitly, without an
import declaration.

---

## 30.6 Packages

A package is a directory containing a `polena.toml` file and a `src/`
directory:

```
my_app/
    polena.toml
    src/
        index.plna
        ...
```

`polena.toml` contains package metadata. The minimum required form:

```toml
name = "my_app"
version = "0.1.0"
target = "executable"
```

Fields:

- **`name`** — the package name. Must be a valid Polena identifier. It is
  the prefix external consumers use to import this package (section 30.4).
- **`version`** — the package version.
- **`target`** — `"executable"` or `"library"`. Declares the package's role.
  An **executable** package must define `export fn main(): void` in its
  entry module (section 30.7). A **library** package must not define
  `main` in its entry module.
- **`runtime`** — `"node"`, `"bun"`, or `"deno"`. Optional package metadata
  used by the build system's `run` operation. It is required to run an
  executable package and ignored for libraries.

The optional `[build]` section may contain:

- **`out-dir`** — output directory for emitted JavaScript. It is resolved
  relative to the package root unless absolute and defaults to `dist`.

The `target` field declares what the package produces, not the compilation
target (browser, Node, and similar) — that concept is separate and **TBD**.

The complete manifest and package build behavior are specified in
[`docs/build-spec.md`](build-spec.md). Command-line behavior is specified in
[`docs/cli-spec.md`](cli-spec.md).

Combining library and executable roles in a single package is **TBD**.

Dependency declarations, workspaces, and other `polena.toml` fields are
**TBD**.

---

## 30.7 Entry Modules and `main`

Every package has an **entry module** at `src/index.plna`. The entry module
is fixed by convention; there is no override.

An **executable** package must define an exported `main` function in its
entry module:

```tsx
// src/index.plna

export fn main(): void {
	println("Hello");
}
```

The `main` function:

- has the signature `fn main(): void` or, when the package declares a
  CLI-capable runtime, `fn main(args: []string): void`,
- must be exported,
- is invoked exactly once when the compiled program is executed.

When `main` declares one `[]string` parameter, that parameter receives the
command-line arguments passed to the program, excluding the runtime binary and
the generated entry module path. The supported `node`, `bun`, and `deno`
runtimes are CLI-capable. Packages without a runtime, and future runtimes that
are not CLI-capable, must use `fn main(): void`.

A **library** package must not define `main` in its entry module. Its
exports form the package's public surface; external consumers reach them
via the bare package name (section 30.4).

Returning errors or explicit exit codes from `main` (for example
`fn main(): Result<void, E>`) is **TBD** and depends on the panic and
exit-code design (section 19.3).

---

## 30.8 Workspaces

A workspace groups several related packages under a single top-level
`polena.toml`. The common use is a project composed of multiple deployable
units that share library code — for example a web frontend, a backend
service, and a library of shared types and helpers.

A workspace is a directory whose top-level `polena.toml` contains a
`[workspace]` section listing its member packages:

```
my_project/
    polena.toml
    frontend/
        polena.toml
        src/
            index.plna
    backend/
        polena.toml
        src/
            index.plna
    shared/
        polena.toml
        src/
            index.plna
```

```toml
[workspace]
members = ["frontend", "backend", "shared"]
```

The workspace's top-level `polena.toml` does not declare a package. It has
no `name`, `version`, or `target` fields. Its only role is to group member
packages.

Each member is a complete package as described in section 30.6 and is
treated as such by the compiler. Members may reference each other through
dependency declarations.

Workspaces are flat: a workspace member cannot itself be a workspace.

The exact mechanism for declaring dependencies between workspace members,
and between any package and external dependencies, is **TBD**.

---

## 30.9 Interop Boundary

Polena modules do not import JavaScript or TypeScript files directly by file
path. External code is consumed through declaration files described in
section 29.

---

The current compiler MVP supports a single source file with top-level
statements and no `import`, `export`, or package configuration. Modules,
packages, workspaces, and the `main` requirement are part of the language
direction but are not implemented in the MVP.

---

# 31. Async

Async is **TBD**.

Because the language targets JavaScript and modern web development, async support is expected eventually.

Possible direction:

```tsx
async fn fetchUser(id: string): Result<User, FetchError> {
	// ...
}
```

Interaction between async, `Result`, and `try` is **TBD**.

---

# 32. Compile-Time Evaluation

Compile-time evaluation is planned but not part of the minimal core.

The long-term goal is Zig-inspired metaprogramming that can reduce runtime bundle size and improve developer experience.

Possible future syntax:

```tsx
const routes = comptime scanRoutes("./src/pages");
```

Compile-time code may be used for:

- route generation,
- schema generation,
- environment validation,
- build-time feature flags,
- CSS extraction,
- static asset manifests,
- API client generation,
- dead-code elimination.

Initial support may begin with constant evaluation.

Example:

```tsx
const size = comptime 1024 * 4;
```

Compile-time side effects such as reading files, environment variables, or network resources are **TBD** and should be explicit for caching and reproducibility.

Compiler directives are related to compile-time evaluation but distinct. A
directive such as `@enumVariantNames(Color)` is itself a compile-time operation
and does not need an explicit `comptime` marker.

Directive definitions and open design questions are tracked separately in
[Compiler Directives](compiler-directives.md).

---

# 33. Build Modes

The compiler may support multiple build modes.

Possible modes:

```tsx
development
safe-production
performance
```

Build modes may affect:

- optimization level,
- emitted debugging information,
- diagnostic verbosity,
- panic messages,
- runtime assertion detail,
- dead-code elimination,
- compile-time evaluation aggressiveness.

Build modes must not silently change the semantics of safe code.

Unsafe operations may be compiled differently depending on the mode.

---

# 34. Safety Rules

The following rules are core to the language:

- No implicit truthiness.
- Only `boolean` may be used in conditions.
- No implicit coercion between unrelated types.
- No normal `null` or `undefined` values.
- Optional values must be represented explicitly.
- Property access must be statically known to be valid.
- Object and array equality with `==` or `!=` is not allowed.
- Array indexing is checked by default.
- Recoverable errors use `Result`.
- Panics are for programmer errors, not normal error handling.
- Match expressions over enums must be exhaustive.
- Runtime type-derived data must be requested explicitly with compiler
  directives.
- JavaScript interop boundaries must be explicit.

---

# 35. Example Program

```tsx
type User = {
	id: string,
	name: string,
	nickname: Option<string>,
};

type ParseError = enum {
	MissingId,
	MissingName,
};

fn displayName(user: User): string {
	match user.nickname {
		.Some(name) => name,
		.None => user.name,
	}
}

fn greet(user: User): string {
	"Hello ${displayName(user)}"
}

const user = {
	id: "1",
	name: "Ada",
	nickname: .None,
};

const message = greet(user);
```

---

# 36. Example: Checked Array Access

```tsx
fn firstOrDefault(values: []number, fallback: number): number {
	match values.get(0) {
		.Some(value) => value,
		.None => fallback,
	}
}

fn first(values: []number): number {
	values[0] // Panics if the array is empty.
}
```

---

# 37. Example: Result-Based Error Handling

```tsx
type NumberError = enum {
	Invalid,
	OutOfRange,
};

fn parseNumber(input: string): Result<number, NumberError> {
	// Implementation TBD.
}

fn parsePort(input: string): Result<number, NumberError> {
	const port = try parseNumber(input);

	if port < 0 or port > 65535 {
		return .Err(NumberError.OutOfRange);
	}

	.Ok(port)
}
```

---

# 38. Open Design Questions

The following topics need further design:

1. Optional field shorthand syntax and the defaulting operator.
2. Generic type parameter constraints.
3. Function type syntax.
4. Trait syntax and semantics.
5. Anonymous function ergonomics.
6. Shadowing rules.
7. Object exactness and excess-property checks.
8. Exact standard-library names for reference and structural equality helpers.
9. Bigint division behavior.
10. Exact `Index` design.
11. Re-exports, opaque types, internal-module conventions, package and
    workspace dependency declarations, importing a package's own root
    module from within, combining library and executable roles in one
    package, the `main` return-type extension, the compilation-target
    field in `polena.toml`, and the full set of permitted
    compile-time-constant initializers.
12. JavaScript interop declaration format.
13. `.d.ts` conversion strategy.
14. Async model.
15. Compile-time evaluation and compiler directive phase model.
16. Custom user-thrown panic syntax, panic-from-`main` return-type
    conventions, and the interaction between panics and async unwinding.
17. Unsafe operations.
18. Standard library naming conventions.
19. Formatter canonical style.
20. Unicode identifiers and Unicode string escapes.
21. Object introspection depth and alias preservation.
22. Structural typing for object types and possible future distinct types.
23. Long-term mutability model.
24. User-defined directives, macros, and generated code hygiene.
