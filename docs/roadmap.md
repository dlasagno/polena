# Roadmap

Status: maintained planning note  
Scope: compiler, language design, tooling, and eventual Rust port

This roadmap describes the practical next steps from the current TypeScript
compiler MVP. It is not a release schedule. The language specification remains
the source of truth for intended syntax and semantics, and
`docs/implementation-status.md` remains the source of truth for what the
compiler currently supports.

The current MVP already has a useful vertical slice: parsing, checking,
diagnostics, JavaScript emission, package builds, current-package imports,
language-server diagnostics, hovers, document symbols, and a VS Code extension.
The priority now is to harden that surface before expanding into larger
language areas.

---

## Guiding Principles

- Keep the compiler small, explicit, and well-tested.
- Preserve clear phase boundaries between lexing, parsing, checking, lowering,
  code generation, diagnostics, CLI behavior, and tooling.
- Prefer completing vertical slices end-to-end over adding syntax that is only
  partially implemented.
- Treat diagnostics as product behavior, not incidental error messages.
- Avoid committing to unresolved language semantics before the specification is
  updated.
- Keep TypeScript implementation choices close to shapes that map naturally to
  Rust.
- Add dependencies only when they solve a real problem and do not complicate the
  compiler or future port.

---

## Current Baseline

Implemented foundations include:

- Source spans, structured diagnostics, and diagnostic rendering.
- Lexer and parser coverage for the MVP language surface, including doc
  comments.
- Variables, functions, arrays, objects, enums, exhaustive `match`, generics,
  `Option<T>`, `Result<T, E>`, and expression-valued control flow.
- JavaScript code generation for single-file and package compilation.
- Package manifests, recursive source discovery, `build`, `init`, and `run`.
- Current-package imports with `@/module`, explicit exports, and ESM output.
- Language-server diagnostics, package analysis, manifest completions, hover,
  and document symbols.
- VS Code syntax highlighting and an LSP client.

Important open areas include:

- JavaScript and TypeScript interop declarations.
- TypeScript declaration generation.
- Standard-library packaging and runtime profile design.
- `try`, panic semantics, unsafe operations, async, traits, and compile-time
  evaluation.
- External dependencies, workspaces, and package management.

---

## Track 1: Harden the Current MVP

Goal: make the implemented language surface reliable, documented, and pleasant
to use.

Candidate work:

- Close gaps between implemented behavior and `docs/language-spec.md`.
- Expand tests for lexer edge cases, parser recovery, checker diagnostics, code
  generation, package builds, CLI behavior, and language-server features.
- Audit diagnostic codes for consistency, stable wording, actionable help text,
  and accurate spans.
- Improve parser recovery where common syntax mistakes create noisy cascading
  diagnostics.
- Add more end-to-end example programs that exercise imports, generics,
  objects, enums, `Option`, `Result`, checked indexing, and diagnostics.
- Add golden tests for emitted JavaScript where output stability matters.
- Keep `README.md`, `docs/language-spec.md`, `docs/prelude.md`, and
  `docs/implementation-status.md` aligned with compiler behavior.

Exit criteria:

- `bun run check` is the expected local quality gate.
- The examples under `examples/` build consistently.
- Diagnostics for supported syntax have stable tests.
- Implementation status accurately reflects all supported behavior.

---

## Track 2: Finish Module and Package Semantics

Goal: turn current-package imports into a stable foundation for larger programs.

Candidate work:

- Specify and test all current-package import forms, visibility rules, duplicate
  imports, private export access, missing modules, and cycles.
- Decide whether re-exports are in scope for the initial module system.
- Define package-root discovery behavior explicitly for CLI and tooling.
- Decide how library packages should expose public APIs to generated output.
- Add import-chain context to module diagnostics where useful.
- Keep language-server package analysis identical to CLI package analysis.

Design questions to settle first:

- Re-export syntax and semantics.
- Opaque type visibility rules.
- Whether `src/index.plna` remains mandatory for every package shape.
- How external packages will eventually map onto the current `@/` import model.

Exit criteria:

- Multi-file packages compile through the CLI with predictable ESM output.
- Module diagnostics include useful source spans and, where relevant, import
  context.
- The module rules in the language spec, build spec, and implementation status
  agree.

---

## Track 3: Standard Library and Runtime Model

Goal: move from a tiny compiler-provided prelude toward deliberate core library
support.

Candidate work:

- Decide which prelude items are stable language affordances and which are
  bootstrap conveniences.
- Define runtime profiles for Node, Bun, Deno, browser, and shared JavaScript
  environments only when they affect source checking or emitted code.
- Add basic string, array, numeric, and formatting helpers when their signatures
  are representable without special cases.
- Define parsing helpers that return `Result` or `Option`.
- Replace ad hoc runtime failures with the chosen panic model where appropriate.
- Keep runtime helpers small, explicit, and tested.

Design questions to settle first:

- Standard-library packaging and import model.
- Panic representation and whether checked indexing should throw
  `PolenaPanic`, `RangeError`, or another runtime value.
- Runtime profile selection and whether it belongs in `polena.toml`.
- Whether standard library code is written in Polena, TypeScript, or a mix
  during the bootstrap period.

Exit criteria:

- Common small programs do not depend on compiler magic beyond intentional
  built-ins.
- Runtime helpers have tests and documented behavior.
- The prelude is documented as stable or explicitly provisional.

---

## Track 4: TypeScript and JavaScript Interop

Goal: make Polena usable from JavaScript and TypeScript without blurring
language boundaries.

Candidate work:

- Specify JavaScript/TypeScript interop declarations.
- Define how `unknown`, `null`, `undefined`, exceptions, classes, and async
  JavaScript APIs are represented at boundaries.
- Add `.d.ts` declaration generation as a separate compiler phase.
- Map Polena primitive, array, object, enum, function, `Option`, and `Result`
  types to TypeScript declarations.
- Add tests that compare emitted JavaScript and emitted declarations.

Design questions to settle first:

- Native declaration file format.
- Whether `.d.ts` input is consumed directly or converted into Polena-specific
  declarations.
- Class interop shape and whether construction/member access requires special
  syntax.
- Boundary behavior for JavaScript exceptions and promises.

Exit criteria:

- Exported Polena APIs produce stable declaration files.
- Interop boundaries are explicit in source code.
- Unsupported constructs produce clear diagnostics or documented fallback
  output.

---

## Track 5: Error Handling, Unsafe, and Async

Goal: complete the control-flow story around recoverable errors, panics,
unchecked operations, and asynchronous JavaScript hosts.

Candidate work:

- Specify and implement the `try` operator after `Result` conversion rules are
  clear.
- Specify panic semantics for checked operations and violated invariants.
- Define explicit unsafe operations, including unchecked array access if it is
  accepted into the language.
- Specify async function syntax and the interaction between async, `Result`, and
  `try`.
- Add diagnostics that guide users away from exception-like or truthiness-based
  patterns.

Design questions to settle first:

- Exact `try` operator syntax and permitted contexts.
- Error conversion rules.
- Panic value, stack behavior, and async unwinding.
- Unsafe block or unsafe operation syntax.

Exit criteria:

- Programs can model absence and recoverable errors ergonomically without
  exceptions as ordinary control flow.
- Panics and unsafe operations are explicit and documented.
- Async behavior maps predictably to JavaScript.

---

## Track 6: Rust Port Preparation

Goal: reduce risk before beginning the actual Rust implementation.

Candidate work:

- Document compiler phase APIs and data ownership expectations.
- Keep AST, token, diagnostic, type, and symbol data as explicit discriminated
  unions or Rust-like records.
- Avoid TypeScript-only patterns in core compiler logic.
- Build a corpus of accepted and rejected programs with expected diagnostics.
- Identify runtime helper behavior that must be preserved byte-for-byte or
  semantically.
- Decide whether the Rust port starts as a lexer/parser port, a checker port, or
  a parallel compiler with shared fixtures.

Exit criteria:

- The TypeScript compiler has enough tests to serve as an executable reference.
- Data models and phase boundaries are documented clearly enough to port.
- Known TypeScript-specific implementation shortcuts are listed before porting
  begins.

---

## Later Work

These areas are important but should wait until the core language and compiler
architecture are stronger:

- Compile-time evaluation and `comptime`.
- Compiler directives such as enum and object introspection.
- External package management and npm ecosystem integration.
- Workspaces and multi-package project commands.
- Optimization passes.
- Incremental compilation.
- Rich formatter support.
- Additional editor features such as refactors and semantic tokens.
- Advanced generic programming.
- Traits or `impl`-style extension mechanisms.

---

## Near-Term Recommended Order

The next useful steps are:

1. Stabilize diagnostics, recovery, and golden tests for the current MVP.
2. Tighten module/package semantics and update the spec around implemented
   imports.
3. Decide the panic model for checked indexing and other runtime failures.
4. Define the first standard-library boundary beyond the provisional prelude.
5. Specify JavaScript/TypeScript interop and declaration generation.

This order keeps each milestone useful on its own while reducing the risk of
language design changes that would ripple through the compiler.
