# Language Specification

Status: early draft  
Primary target: JavaScript  
Source encoding: UTF-8

This is the entry point for the Polena language specification. The specification
is split into focused documents so each area can evolve without turning this
file into an unreviewable draft.

The files under `docs/language/` collectively define the intended language
design. For current implementation support, see
[`implementation-status.md`](implementation-status.md).

---

## Reading Order

1. [Language Overview](language/overview.md)
2. [Lexical Structure](language/lexical-structure.md)
3. [Primitive Types](language/primitive-types.md)
4. [Bindings and Expressions](language/bindings-and-expressions.md)
5. [Collections and Objects](language/collections-and-objects.md)
6. [Algebraic Data and Errors](language/algebraic-data-and-errors.md)
7. [Control Flow and Functions](language/control-flow-and-functions.md)
8. [Types and Generics](language/types-and-generics.md)
9. [Modules, Packages, and Interop](language/modules-and-interop.md)
10. [Future Features](language/future-features.md)
11. [Examples](language/examples.md)
12. [Open Design Questions](language/open-questions.md)

---

## Document Boundaries

- Use `docs/language/` for intended source-language syntax and semantics.
- Use [`build-spec.md`](build-spec.md) for `polena.toml`, package layout, and
  build/init/run operation semantics.
- Use [`cli-spec.md`](cli-spec.md) for command-line behavior.
- Use [`prelude.md`](prelude.md) for currently compiler-provided prelude items.
- Use [`implementation-status.md`](implementation-status.md) for implemented
  compiler behavior.
- Use [`compiler-directives.md`](compiler-directives.md) for directive-specific
  design notes.

When a design area is marked **TBD**, do not infer behavior from TypeScript,
JavaScript, Rust, Zig, or another language. Settle the Polena design first, then
update the relevant spec document.
