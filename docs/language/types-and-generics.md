# Types and Generics

Type declarations, generic types, generic functions, and `unknown`.

---

## 24. Type Declarations

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

Type declarations may also introduce generic type parameters. See
[Generics](#25-generics).

Transparent aliases to existing types are supported:

```tsx
type Score = number;
type Scores = []Score;
```

## 25. Generics

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

### 25.1 Instantiation

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

### 25.2 Generic Enums

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

Enum variant construction follows the rules in
[Associated Data](algebraic-data-and-errors.md#201-associated-data). The compiler
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

### 25.3 Generic Match Patterns

When matching against a value of an instantiated generic enum type, payload
patterns bind values whose types are the substituted variant payload types.

```tsx
const opt: Option<number> = .Some(1);

const label = match opt {
	.Some(value) => "got ${value}", // value: number
	.None => "nothing",
};
```

Exhaustiveness and arity rules from
[Match Expressions](algebraic-data-and-errors.md#21-match-expressions) apply
unchanged. Type substitution is performed before patterns are checked against
variant payloads.

---

### 25.4 Type Identity

Two instantiations of the same generic type are identical when their type
arguments are identical.

```tsx
type Pair<A, B> = { first: A, second: B };

const p1: Pair<string, number> = { first: "a", second: 1 };
const p2: Pair<string, number> = p1; // Valid: same instantiation.
const p3: Pair<number, string> = p1; // Invalid: different instantiation.
```

Type aliases remain transparent. A type alias whose right-hand
side mentions type parameters is itself a generic type declaration.

```tsx
type StringPair<V> = Pair<string, V>;
```

Generic enum instantiations follow the nominal typing rule from
[Enums](algebraic-data-and-errors.md#20-enums).
Two distinct generic enum declarations produce incompatible instantiations
even when their type arguments are the same.

---

### 25.5 Generic Functions

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

The uniqueness and shadowing rules from [Generics](#25-generics) apply:
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

Constraints on type parameters remain **TBD**. See
[Constraints](#256-constraints).

---

### 25.6 Constraints

Type parameter constraints are **TBD**. Constraints are expected to be designed
together with [traits](future-features.md#26-traits): the only meaningful
constraints in a language without traits are structural, and structural
constraints would need to be reconciled with whatever trait mechanism is added
later.

---

## 26. Unknown

`unknown` represents a value whose runtime shape is not known to Polena.

It is intended for dynamic boundary data, especially values produced by target
escapes or future external code declarations.

```tsx
const value: unknown = @target.js("JSON.parse($0)", unknown, input);
```

Values of type `unknown` may be stored, passed as `unknown`, and returned as
`unknown`. They cannot be inspected, called, used as booleans, accessed through
fields, indexed, or implicitly converted to another type.

Any value may be assigned to `unknown`. A value whose type is `unknown` may only
flow to another `unknown` slot until explicit decoding or refinement produces a
more specific type.

Useful operations on `unknown` require explicit decoding or refinement
functions that return `Option` or `Result`.

```tsx
fn as_string(value: unknown): Option<string> {
	// Exact implementation is TBD.
	...
}
```

The exact decoding API is **TBD**.

---

## 27. Opaque Types

An opaque type is a named type whose representation is hidden from ordinary
Polena code.

```tsx
type Date = opaque;
```

Opaque types are intended for values created by target escapes or future
foreign boundary declarations, such as JavaScript `Date`, `Map`, `RegExp`, host
handles, and error objects.

Values of an opaque type may be stored, passed to functions, and returned.
Ordinary Polena code cannot inspect their fields, match on their
representation, or construct them directly.

```tsx
type Date = opaque;

fn from_millis(milliseconds: number): Date {
	@target.js("new Date($0)", Date, milliseconds)
}

fn to_iso_string(date: Date): string {
	@target.js("$0.toISOString()", string, date)
}
```

The following opaque-type rules are **TBD**:

- equality,
- whether opaque aliases are distinct or transparent,
- visibility rules for public and private opaque types,
- whether opaque values can be serialized or cloned.

Generic opaque declarations are not supported yet.

---

## 28. Never

`never` is the bottom type. It is the type of an expression that does not
produce a value because it diverges, such as a `panic` expression or a call to
`todo` or `unreachable` ([Panic](algebraic-data-and-errors.md#193-panic)).

```tsx
fn fail(message: string): never {
	panic message
}
```

`never` is assignable to every type. This lets a diverging expression appear in
any position, so a branch that panics does not constrain the type of the
surrounding expression:

```tsx
const value: number = if ready {
	read()
} else {
	panic "not ready"
};
```

No value can be assigned to `never`, because no value inhabits it. A function
declared to return `never` must not be able to return normally.

`never` is primarily produced by the language and standard library rather than
written by hand, but it may be used as an explicit return type for a function
that always diverges.
