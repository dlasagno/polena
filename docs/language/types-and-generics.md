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

Object type bodies, enum type bodies, and generic type parameters are part of
the implemented MVP surface. See `../implementation-status.md` for the exact
current coverage.

---

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
[Match Expressions](algebraic-data-and-errors.md#21-match-expressions) apply unchanged. Type
substitution is performed before patterns are checked against variant
payloads.

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

Constraints on type parameters remain **TBD**. See [Constraints](#256-constraints).

---

### 25.6 Constraints

Type parameter constraints are **TBD**. Constraints are expected to be
designed together with [traits](future-features.md#26-traits): the only meaningful constraints
in a language without traits are structural, and structural constraints
would need to be reconciled with whatever trait mechanism is added later.

---

## 28. Unknown

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

