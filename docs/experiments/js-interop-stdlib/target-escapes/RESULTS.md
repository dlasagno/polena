# Target Escape Experiment Results

Status: design experiment output, not specification  
Date: 2026-05-18  
Scope: second pass over the JavaScript interop stdlib experiment

## What Was Run

This pass rewrote the same imagined stdlib slice from the first experiment
using target escapes instead of foreign declaration syntax.

The sketches are under `std/` and remain non-normative pseudo-code. They test a
different abstraction:

> Polena type-checks the inputs, pauses normal lowering, emits a trusted
> JavaScript target expression, then resumes with a declared Polena type.

The imagined directive family used by the sketches is:

```polena
@target.js("template", args...)
@target.js.option("template", args...)
@target.js.try("template", args...)
```

The names are placeholders. The experiment tests the abstraction, not the final
directive spelling.

## Sketches Added

- `std/console.plna`: one-string console wrappers through direct target
  expressions.
- `std/string.plna`: string helpers through target expressions and ordinary
  Polena control flow.
- `std/array.plna`: array helpers through target expressions, including
  `Option` conversion.
- `std/json.plna`: JSON parse/stringify through `unknown`, target exception
  capture, and explicit decoders.
- `std/env.plna`: environment lookup through optional property access in the
  emitted JavaScript expression.
- `std/date.plna`: opaque Date wrappers through constructor, static, and method
  JavaScript expressions.
- `std/map.plna`: opaque generic JavaScript Map wrappers.

## Comparison With Foreign Declarations

The target escape pass removes most of the invasive syntax from the first pass.
The first pass needed separate surface forms or clauses for:

- `extern module`,
- `static fn`,
- `constructor fn`,
- `method fn`,
- `js_name`,
- `js_throws`,
- `js_return`,
- `js_property_get`,
- `intrinsic`,
- `generated_try`.

The target escape pass collapses the JavaScript shape into the target template:

```polena
@target.js("Date.now()")
@target.js("new Date($0)", milliseconds)
@target.js("$0.toISOString()", date)
@target.js.option("globalThis.process?.env?.[$0]", name)
@target.js.try("JSON.parse($0)", input)
```

This is a better match for the mental model. It does not try to make Polena
understand every JavaScript access form as language syntax. It only asks Polena
to understand a small set of boundary contracts.

## What Worked Better

### Receiver calls and constructors

Methods, static functions, properties, and constructors no longer need distinct
Polena grammar. JavaScript already has syntax for those operations, and target
escapes can express it directly.

This made `Date`, `Map`, strings, and console simpler than the foreign
declaration version.

### Optional arguments

Optional arguments can be handled with ordinary Polena wrappers:

```polena
match end {
	.Some(value) => @target.js("$0.slice($1, $2)", input, start, value),
	.None => @target.js("$0.slice($1)", input, start),
}
```

This avoids a special extern rule for optional parameters in the early design.

### Public API shape

The public API remains ordinary Polena:

```polena
export fn to_iso_string(date: Date): string
export fn parse(input: string): Result<JsonValue, JsError>
export fn get(name: string): Option<string>
```

The target-specific code is an implementation detail hidden inside wrappers.
That is the right layering for the standard library.

## What Did Not Go Away

Target escapes reduce syntax, but they do not remove the semantic work.

### Result type trust

The compiler still needs a rule for how the directive result type is determined.
Likely options:

- infer from contextual type,
- require an explicit type argument,
- require assignment or return context,
- or require a typed directive form.

Contextual typing is ergonomic but can hide unsoundness. Explicit typing is
clearer but noisier.

### Exception capture

`@target.js.try(...)` still needs a precise lowering rule:

- catch which thrown values,
- convert them into which error type,
- preserve stack information or not,
- return `Result<T, E>` with which `E`.

The first pass exposed this through `js_throws`; the target escape pass exposes
it through a directive variant. The design question remains.

### Nullish and `Option`

`@target.js.option(...)` is compact, but it needs an exact policy:

- Does it map only `undefined` to `None`?
- Does it map both `null` and `undefined` to `None`?
- Are other falsy values preserved?
- Is the payload trusted as `T` without validation?

The name should probably make the policy explicit if both `undefined` and
nullish conversions are needed.

### `unknown`

JSON still requires `unknown` or a dedicated JSON value type. Target escapes do
not replace the need for a boundary-data type.

The target escape version made it easy to write decoders directly in
JavaScript, but those decoders are subtle. Common `unknown` decoders may deserve
named compiler primitives or audited stdlib functions rather than open-coded
templates everywhere.

### Opaque types

`type Date = opaque` and `type JsMap<K, V> = opaque` remain separate language
questions. Target escapes can create and pass opaque values, but opacity still
needs rules for:

- equality,
- mutation and aliasing,
- structural matching,
- declaration visibility,
- whether generic opaque types are allowed.

### Runtime profiles

The target escape for environment variables used:

```polena
@target.js.option("globalThis.process?.env?.[$0]", name)
```

That avoids property-access syntax, but it does not solve runtime profiles.
Node, Bun, Deno, browsers, and workers expose different host APIs. The compiler
or package system still needs to know which target capabilities are available.

## New Risks

### Stringly target code

Target escapes are compact because the JavaScript is a string. That creates
risks:

- malformed target snippets,
- accidental variable capture,
- injection if placeholders are not strictly controlled,
- hard-to-format generated output,
- source maps and diagnostics that point into strings,
- target syntax drift when JavaScript output changes.

The template language must be intentionally small. Placeholders such as `$0`
should refer only to compiler-emitted temporaries for checked Polena
expressions. No source interpolation should be allowed.

### Effect opacity

A target expression can read globals, mutate objects, throw, allocate, or call
host APIs. Polena needs at least a coarse effect classification before target
escapes become widely usable.

The sketches used three rough categories:

- plain target expression,
- option-producing target expression,
- exception-catching target expression.

That is probably not enough long term.

### Portability

Target escapes tie code to a backend. That is honest for the JavaScript target,
but it means packages using them are not portable in the same way as ordinary
Polena packages.

Target escapes should be visible to package metadata or tooling if they are
allowed outside trusted core packages.

## Early Conclusion

The target escape abstraction works better than the first foreign declaration
syntax for the standard-library pressure test.

It is smaller, more honest, and closer to the actual compiler operation:
checked Polena inputs flow into a trusted target-specific lowering fragment,
then the compiler resumes with a declared Polena result type.

The experiment suggests this split:

- target escapes for low-level JavaScript output control,
- ordinary Polena wrappers for public APIs,
- `unknown` for dynamic boundary data,
- opaque types for foreign target values,
- explicit directive variants or options for exception and nullish policies,
- runtime profile design outside the escape syntax itself.

The next design work should focus on directives in general, because target
escapes depend on directive questions:

- whether directives are expression-only,
- how directive result types are established,
- how target templates are parsed and validated,
- how effects are represented,
- whether target escapes are gated by package capability,
- how diagnostics and source maps work for generated target code.

The syntax may still change, but target escapes look like a better abstraction
than a broad JavaScript foreign declaration sublanguage.
