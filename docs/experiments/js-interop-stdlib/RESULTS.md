# JavaScript Interop Standard Library Experiment Results

Status: design experiment output, not specification  
Date: 2026-05-17  
Scope: pressure test from small stdlib-shaped sketches

## What Was Run

The experiment has no executable runner. I treated it as a design pressure test
and expanded the README sketches into small imagined stdlib modules under
`std/`, then evaluated the questions raised by the setup.

The sketches remain non-normative pseudo-code. They should not be implemented
as language behavior without a separate design decision.

## Sketches Added

- `std/console.plna`: global console functions with one-string wrappers.
- `std/string.plna`: string helpers as compiler intrinsics.
- `std/array.plna`: array helpers as compiler intrinsics.
- `std/json.plna`: JSON parse/stringify through unknown and generated exception
  wrappers.
- `std/env.plna`: environment lookup through host-specific property access.
- `std/date.plna`: opaque Date with constructor, static function, and methods.
- `std/map.plna`: opaque generic JavaScript Map wrapper.

## Evaluation

### Can core string, array, and number helpers be written without general method interop?

Strings and arrays can be sketched cleanly without general method interop if
the compiler provides intrinsics for the small core surface. That keeps v1 away
from JavaScript prototype semantics.

The tradeoff is that the compiler becomes responsible for specifying the
lowering and edge behavior for each intrinsic. For strings, that includes
JavaScript UTF-16 indexing behavior versus any future Polena text model. For
arrays, it includes mutation, bounds, and aliasing behavior.

### Which operations need compiler intrinsics instead of extern declarations?

The strongest candidates are operations on language primitives and built-in
collections:

- string length, slicing, trimming, prefix/contains checks,
- array length, get, push, pop,
- unknown decoders for JSON and dynamic boundary data.

Extern declarations work better for named host APIs, modules, and opaque
objects such as `Date` and `Map`.

### Does `unknown` need to exist before JSON and dynamic boundary data are useful?

Yes. JSON parse has no honest static return type without either `unknown` or a
dedicated sum type for JSON values. `unknown` also generalizes to other dynamic
boundaries, but it needs explicit decoder intrinsics or library primitives to
avoid becoming an escape hatch.

### Is exception wrapping declared on extern functions, requested at call sites, or expressed as a generated wrapper?

The sketches point toward declaring throwable externs with metadata such as
`js_throws JsError`, then exposing ordinary Polena wrappers that return
`Result`. The wrapper can be generated, but the public function should make the
recoverable error explicit.

Call-site wrapping seems too noisy for common APIs and too easy to forget.
Encoding exceptions only in a `Result` return type hides the fact that the raw
foreign call can throw.

### How should `null` and `undefined` become `Option<T>` without weakening bare non-optional `T`?

Nullish conversion should be an explicit extern boundary policy, not a global
coercion. The clearest sketch was an extern return of `Option<T>` plus metadata
such as `js_return nullish_as_option` or `undefined_as_option`.

Bare `T` in an extern declaration should mean the declaration is trusted to
return non-nullish data. If runtime assertions are desired, they should be an
opt-in boundary policy, not implicit language behavior.

### What mechanism represents opaque JavaScript objects?

Opaque extern types fit `Date`, `Map`, errors, and host handles. They allow
Polena code to pass values around without inspecting object internals.

The open issue is semantic documentation: opacity alone does not explain
identity, mutation, equality, cloning, or lifetime behavior. Wrappers must hide
or expose JavaScript idioms intentionally.

### Are constructors, properties, methods, and static functions separate foreign declaration forms?

The sketches suggest yes. A single foreign `fn` form becomes ambiguous quickly:

- constructors allocate or initialize opaque values,
- static functions use a namespace object,
- methods require a receiver and `this` binding,
- properties need get/set forms and nullish policies.

The forms can share syntax, but the model needs to represent them separately.

### Which features should remain deferred for v1?

The experiment still supports deferring:

- `.d.ts` ingestion,
- promises and async,
- variadic calls,
- symbols,
- iterators,
- broad prototype or class interop,
- complex `this` binding beyond explicit method declarations,
- automatic structural decoding of unknown data.

## Early Conclusion

The initial hypothesis held up for a first stdlib slice:

- compiler intrinsics for primitive and collection operations,
- hand-written extern declarations for host APIs,
- opaque extern types for JavaScript objects,
- `unknown` plus explicit decoders for dynamic data,
- generated wrappers for selected exception and nullish policies.

The biggest design pressure came from property access, receiver calls, and
runtime profile selection. Those probably need first-class interop concepts
before the model is precise enough to specify.
