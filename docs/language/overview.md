# Language Overview

Design goals and global safety rules for Polena.

---

## 1. Design Goals

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

## 34. Safety Rules

The following rules are core to the language:

- No implicit truthiness.
- Only `boolean` may be used in conditions.
- No implicit coercion between unrelated types.
- No normal `null` or `undefined` values.
- Optional values must be represented explicitly.
- Property access must be statically known to be valid.
- Object and array equality with `==` or `!=` is not allowed.
- Array indexing is checked by default.
- Recoverable errors use `Result`.
- Panics are for programmer errors, not normal error handling.
- Match expressions over enums must be exhaustive.
- Runtime type-derived data must be requested explicitly with compiler
  directives.
- JavaScript interop boundaries must be explicit.

