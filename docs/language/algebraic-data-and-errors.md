# Algebraic Data and Errors

`Option`, `Result`, enums, match expressions, and panic behavior.

---

## 18. Optional Values

The language does not expose JavaScript `null` or `undefined` as ordinary values.

Missing or optional values are represented explicitly using `Option<T>`.

`Option` is a generic enum type. See [Generics](types-and-generics.md#25-generics).

```tsx
type Option<T> = enum {
	Some(T),
	None,
};
```

It is considered a fundamental standard-library type. In the current compiler
MVP, `Option<T>` is provided by the compiler prelude as a generic enum. It
follows the normal enum construction and match rules.

A shorthand surface syntax for optional types, such as `string?` for
`Option<string>`, is **TBD**. See
[Optional Object Fields](#182-optional-object-fields).

---

### 18.1 Option Values

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

### 18.2 Optional Object Fields

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

### 18.3 Defaulting Operator

A defaulting operator may be added for `Option<T>`.

Possible syntax:

```tsx
const name = user.nickname ?? "Anonymous";
```

This is **TBD**.

---

## 19. Result Values and Error Handling

The language does not use exceptions for ordinary recoverable errors.

Recoverable errors are represented explicitly using `Result<T, E>`.

`Result` is a generic enum type. See [Generics](types-and-generics.md#25-generics).

```tsx
type Result<T, E> = enum {
	Ok(T),
	Err(E),
};
```

It is considered a fundamental standard-library type. In the current compiler
MVP, `Result<T, E>` is provided by the compiler prelude as a generic enum. It
follows the normal enum construction and match rules.

```tsx
const result: Result<number, NumberError> = .Ok(42);
const error: Result<number, NumberError> = .Err(NumberError.Invalid);
```

---

### 19.1 Returning Results

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

### 19.2 Try Operator

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

### 19.3 Panic

A panic represents a programmer error or violated invariant. Panics are not
intended for ordinary recoverable errors; those are modeled with `Result`.

Operations that panic include:

- checked array indexing out of bounds
  ([Array Indexing](collections-and-objects.md#162-array-indexing)),
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
boundary
([JavaScript and TypeScript Interop](modules-and-interop.md#29-javascript-and-typescript-interop)),
at which point JavaScript code is free to catch the underlying `Error` like any
other.

A program that panics is considered to have failed. The exit behavior of a
panicked program depends on the runtime environment and is not part of the
language proper.

Custom user-thrown panics, panic-from-`main` return-type conventions, and
the relationship between panics and async unwinding are **TBD**.

---

## 20. Enums

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

### 20.1 Associated Data

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

## 21. Match Expressions

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

### 21.1 Exhaustiveness

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

### 21.2 Match Result Type

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

