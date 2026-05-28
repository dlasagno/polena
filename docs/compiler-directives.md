# Compiler Directives

Status: design draft  
Applies to: language specification

Compiler directives are explicit requests for compiler-defined behavior written
with an `@` prefix.

```tsx
@directiveName(...)
```

A directive is not a normal function. It belongs to a separate compiler
namespace, is checked by directive-specific rules, and is resolved during
compilation. A directive invocation may inspect syntax, resolved names, type
information, and checked operand expressions, then produce a typed result or a
target-specific lowering instruction.

Directives are the explicit bridge between ordinary source code and compiler
knowledge. Polena does not emit runtime metadata or special target code
implicitly; code must request it through a directive or an ordinary language
feature.

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

## Goals

Directives should:

- make compiler-provided operations explicit at the use site,
- preserve normal parsing, name resolution, type checking, and diagnostics,
- avoid automatic runtime metadata,
- avoid a general macro system in the initial language,
- avoid changing the meaning of ordinary Polena syntax outside the directive
  invocation being checked,
- keep generated runtime behavior reviewable,
- support future target-specific lowering experiments without making JavaScript
  syntax part of the core language grammar.

Directives should not become a back door for arbitrary AST rewriting,
untracked side effects, or hidden declarations.

---

## Terminology

A **directive** is a compiler-defined operation such as
`enumVariantNames` or a future target escape.

A **directive invocation** is a source occurrence of a directive:

```tsx
@enumVariantNames(Color)
```

A **directive name** is resolved in the directive namespace, not in the ordinary
value namespace. For example, a function named `enumVariantNames` does not
define `@enumVariantNames`.

A **directive operand** is an argument supplied to a directive. Operands may be
types, syntax forms, literal compile-time parameters, or ordinary checked
runtime expressions, depending on the directive.

A **directive result** is the typed value, checked expression, generated
metadata, or lowering instruction produced by the invocation.

An **expansion** is the compiler's internal replacement of a directive
invocation with its result. Expansion does not mean arbitrary source rewriting;
the preferred initial model is expression-in, expression-out.

---

## Basic Rules

Compiler directives:

- are prefixed with `@`,
- are built into the compiler for now,
- are not ordinary functions,
- do not use ordinary function generic type-argument syntax,
- cannot be passed around as values,
- cannot be stored in variables,
- cannot be imported from packages,
- cannot be called without the `@` prefix,
- are resolved in a separate directive namespace,
- are checked by directive-specific typing rules,
- are expanded during compilation, not called at runtime.

Initial directives are valid only in expression position when they produce a
value.

```tsx
const fields = @objectFieldNames(User);
```

Directive forms in declaration, statement, pattern, and type position are
deferred.

```tsx
@deriveJson(User); // Deferred.
type Handle = @opaque("Date"); // Deferred.
```

Initial directives should accept clear, narrow input forms. The language should
not begin with arbitrary AST rewriting or user-defined macros.

---

## When Directives Run

A directive invocation is processed at compile time after parsing and before
final code generation.

The compiler does not execute directive operands as runtime values. If a
directive accepts an ordinary expression operand, the compiler checks the
expression and passes its typed representation to the directive. The emitted
program evaluates that expression later at runtime if the directive result uses
it.

For example, in a future target escape:

```tsx
@target.js("console.log($0)", void, message)
```

the compiler would resolve `void` as a type operand and check `message` as an
ordinary Polena expression. It would not know the runtime string stored in
`message`. The directive would receive a checked operand that can be lowered
into the generated JavaScript expression.

Directives should be deterministic for the same checked program. Directives
that read files, inspect the environment, call the network, depend on time, or
otherwise use external state are deferred unless explicitly designed as
separate capabilities.

---

## Operand Kinds

Each directive defines which operand kinds it accepts.

### Type Operands

Some directives accept a type name or type expression.

```tsx
@enumVariantNames(Color)
```

The operand must resolve in type position. If `Color` is not an enum type, the
compiler reports a directive-specific diagnostic.

### Runtime Expression Operands

Some directives accept ordinary expressions that will be evaluated by the
emitted program.

```tsx
@someDirective(value + 1)
```

The expression is parsed, resolved, and type-checked normally. The directive may
use the expression's type and checked representation, but it does not evaluate
the runtime value at compile time.

### Compile-Time Literal Parameters

Some directives may require literal parameters known during compilation.

```tsx
@target.js("Date.now()", number)
```

The first operand above is still an ordinary string literal. The language does
not give string literals new syntax or global meaning. The directive may inspect
and validate the literal contents according to directive-specific rules, similar
to how a formatting directive might validate placeholders in a format string.

For target-like directives, the target template should be literal-only; no
runtime string interpolation should be allowed. Placeholder syntax inside the
literal is owned by that directive and should be diagnosed by that directive,
not by the general parser.

### Syntax Operands

Some future directives may inspect syntax directly. These are deferred because
syntax-level directives are closer to macros and need stricter hygiene rules.

---

## Result Types

Every directive invocation must have a known result type before code generation.

A directive may determine its result type in one of these ways:

- **fixed result type**: the directive always returns the same type,
- **type-derived result type**: the result type is computed from type operands,
- **operand-derived result type**: the result type is computed from expression
  operand types,
- **explicit result type**: the directive accepts a type operand that states
  the result type.

The preferred initial directives should use fixed, type-derived, or
operand-derived result types. Directives that cannot determine a result type
from their own definition or operands should require an explicit type operand.

The initial directive model does not use contextual typing to determine
directive result types. A surrounding annotation may still check the final
directive result like any other expression, but it does not supply missing
directive semantics.

Examples:

```tsx
const names = @enumVariantNames(Color); // likely []string

const value = @target.js("Date.now()", number); // explicit result type operand
```

If a directive requires an explicit result type operand and it is missing, the
compiler should report a clear directive diagnostic rather than inferring from
the surrounding expression.

Directives should not use generic type-argument syntax for result typing in the
initial model. For example, prefer this shape for a future target escape:

```tsx
@target.js("Date.now()", number)
```

over this shape:

```tsx
@target.js<number>("Date.now()") // Not in the initial directive model.
```

The type is a directive operand, not an ordinary generic instantiation.

---

## Expansion Model

The preferred initial model is:

```text
directive expression -> checked expression or lowering node
```

A directive expansion may produce:

- a constant runtime value derived from compiler information,
- a checked ordinary expression,
- a compiler-internal lowering node consumed by code generation.

The initial model should not allow directives to silently create declarations,
rewrite unrelated source, change visibility, or mutate compiler state outside
the directive result.

For example, prefer explicit values:

```tsx
const UserJson = @jsonCodec(User);
```

over hidden generated declarations:

```tsx
@deriveJson(User); // Deferred.
```

Generated temporaries, if needed by a directive expansion, must be hygienic and
must not collide with user-defined names.

---

## Phase Model

The preferred phase model is:

1. Parse directive invocations as ordinary syntax nodes with directive names and
   raw operands.
2. Resolve ordinary declarations, imports, types, and values enough to check
   directive operands.
3. Resolve directive names in the compiler's directive namespace.
4. Validate directive operand kinds and type-check expression operands.
5. Determine the directive result type.
6. Expand the directive into a checked expression or compiler-internal lowering
   node.
7. Continue type checking any surrounding expression using the directive result.
8. Generate target code from the checked program.

This phase model allows a directive to depend on type information, but it does
not allow a directive to introduce new names that earlier resolution would have
needed.

If future declaration-position directives are added, they need a separate phase
model because they may affect name resolution.

---

## Diagnostics

Directive diagnostics are user-facing language behavior.

When a directive invocation is invalid, the compiler should report:

- a stable diagnostic code when available,
- a primary span on the invalid directive or operand,
- a specific message naming the directive,
- expected operand kinds or types,
- secondary labels for related type declarations or operands where useful.

Invalid directive input should not produce cascading diagnostics where one
clear directive error is enough.

Examples of invalid directive diagnostics:

- `@enumVariantNames(User)` where `User` is not an enum type,
- `@enumValues(Message)` where `Message` has associated-data variants,
- a future target escape whose template references `$2` with only two operands,
- a future target escape missing its required result type operand.

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

Future target escape experiments may need directives that produce
target-specific lowering nodes. Those should be designed after the general
directive model is stable enough to answer result typing, effect, and template
validation questions.

Only the general directive model and the likely initial enum/object
introspection direction are specified here. Exact names and return types are not
final.

---

## Directives and `comptime`

Directives and `comptime` are related but distinct.

- `@directive(...)` invokes a compiler-defined operation.
- `comptime` evaluates ordinary Polena code at compile time.

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

The exact interaction between directive expansion, ordinary compile-time
evaluation, and type checking is still open.

The important distinction is that a directive can access compiler services that
ordinary `comptime` code cannot, such as type declarations, resolved symbols,
or target lowering hooks. Conversely, `comptime` should eventually execute
ordinary Polena logic rather than adding new compiler operations.

---

## Deferred Design

The following topics are unresolved:

- exact directive names,
- exact directive result types,
- exact grammar for dotted directive names,
- whether directives can appear in declaration, statement, pattern, or type
  position,
- whether richer metadata values are ordinary runtime values, compiler-only
  values, or generated standard-library structs,
- directive effect classification,
- target-specific lowering directives,
- target template validation and hygiene,
- source maps for generated target code,
- package capability gates for directives that affect portability or safety,
- user-defined directives,
- library-provided directives,
- arbitrary AST macros,
- macro hygiene,
- generated declaration hygiene,
- hidden declaration generation.
