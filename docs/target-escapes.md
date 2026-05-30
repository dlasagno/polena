# Target Escapes

Status: design draft  
Applies to: language specification

Target escapes are explicit compiler directives for trusted, target-specific
lowering code.

They are intended for the places where ordinary Polena code needs to say:

> Type-check these Polena operands, emit this target-language code, and resume
> with this declared Polena type.

For the current JavaScript target, the initial candidate directive is:

```tsx
@target.js("Date.now()", number)
@target.js("console.log($0)", void, message)
@target.js("JSON.parse($0)", unknown, input)
@target.js.option("process.env[$0]", string, name)
@target.js.result("JSON.parse($0)", unknown, unknown, input)
```

This is not JavaScript interop in the broad TypeScript sense. It is closer to a
target-specific lowering escape: the author provides a trusted JavaScript
output template, and the compiler handles checked operands, placeholder
substitution, result typing, and code generation.

Target escapes are implemented for the JavaScript target in the initial
`@target.js`, `@target.js.option`, and `@target.js.result` forms described
below. Package source must opt in with `[unsafe] target_escapes = true` in
`polena.toml`. Deeper JavaScript template validation is not implemented.

---

## Goals

Target escapes should:

- keep target-specific code explicit at the use site,
- avoid adding JavaScript syntax to the Polena parser,
- use ordinary Polena directive syntax,
- require an explicit result type operand,
- allow the standard library to expose safe ordinary Polena wrappers,
- provide a lower-level foundation that future generated bindings can target.

Target escapes should not become ordinary inline JavaScript blocks, a general
macro system, or a replacement for safe library APIs.

---

## Initial Shape

The initial candidate form is:

```tsx
@target.js(template, result_type, operand...)
@target.js.option(template, value_type, operand...)
@target.js.result(template, ok_type, error_type, operand...)
```

Where:

- `template` is a string literal,
- each type position such as `result_type`, `value_type`, `ok_type`, or
  `error_type` is a Polena type operand,
- each `operand` is an ordinary Polena expression checked normally.

Examples:

```tsx
export fn now_millis(): number {
	@target.js("Date.now()", number)
}

export fn println(message: string): void {
	@target.js("console.log($0)", void, message)
}

export fn to_iso_string(date: Date): string {
	@target.js("$0.toISOString()", string, date)
}

export fn env_get(name: string): Option<string> {
	@target.js.option("process.env[$0]", string, name)
}

export fn parse_json(input: string): Result<unknown, unknown> {
	@target.js.result("JSON.parse($0)", unknown, unknown, input)
}
```

The result type is not inferred from context. This is intentional. Directives
do not use contextual typing to acquire missing semantics.

This is invalid in the initial model:

```tsx
const now: number = @target.js("Date.now()"); // Invalid: missing result type.
```

This is also invalid in the initial model:

```tsx
@target.js<number>("Date.now()") // Invalid: directives do not use generics.
```

The type is a directive operand, not a generic type argument.

---

## Template Operand

The first operand is syntactically an ordinary string literal.

The language does not add new string syntax, tagged templates, or global
meaning to string literals. The target escape directive may inspect and
validate the literal contents according to its own rules.

The template must be known at compile time. Runtime string interpolation is not
allowed:

```tsx
const expr = "Date.now()";
@target.js(expr, number); // Invalid: template must be a string literal.
```

The first draft treats the template as a restricted JavaScript output template,
not as arbitrary runtime text.

---

## Placeholders

Runtime operands are referenced from the template using numbered placeholders:

```tsx
@target.js("console.log($0)", void, message)
@target.js("$0.slice($1)", string, input, start)
@target.js("$0.slice($1, $2)", string, input, start, end)
```

`$0` refers to the first runtime operand after the result type, `$1` to the
second, and so on.

The directive should report a diagnostic when:

- a placeholder index has no matching runtime operand,
- a runtime operand is never referenced, unless unused operands are explicitly
  allowed,
- the same placeholder syntax is malformed,
- the template contains unsupported target syntax.

Placeholder substitution is performed by the compiler. A placeholder inserts
the emitted JavaScript expression for a checked Polena operand; it does not
perform string concatenation or textual interpolation of runtime values.

For example:

```tsx
@target.js("console.log($0)", void, message)
```

lowers conceptually to JavaScript like:

```tsx
console.log(message);
```

The exact temporary naming and parenthesization are implementation details.

---

## Result Type

Every target escape has an explicit result type operand.

```tsx
@target.js("Date.now()", number)
@target.js("new Date($0)", Date, milliseconds)
@target.js("JSON.parse($0)", unknown, input)
@target.js.option("process.env[$0]", string, name)
@target.js.result("JSON.parse($0)", unknown, unknown, input)
```

The compiler checks that the result type operand resolves as a type. The target
escape then promises that the emitted JavaScript expression will produce a value
compatible with that Polena type.

That promise is trusted. The compiler does not prove that the JavaScript
template actually returns the declared type.

The result may be `void`:

```tsx
@target.js("console.log($0)", void, message)
```

A `void` target escape may emit a JavaScript expression or statement whose
result is ignored.

---

## Option Results

`@target.js.option` evaluates the target template and converts a nullish
JavaScript result into `Option<T>`.

```tsx
@target.js.option(template, value_type, operand...)
```

The directive result type is:

```tsx
Option<value_type>
```

Example:

```tsx
export fn env_get(name: string): Option<string> {
	@target.js.option("process.env[$0]", string, name)
}
```

The initial policy is:

- JavaScript `null` becomes `.None`,
- JavaScript `undefined` becomes `.None`,
- every other result becomes `.Some(value)`,
- the `.Some` payload is trusted to match `value_type`.

This is intended for JavaScript APIs that use `null` or `undefined` to
represent absence.

Do not use `@target.js.option` when `null` is a meaningful value that should be
preserved. For example, JSON data may contain explicit `null`; a JSON wrapper
should usually return `unknown` first and let a decoding API decide how to
interpret the value.

The compiler does not prove that non-nullish results match `value_type`.

---

## Result Results

`@target.js.result` evaluates the target template and catches JavaScript
exceptions into `Result<T, E>`.

```tsx
@target.js.result(template, ok_type, error_type, operand...)
```

The directive result type is:

```tsx
Result<ok_type, error_type>
```

Example:

```tsx
export fn parse_json(input: string): Result<unknown, unknown> {
	@target.js.result("JSON.parse($0)", unknown, unknown, input)
}
```

The initial policy is:

- if evaluating the template completes normally, the result is `.Ok(value)`,
- if evaluating the template throws, the thrown JavaScript value is caught and
  returned as `.Err(error)`,
- the `.Ok` payload is trusted to match `ok_type`,
- the `.Err` payload is trusted to match `error_type`.

Using `unknown` as the error type is the most honest default because JavaScript
can throw any value.

```tsx
@target.js.result("JSON.parse($0)", unknown, unknown, input)
```

A wrapper may use an opaque error type when it intentionally treats thrown
values as a host error object:

```tsx
type JsError = opaque;

fn parse_json(input: string): Result<unknown, JsError> {
	@target.js.result("JSON.parse($0)", unknown, JsError, input)
}
```

That promise is trusted. The compiler does not verify that the thrown value is
actually a `JsError`.

---

## Ordinary Wrappers

Target escapes should normally be hidden behind ordinary Polena APIs.

```tsx
export fn println(message: string): void {
	@target.js("console.log($0)", void, message)
}
```

Callers should use the wrapper:

```tsx
println("hello");
```

rather than writing target escapes throughout application code.

This keeps low-level target code localized and gives library authors a place to
document behavior, normalize JavaScript idioms, and return `Option` or `Result`
where appropriate.

---

## `unknown`

Target escapes often need to return values whose runtime shape is not known to
Polena.

```tsx
export fn parse_json(input: string): unknown {
	@target.js("JSON.parse($0)", unknown, input)
}
```

`unknown` means a value exists, but Polena does not know its useful structure.
Values of type `unknown` may be stored, passed around, and returned. They cannot
be inspected as objects, called as functions, used as booleans, or implicitly
converted to another type.

Useful operations on `unknown` require explicit decoding or refinement
functions that return `Option` or `Result`.

The exact built-in decoding API is **TBD**.

---

## Opaque Types

Target escapes also need named types whose representation is hidden from
Polena.

```tsx
type Date = opaque;

export fn from_millis(milliseconds: number): Date {
	@target.js("new Date($0)", Date, milliseconds)
}

export fn to_iso_string(date: Date): string {
	@target.js("$0.toISOString()", string, date)
}
```

An opaque type is a named type whose values can be passed around but not
inspected structurally. Polena code cannot access fields, match on
representation, or construct opaque values except through functions that return
that opaque type.

Opaque types are useful for JavaScript objects such as `Date`, `Map`, `RegExp`,
host handles, and error objects.

The first draft leaves these rules **TBD**:

- equality for opaque values,
- generic opaque types,
- whether opaque aliases are distinct or transparent,
- whether opaque values can be serialized or cloned,
- visibility rules for public and private opaque types.

---

## Effects

The initial target escape draft does not define a full effect system.

Nevertheless, target escapes can read host state, allocate objects, mutate
values, call host APIs, or throw JavaScript exceptions. This means target
escapes should be treated as effectful unless a later spec defines a way to
declare and check narrower effects.

Examples:

```tsx
@target.js("Date.now()", number)              // Reads time.
@target.js("console.log($0)", void, message)  // Performs I/O.
@target.js("new Date($0)", Date, millis)      // Allocates.
@target.js("JSON.parse($0)", unknown, input)  // May throw.
```

The `@target.js.option` and `@target.js.result` forms define narrow boundary
policies for absence and exceptions. A broader effect system and explicit
effect annotations are deferred.

---

## Diagnostics

Target escape diagnostics should be specific and should point at the directive
or the invalid operand.

Likely diagnostics include:

- unknown directive name,
- non-literal template operand,
- missing result type operand,
- result type operand does not resolve as a type,
- `@target.js.option` value type operand does not resolve as a type,
- `@target.js.result` success or error type operand does not resolve as a type,
- malformed placeholder,
- placeholder index has no matching runtime operand,
- runtime operand is unused,
- unsupported target syntax in the template,
- target escape is used where target escapes are not allowed.

The compiler should avoid cascading diagnostics when one target escape error
explains the problem.

---

## Package Gating

Target escapes reduce portability and can violate Polena's ordinary safety
guarantees when misused.

Whether target escapes are allowed in all packages, only in standard-library or
trusted packages, or behind an explicit package capability is **TBD**.

A future package-level gate might make target-specific code visible to tooling
and dependency audits.

---

## Deferred Design

The following topics are unresolved:

- exact directive name,
- exact placeholder grammar,
- how deeply JavaScript templates are parsed or validated,
- source maps for template contents,
- formatting of generated JavaScript,
- expression versus statement lowering details,
- whether `@target.js.option` needs separate `undefined`-only and
  `null`-only forms,
- whether `@target.js.result` should normalize thrown values instead of
  returning the thrown value directly,
- effect classification,
- package capability gates,
- use from generated binding packages,
- relationship to future JavaScript declaration files,
- behavior if Polena gains non-JavaScript targets.
