# Compiler Directives

Status: early draft  
Applies to: language specification

Compiler directives are explicit compile-time operations written with an `@`
prefix.

```tsx
@directiveName(...)
```

They are not ordinary functions. They are handled by the compiler and may inspect
syntax, resolved names, and type information.

Directives are the explicit bridge from compile-time information to emitted
runtime code. Runtime metadata is not emitted automatically.

Example:

```tsx
type Color = enum {
	Red,
	Green,
	Blue,
};

const names = @enumVariantNames(Color);
```

This may compile to JavaScript similar to:

```tsx
const names = ["Red", "Green", "Blue"];
```

---

## General Rules

Compiler directives:

- are prefixed with `@`,
- are built into the compiler for now,
- are evaluated at compile time,
- may inspect compiler and type information,
- receive syntax or AST-like input rather than ordinary runtime values,
- may generate ordinary runtime values explicitly,
- cannot be passed around like functions,
- cannot be stored in variables,
- cannot be called without the `@` prefix.

Directives are valid in expression position when the directive produces a value.

```tsx
const fields = @objectFieldNames(User);
```

Directive forms in declaration or statement position are deferred.

```tsx
@deriveJson(User); // Deferred.
```

Initial directives should be constrained to clear accepted input forms. The
language should not begin with arbitrary AST rewriting or a general-purpose macro
system.

For example, `@enumVariantNames(Color)` expects an input that resolves to an
enum type.

---

## Runtime Metadata Is Opt-In

Types are primarily compile-time constructs. Defining a type does not emit
runtime metadata.

```tsx
type User = {
	id: string,
	name: string,
};
```

The declaration above does not create a runtime description of `User`.

Runtime data derived from a type is emitted only when explicitly requested:

```tsx
const fields = @objectFieldNames(User);
```

---

## Enum Directives

Enum introspection is split into distinct operations.

### `@enumVariantNames`

```tsx
@enumVariantNames(T)
```

Returns the names of the variants of enum type `T` as strings.

Example:

```tsx
type Color = enum {
	Red,
	Green,
	Blue,
};

const names = @enumVariantNames(Color);
```

Expected generated runtime value:

```tsx
["Red", "Green", "Blue"]
```

Likely type:

```tsx
[]string
```

The exact result type is still subject to the final array and literal typing
rules.

### `@enumValues`

```tsx
@enumValues(T)
```

Returns the values of a fieldless enum type `T`.

Example:

```tsx
const values = @enumValues(Color);
```

Expected generated runtime value:

```tsx
[Color.Red, Color.Green, Color.Blue]
```

Likely type:

```tsx
[]Color
```

`@enumValues(T)` is valid only for fieldless enums. It is invalid for enums with
associated data because not all possible values can be enumerated.

```tsx
type Message = enum {
	Move(number, number),
	Write(string),
	Quit,
};

const names = @enumVariantNames(Message); // Valid.
const values = @enumValues(Message);      // Invalid.
```

### Future Enum Metadata

A richer directive may be added later:

```tsx
@enumVariantInfo(T)
```

The exact shape of this metadata is unresolved.

---

## Object Directives

Object types may be introspected explicitly.

### `@objectFieldNames`

```tsx
@objectFieldNames(T)
```

Returns the field names of object type `T` as strings.

Example:

```tsx
type User = {
	id: string,
	name: string,
	active: boolean,
};

const fields = @objectFieldNames(User);
```

Expected generated runtime value:

```tsx
["id", "name", "active"]
```

Likely type:

```tsx
[]string
```

### Future Object Metadata

A richer directive may be added later:

```tsx
@objectFields(T)
```

This could include field names, declared field types, resolved field types, or
both. The exact representation is unresolved.

For aliases:

```tsx
type UserId = string;

type User = {
	id: UserId,
};
```

It is still open whether object metadata should preserve `UserId`, expose
`string`, or expose both as separate `declaredType` and `resolvedType` fields.

---

## Candidate Directives

Likely candidate directive names include:

```tsx
@enumVariantNames(T)
@enumValues(T)
@enumVariantInfo(T)
@objectFieldNames(T)
@objectFields(T)
@typeName(T)
@typeKind(T)
@elementType(T)
@typeOf(expr)
```

Only the general directive model and the likely initial enum/object
introspection direction are specified here. Exact names and return types are not
final.

---

## Directives and `comptime`

Directives and `comptime` are related but distinct.

- `@directive(...)` gives access to compiler and type information.
- `comptime` evaluates ordinary language code at compile time.

A directive expression does not need an explicit `comptime` marker:

```tsx
const names = @enumVariantNames(Color);
```

Later, compile-time code may process directive output:

```tsx
const lowerNames = comptime {
	const names = @enumVariantNames(Color);
	names.map(fn (name) {
		name.toLowerCase()
	})
};
```

The exact interaction between directive evaluation, ordinary compile-time
evaluation, and type checking is still open.

---

## Phase Model

The preferred direction is:

1. Parse source files.
2. Resolve and type-check directive inputs as needed.
3. Evaluate directives at compile time.
4. Type-check the generated expression or output.
5. Emit runtime code only for the explicit directive result.

Exact compiler phase rules are still open.

---

## Deferred Design

The following topics are unresolved:

- exact directive names,
- exact directive return types,
- whether richer metadata values are ordinary runtime values, compiler-only
  values, or generated standard-library structs,
- user-defined directives,
- library-provided directives,
- arbitrary AST macros,
- macro hygiene,
- generated declaration hygiene,
- hidden declaration generation.

The preferred early approach is for directives to generate explicit values:

```tsx
const UserJson = @jsonCodec(User);
```

instead of hidden declarations such as:

```tsx
@deriveJson(User);
```
