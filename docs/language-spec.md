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

The language supports only line comments.

```tsx
// This is a line comment, it starts with "//" and ends at the next LF
```

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

Shadowing is **TBD**.

Potential options:

1. Allow shadowing in inner scopes.
2. Disallow shadowing entirely.
3. Allow explicit shadowing using a dedicated syntax.

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

Comparison operators can only be applied to values with compatible types.

```tsx
1 == 1
3 != 1
5 > 3
5 >= 5
4 < 7
8 <= 9
```

Supported signatures:

```tsx
T == T = boolean
T != T = boolean
T > T = boolean
T >= T = boolean
T < T = boolean
T <= T = boolean
```

For primitive values, comparisons follow the language’s own semantics.

Comparing unrelated types is invalid:

```tsx
1 == "1" // Invalid.
```

Because equality does not perform implicit coercion, there is no `===` operator.

Object and array equality is by reference, not value.

```tsx
const a = { x: 1 };
const b = { x: 1 };
const c = a;
a == b // false
a == c // true
```

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

`length` has type `number`.

Whether array indexes use `number` or a dedicated integer/index type is **TBD**.

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

The current JavaScript backend emits a runtime bounds check for this operation.
The index must be an integer-valued `number`; negative, fractional, `NaN`, and
out-of-bounds indexes panic at runtime.

This operation does not return `undefined`.

Array indexing never produces an untyped missing value.

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

---

## 17.1 Object Types

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

## 17.2 Structural Typing

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

Exact object types and excess-property restrictions are **TBD**.

---

## 17.3 Property Access Safety

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

Conceptually:

```tsx
type Option<T> = enum {
	Some(T),
	None,
};
```

Generic syntax is still **TBD**, but `Option` is considered a fundamental standard-library type.

Possible surface syntax:

```tsx
Option<string>
string?
```

The exact syntax is **TBD**.

---

## 18.1 Option Values

Option values represent either the presence or absence of a value.

```tsx
.Some("Ada")
.None
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

Conceptually:

```tsx
type Result<T, E> = enum {
	Ok(T),
	Err(E),
};
```

Generic syntax is **TBD**, but `Result` is considered a fundamental standard-library type.

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

A panic represents a programmer error or violated invariant.

Examples of operations that may panic:

- checked array indexing out of bounds,
- explicit failed assertions,
- unreachable code paths.

Panics are not intended for ordinary recoverable errors.

Panic handling and compilation behavior are **TBD**.

---

# 20. Enums

An enum is a type with a fixed set of variants.

```tsx
type Color = enum {
	Red,
	Green,
	Blue,
};
```

Values are constructed using the enum name:

```tsx
const red = Color.Red;
```

When the enum type is known and there is no ambiguity, the enum name may be omitted:

```tsx
const blue: Color = .Blue;
```

---

## 20.1 Enums With Associated Data

Enum variants may carry data:

```tsx
type Color = enum {
	Red(number),
	Green(number),
	Blue(number),
};

const red = Color.Red(10);
```

Variants may carry multiple fields:

```tsx
type Message = enum {
	Move(number, number),
	Write(string),
	Quit,
};
```

Named associated fields are **TBD**.

---

# 21. Match Expressions

`match` evaluates a value against patterns.

It is primarily used with enums, `Option`, and `Result`.

```tsx
const label = match color {
	.Red => "red",
	.Green => "green",
	.Blue => "blue",
};
```

For variants with associated data:

```tsx
const text = match message {
	.Move(x, y) => "Move to ${x}, ${y}",
	.Write(value) => value,
	.Quit => "Quit",
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

A wildcard pattern may be supported later.

```tsx
_ => "unknown"
```

Wildcard syntax is **TBD**.

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

Types are declared using `type`.

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

Type aliases are transparent unless otherwise specified.

Nominal type aliases/newtypes are **TBD**.

---

# 25. Generics

Generics are not required for the earliest prototype but are expected to be part of the language.

They are necessary for user-defined reusable types such as:

```tsx
Option<T>
Result<T, E>
[]T
```

The intended direction is simple, predictable generics rather than TypeScript-style advanced type-level programming.

Possible syntax:

```tsx
fn first<T>(items: []T): Option<T> {
	items.get(0)
}
```

Advanced features such as conditional types, mapped types, and arbitrary type-level computation are non-goals.

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

# 30. Modules and Imports

Modules, imports, and exports are **TBD**.

Possible future syntax:

```tsx
import { parseUser } from "./user";

export fn main(): void {
	// ...
}
```

The module system should align with JavaScript module output.

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
- Array indexing is checked by default.
- Recoverable errors use `Result`.
- Panics are for programmer errors, not normal error handling.
- Match expressions over enums must be exhaustive.
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

1. Exact syntax for `Option<T>` and optional fields.
2. Exact syntax and semantics for generics.
3. Function type syntax.
4. Trait syntax and semantics.
5. Anonymous function ergonomics.
6. Shadowing rules.
7. Object exactness and excess-property checks.
8. Equality semantics for arrays and objects.
9. Bigint division behavior.
10. Integer/index type design.
11. Module/import/export system.
12. JavaScript interop declaration format.
13. `.d.ts` conversion strategy.
14. Async model.
15. Compile-time evaluation model.
16. Panic behavior.
17. Unsafe operations.
18. Standard library naming conventions.
19. Formatter canonical style.
20. Unicode identifiers and Unicode string escapes.
