# JavaScript Interop Standard Library Experiment

Status: design experiment, not specification  
Scope: imaginary interop syntax, standard-library pressure test

This directory is for testing whether a small, explicit JavaScript interop
model can support the first useful version of Polena's standard library.

The syntax in this experiment is intentionally imaginary. Do not implement it,
document it as language behavior, or treat it as accepted design. The goal is
to write enough stdlib-shaped pseudo-code to expose which mechanisms are
actually needed.

## Motivation

Polena targets JavaScript but is not a JavaScript or TypeScript superset. That
means interop cannot be treated as ordinary Polena code accepting arbitrary
JavaScript values at face value. JavaScript can return `null` or `undefined`,
throw exceptions, depend on `this`, mutate values through aliases, expose class
instances, and produce dynamic data whose shape is not statically known.

The working hypothesis is:

- v1 interop should be explicit boundary plumbing, not a primary differentiator.
- Hand-written extern declarations are the foundation.
- `.d.ts` consumption is deferred.
- A future binding generator should live outside compiler core.
- The standard library may need compiler-known intrinsics in addition to
  extern declarations.

This experiment tests that hypothesis by sketching small pieces of the
standard library as if the interop syntax already existed.

A second pass in `target-escapes/` repeats the same standard-library pressure
test with imagined target escape directives instead of foreign declaration
syntax.

## Instructions

When adding to this experiment:

1. Keep every file non-normative. Prefer phrases such as "imagined",
   "candidate", and "experiment" over "must" or "will".
2. Sketch code that looks like Polena, but do not worry about exact parser
   syntax unless the syntax choice affects the design question.
3. Mark every operation as one of:
   - ordinary Polena,
   - compiler intrinsic,
   - trusted extern declaration,
   - generated boundary wrapper,
   - impossible or deferred.
4. Prefer tiny stdlib modules over abstract examples. Good targets are
   strings, arrays, JSON, console, dates, environment variables, and maps.
5. Record friction when it appears. The purpose is to find missing mechanisms,
   not to make the first syntax look successful.
6. Do not update `docs/language/*.md` or `docs/implementation-status.md` from
   this experiment until a design decision has been made separately.

## Evaluation Questions

Use the sketches to answer:

- Can core string, array, and number helpers be written without general method
  interop?
- Which operations need compiler intrinsics instead of extern declarations?
- Does `unknown` need to exist before JSON and dynamic boundary data are
  useful?
- Is exception wrapping declared on extern functions, requested at call sites,
  or expressed as a generated wrapper?
- How should `null` and `undefined` become `Option<T>` without weakening bare
  non-optional `T`?
- What mechanism represents opaque JavaScript objects such as `Date`, `Map`,
  `RegExp`, and host-specific handles?
- Are constructors, properties, methods, and static functions separate foreign
  declaration forms?
- Which features should remain deferred for v1, such as promises, async,
  variadic calls, symbols, iterators, and complex `this` binding?

## Candidate Mechanisms

The current hypothesis is that v1 needs at least four mechanisms.

```polena
// 1. Compiler-known operation for primitives or built-ins.
intrinsic string_slice(input: string, start: number, end: Option<number>): string

// 2. Trusted declaration for foreign JavaScript code.
extern module "node:process" {
	fn getenv(name: string): string js_return nullish_as_option;
}

// 3. Opaque foreign value whose internals are not visible to Polena.
extern module "global" {
	type Date = opaque;
}

// 4. Unknown boundary data that requires explicit decoding.
type JsonValue = unknown;
```

These spellings are placeholders. The experiment should pressure-test the
separation between mechanisms, not bikeshed final keywords.

## Sketch: Console

```polena
// std/console.plna
// Classification: trusted extern declaration plus ordinary wrapper.

extern module "global:console" {
	fn log(message: string): void;
	fn error(message: string): void;
}

export fn println(message: string): void {
	log(message);
}

export fn eprintln(message: string): void {
	error(message);
}
```

Questions raised:

- Is a synthetic module name such as `"global:console"` acceptable, or should
  globals use a dedicated declaration form?
- Is `println` compiler-provided until stdlib packaging exists?

## Sketch: Strings

```polena
// std/string.plna
// Classification: compiler intrinsics plus ordinary Polena wrappers.

export fn len(input: string): number {
	intrinsic string_len(input)
}

export fn slice(input: string, start: number, end: Option<number>): string {
	intrinsic string_slice(input, start, end)
}

export fn contains(input: string, needle: string): boolean {
	intrinsic string_contains(input, needle)
}

export fn starts_with(input: string, prefix: string): boolean {
	intrinsic string_starts_with(input, prefix)
}
```

Questions raised:

- Are built-in string operations part of the compiler's core lowering model?
- If these are extern methods instead, how does Polena express JavaScript
  receiver calls without exposing general class or prototype interop?

## Sketch: Arrays

```polena
// std/array.plna
// Classification: compiler intrinsics plus ordinary Polena wrappers.

export fn len<T>(items: []T): number {
	intrinsic array_len(items)
}

export fn get<T>(items: []T, index: number): Option<T> {
	intrinsic array_get(items, index)
}

export fn push<T>(items: []T, value: T): void {
	intrinsic array_push(items, value)
}
```

Questions raised:

- Does `[]T` mean a mutable JavaScript array, an immutable value, or a
  language-level collection with controlled mutation?
- Does `array_get` return `Option<T>` while indexing syntax panics?
- Are higher-order helpers such as `map` blocked until anonymous functions and
  function types are settled?

## Sketch: JSON

```polena
// std/json.plna
// Classification: trusted extern declaration, generated exception wrapper,
// unknown boundary data, and explicit decoders.

type JsonValue = unknown;

extern module "global:JSON" {
	fn parse_raw(input: string): JsonValue js_throws JsError;
	fn stringify_raw(value: JsonValue): string js_throws JsError;
}

export fn parse(input: string): Result<JsonValue, JsError> {
	generated_try parse_raw(input)
}

export fn stringify(value: JsonValue): Result<string, JsError> {
	generated_try stringify_raw(value)
}

export fn as_string(value: JsonValue): Option<string> {
	intrinsic unknown_as_string(value)
}

export fn as_number(value: JsonValue): Option<number> {
	intrinsic unknown_as_number(value)
}

export fn field(value: JsonValue, name: string): Option<JsonValue> {
	intrinsic unknown_object_field(value, name)
}
```

Questions raised:

- Is `JsError` a universal opaque type, runtime-profile-specific, or declared
  by each extern module?
- Should exception wrapping be triggered by `js_throws`, by a `Result` return
  type, or by explicit wrapper code?
- Should `unknown` be globally available, or should libraries define aliases
  such as `JsonValue`?

## Sketch: Environment Variables

```polena
// std/env.plna
// Classification: trusted extern declaration plus generated nullish wrapper.

extern module "node:process" {
	fn getenv_raw(name: string): string js_return nullish_as_option;
}

export fn get(name: string): Option<string> {
	getenv_raw(name)
}
```

Questions raised:

- Does `js_return nullish_as_option` belong on the return type, the function,
  or the import binding?
- Should bare `string` from an extern assert non-nullish at runtime, trust the
  declaration completely, or remain unchecked?
- How do runtime profiles select Node, Bun, Deno, browser, or shared host APIs?

## Sketch: Date

```polena
// std/date.plna
// Classification: opaque foreign type plus constructor, static function, and
// method declarations.

extern module "global:Date" {
	type Date = opaque;

	static fn now(): number;
	constructor fn from_millis(milliseconds: number): Date;
	method fn to_iso_string(self: Date): string;
	method fn time_millis(self: Date): number;
}

export fn now_millis(): number {
	now()
}

export fn from_millis(milliseconds: number): Date {
	from_millis(milliseconds)
}

export fn to_iso_string(date: Date): string {
	to_iso_string(date)
}
```

Questions raised:

- Does Polena need distinct foreign declarations for `static`, `constructor`,
  `method`, and `property`?
- How does the declaration encode JavaScript names when Polena wrapper names
  differ?
- Is an opaque `Date` safe to pass around without exposing mutation or object
  identity semantics?

## Early Read

The experiment currently leans toward this split:

- compiler-blessed intrinsics for core primitives and arrays,
- hand-written extern declarations for foreign modules and host APIs,
- opaque types for JavaScript objects that Polena cannot inspect,
- `unknown` plus explicit decoders for dynamic data,
- generated wrappers for selected nullish and exception boundary policies.

That is only a hypothesis. The sketches should be expanded until the model
either feels coherent enough to specify or reveals a need for a different
interop design.
