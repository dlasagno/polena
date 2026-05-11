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
| Compound assignment | Implemented | `+=`, `-=`, `*=`, `/=`, `%=` for numeric `let` bindings. |
| Assignment to array elements | Not implemented | Spec direction allows checked index assignment. |
| Assignment to object fields | Not implemented | Objects are not implemented. |
| Shadowing rules | Not implemented | Still TBD in the spec. |

---

## Expressions and Operators

| Feature | Status | Notes |
|---|---|---|
| Unary `!` | Implemented | Operand must be `boolean`. |
| Unary `-` | Implemented | Operand must be numeric. |
| Arithmetic operators | Implemented | Numeric operands only; `number` and `bigint` cannot be mixed. |
| Comparison operators | Partially implemented | Compatible same-type operands are checked, and equality rejects arrays and functions; ordering rules for non-primitive types remain unresolved. |
| Logical `and` / `or` | Implemented | Operands must be `boolean`. |
| String concatenation with `++` | Not implemented | Spec includes `++`, but the MVP does not tokenize or parse it. |
| Array concatenation with `++` | Not implemented | Spec includes `++`, but the MVP does not tokenize or parse it. |

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
| Safe `.get(index)` access | Not implemented | Spec describes it, but there is no standard library array method yet. |
| Unsafe array access | Not implemented | Still TBD in the spec. |
| Dedicated `Index` type | Not implemented | Still TBD in the spec. |
| Array element assignment | Not implemented | Spec direction is checked runtime index assignment. |

---

## Objects

| Feature | Status | Notes |
|---|---|---|
| Object literals | Not implemented | Not parsed or typed. |
| Object type declarations | Not implemented | General `type` declarations are not implemented. |
| Structural object typing | Not implemented | Depends on object types. |
| Object property access | Not implemented | Only array `.length` is supported as a member expression. |
| Object field assignment | Not implemented | Depends on object support. |
| Object introspection directives | Not implemented | Depends on directives and object types. |

---

## Type Declarations and Type System

| Feature | Status | Notes |
|---|---|---|
| Primitive type annotations | Implemented | `number`, `bigint`, `boolean`, `string`, `void`. |
| Array type annotations | Implemented | `[]T`. |
| `type Name = ...;` declarations | Not implemented | Spec direction is all named types use `type`. |
| Type aliases | Not implemented | Depends on type declarations. |
| Separate type/value namespaces | Not implemented | Depends on type declarations. |
| Generics | Not implemented | Still TBD in the spec. |
| `unknown` source type | Not implemented | Internal unknown type exists for error recovery only. |

---

## Enums, Match, Option, and Result

| Feature | Status | Notes |
|---|---|---|
| Enum declarations | Not implemented | `enum` is not tokenized in the MVP. |
| Enum values | Not implemented | Depends on enum declarations. |
| Enum equality | Not implemented | Depends on enum types. |
| Match expressions | Not implemented | `match` is not tokenized in the MVP. |
| Exhaustiveness checking | Not implemented | Depends on enums and match. |
| `Option<T>` | Not implemented | Referenced by the spec, but no generic/std library implementation exists. |
| `Result<T, E>` | Not implemented | Referenced by the spec, but no generic/std library implementation exists. |
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
| Modules/imports/exports | Not implemented | Still TBD in the spec. |
| JavaScript/TypeScript interop declarations | Not implemented | Still TBD in the spec. |
| TypeScript declaration generation | Not implemented | Goal, not MVP behavior. |
| Async functions | Not implemented | Still TBD in the spec. |
| Classes and class interop | Not implemented | User-facing classes are not part of the initial language. |
| Traits and `impl` blocks | Not implemented | Deferred in the spec. |

---

## Tooling and CLI

| Feature | Status | Notes |
|---|---|---|
| JavaScript code generation | Implemented | Covers the MVP language surface. |
| CLI compile command | Implemented | Compiles `.plna` and `.polena` files. |
| Diagnostics with spans | Implemented | Compiler and CLI render source locations. |
| Diagnostic codes | Implemented | Current diagnostics use stable codes. |
| Language server diagnostics | Implemented | Diagnostics-first LSP support exists. |
| VS Code extension | Partially implemented | Syntax highlighting and LSP client exist for the MVP surface. |
