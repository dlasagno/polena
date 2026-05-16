# Implementation Status

Status: maintained implementation note  
Scope: current TypeScript compiler MVP

This document tracks what the current compiler implements from the language
draft. It is not the language specification. The specification describes the
intended language design; this file describes the current compiler surface.

Status values:

- **Implemented**: parsed, checked, and emitted or otherwise supported
  end-to-end.
- **Partially implemented**: some parts exist, but behavior is incomplete,
  narrower than the spec, or missing important checks.
- **Not implemented**: not currently supported by the compiler MVP.

---

## Source and Lexing

| Feature | Status | Notes |
|---|---|---|
| UTF-8 source files | Partially implemented | Source is handled as JavaScript strings; no explicit encoding validation. |
| Line comments with `//` | Implemented | Block comments are not supported. |
| Identifiers | Partially implemented | ASCII letters, digits, `_`, and `$` are supported. Unicode identifiers are not implemented. |
| Reserved words | Partially implemented | Only MVP keywords are tokenized. Several spec-reserved future words are not recognized yet. |
| Invalid character diagnostics | Implemented | Lexer reports invalid characters. |

---

## Primitive Values and Types

| Feature | Status | Notes |
|---|---|---|
| `number` literals and type | Implemented | Includes decimal, exponent, hex, octal, binary, and `_` separators. |
| `bigint` literals and type | Implemented | Fractional bigint literals are rejected. |
| `boolean` literals and type | Implemented | `true` and `false`. |
| `string` literals and type | Implemented | Includes basic escapes. |
| String interpolation | Implemented | Interpolation expressions are parsed and emitted. |
| Multiline strings | Implemented | Uses repeated `\\` line prefixes. |
| `void` type | Implemented | Supported for function returns and block results. |
| Unicode string escapes | Not implemented | Still TBD in the spec. |

---

## Variables and Assignment

| Feature | Status | Notes |
|---|---|---|
| `const` declarations | Implemented | Initializer is required. |
| `let` declarations | Implemented | Initializer is required. |
| Optional type annotations | Implemented | Used for variables and checked against initializers. |
| Type inference from initializers | Implemented | Supported for MVP expression types. |
| Reassignment of `let` bindings | Implemented | Simple name assignment only. |
| Reassignment of `const` bindings rejected | Implemented | Diagnostics are emitted. |
| Compound assignment | Implemented | `+=`, `-=`, `*=`, `/=`, `%=` for numeric `let` bindings, object fields, and array elements. |
| Assignment to array elements | Implemented | Index assignment and compound assignment use the same checked runtime index rules as index reads. |
| Assignment to object fields | Implemented | Known fields may be assigned when the value type is compatible; numeric fields support compound assignment. |
| Shadowing rules | Partially implemented | The MVP rejects duplicate names in the same scope and shadowing names from outer scopes; future redeclaration shadowing remains TBD in the spec. |

---

## Expressions and Operators

| Feature | Status | Notes |
|---|---|---|
| Unary `!` | Implemented | Operand must be `boolean`. |
| Unary `-` | Implemented | Operand must be numeric. |
| Arithmetic operators | Implemented | Numeric operands only; `number` and `bigint` cannot be mixed. |
| Comparison operators | Implemented | Equality supports primitive values and rejects arrays and functions; ordering supports same-type `number` and `bigint` operands only. |
| Logical `and` / `or` | Implemented | Operands must be `boolean`. |
| String concatenation with `++` | Implemented | Both operands must be `string`; emitted JavaScript uses `.concat`. |
| Array concatenation with `++` | Implemented | Both operands must be arrays with the same element type; emitted JavaScript uses `.concat`. |

---

## Control Flow

| Feature | Status | Notes |
|---|---|---|
| `if` expressions | Implemented | Conditions must be `boolean`; value-producing `if` requires `else`. |
| Statement-position `if` without `else` | Implemented | Used when the result is ignored. |
| Branch type checking | Implemented | Branch result types must be compatible when used as a value. |
| `while` loops | Implemented | Conditions must be `boolean`. |
| `break` and `continue` | Implemented | Diagnostics reject use outside loops. |
| While continue expression | Implemented | Supports expression or assignment continuation. |
| Value-producing `while ... else ...` | Implemented | Supports `break value` and compatible exit types. |

---

## Functions

| Feature | Status | Notes |
|---|---|---|
| Function declarations | Implemented | Parameters and return types are explicit. |
| Function calls | Implemented | Arity and argument types are checked. |
| Final-expression returns | Implemented | Function body final expressions are checked against return type. |
| Explicit `return expr;` | Implemented | Checked against return type. |
| Anonymous functions | Not implemented | Spec includes likely syntax, but MVP does not parse it. |
| Function type syntax | Not implemented | Function types exist internally but cannot be written in source. |
| Generic functions | Partially implemented | Declarations such as `fn id<T>(value: T): T` are supported with inferred type arguments at calls; explicit call type arguments are not implemented. |
| Return type inference | Not implemented | Function return types are required. |

---

## Arrays

| Feature | Status | Notes |
|---|---|---|
| Array type syntax `[]T` | Implemented | Supports nested arrays. |
| Array literals | Implemented | Element types must be compatible. |
| Empty array literals with contextual type | Implemented | Type annotations can provide the element type. |
| Untyped empty arrays rejected | Implemented | Diagnostic asks for a type annotation. |
| `.length` | Implemented | Type is currently `number`. |
| Checked indexing | Implemented | Emits a runtime helper that rejects negative, fractional, `NaN`, and out-of-bounds indexes. |
| Safe `.get(index)` access | Implemented | Returns `Option<T>` for arrays and emits a helper that returns `.None` for invalid or out-of-bounds indexes. |
| Unsafe array access | Not implemented | Still TBD in the spec. |
| Dedicated `Index` type | Not implemented | Still TBD in the spec. |
| Array element assignment | Implemented | Assignment and compound assignment use checked runtime index rules. |

---

## Objects

| Feature | Status | Notes |
|---|---|---|
| Object literals | Implemented | Parsed, checked, and emitted. Fresh contextual object literals intentionally reject missing and excess fields. |
| Object type declarations | Partially implemented | Supported through `type Name = { ... };`. |
| Structural object typing | Implemented | Non-literal object values may be assigned to narrower object types when required fields are present and compatible. |
| Object property access | Implemented | Known fields can be read from object values; unknown fields are rejected. |
| Object field assignment | Implemented | Field must be known on the object's static type and value type must be compatible. |
| Object introspection directives | Not implemented | Depends on directives and object types. |

---

## Type Declarations and Type System

| Feature | Status | Notes |
|---|---|---|
| Primitive type annotations | Implemented | `number`, `bigint`, `boolean`, `string`, `void`. |
| Array type annotations | Implemented | `[]T`. |
| `type Name = ...;` declarations | Partially implemented | Supports aliases to primitive, array, object, enum, named alias, and generic instantiation types. |
| Type aliases | Implemented | Transparent aliases; recursive aliases are rejected. |
| Separate type/value namespaces | Implemented | Type aliases and value bindings may use the same name. |
| Generics | Partially implemented | Generic type declarations and instantiations are supported, including substitution in object fields, enum payloads, aliases over generic instantiations, and inferred generic function calls. Explicit function call type arguments and constraints are not implemented. |
| `unknown` source type | Not implemented | Internal unknown type exists for error recovery only. |

---

## Enums, Match, Option, and Result

| Feature | Status | Notes |
|---|---|---|
| Enum declarations | Implemented | Supports fieldless variants and positional associated-data variants. Named associated fields are intentionally unsupported. |
| Enum values | Implemented | Supports `Color.Red`, `Message.Move(1, 2)`, contextual `.Red`, and contextual `.Move(1, 2)`. Runtime representation is implementation-defined. |
| Enum equality | Implemented | `==` and `!=` are valid for fieldless enum values of the same enum type. Equality for enums with associated data is not implemented. |
| Match expressions | Partially implemented | Supports expression arms over enum values with `.Variant`, `Enum.Variant`, payload patterns, and `_` patterns. Guards are not implemented. |
| Exhaustiveness checking | Implemented | Enum matches must cover every variant unless a wildcard arm is present. Duplicate and unreachable arms are rejected. |
| `Option<T>` | Implemented | Provided by the compiler prelude as a generic enum with `.Some(T)` and `.None`. |
| `Result<T, E>` | Implemented | Provided by the compiler prelude as a generic enum with `.Ok(T)` and `.Err(E)`. |
| `try` operator | Not implemented | Depends on `Result`. |
| Panic model | Partially implemented | Checked indexing throws a JavaScript `RangeError`; the general panic model is TBD. |

---

## Compile-Time Features and Directives

| Feature | Status | Notes |
|---|---|---|
| `comptime` | Not implemented | Spec direction only. |
| Compiler directive syntax `@directive(...)` | Not implemented | Dedicated directive definitions exist in docs only. |
| Enum introspection directives | Not implemented | Depends on directives and enums. |
| Object introspection directives | Not implemented | Depends on directives and object types. |
| User-defined directives/macros | Not implemented | Deferred in the spec. |

---

## Modules, Interop, and Async

| Feature | Status | Notes |
|---|---|---|
| Modules/imports/exports | Partially implemented | Package compilation supports current-package `@/` imports, declaration exports, cycle/missing-module diagnostics, and ESM output. External packages, `@std`, workspaces, and re-exports are not implemented. |
| JavaScript/TypeScript interop declarations | Not implemented | Still TBD in the spec. |
| TypeScript declaration generation | Not implemented | Goal, not MVP behavior. |
| Async functions | Not implemented | Still TBD in the spec. |
| Classes and class interop | Not implemented | User-facing classes are not part of the initial language. |
| Traits and `impl` blocks | Not implemented | Deferred in the spec. |

---

## Tooling and CLI

| Feature | Status | Notes |
|---|---|---|
| JavaScript code generation | Implemented | Covers the MVP language surface and package ESM output. |
| Build-system package split | Implemented | `@polena/build` owns manifest parsing, package layout, build, init, and run operations; the compiler operates on in-memory sources. |
| CLI build/init/run commands | Implemented | `polena build [path] [--out-dir <dir>]`, `polena init [path] [--name <name>]`, and `polena run [path] [-- args...]` are implemented. |
| Diagnostics with spans | Implemented | Compiler and CLI render source locations. |
| Diagnostic codes | Implemented | Current diagnostics use stable codes. |
| Language server diagnostics and completions | Implemented | Diagnostics-first LSP support exists, including package-aware diagnostics for current-package `@/` imports and manifest completions for `polena.toml`. |
| VS Code extension | Partially implemented | Syntax highlighting and LSP client exist for the MVP surface. |
