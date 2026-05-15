# Roadmap

Status: first draft  
Scope: compiler, language design, tooling, and eventual Rust port

This roadmap describes a practical path from the current TypeScript compiler MVP
to a more complete Polena implementation. It is not a commitment to exact dates
or release contents. The language specification remains the source of truth for
intended syntax and semantics, and `docs/implementation-status.md` remains the
source of truth for what the compiler currently supports.

The main priority is to grow the language without losing compiler correctness,
diagnostic quality, or a clear architecture that can later be ported to Rust.

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

## Phase 0: Stabilize the Existing MVP

Goal: make the current supported language surface reliable, documented, and
pleasant to use.

Candidate work:

- Close known gaps between implemented features and their current spec wording.
- Expand tests for lexer edge cases, parser recovery, checker diagnostics, code
  generation, CLI behavior, and language-server diagnostics.
- Audit diagnostic codes for consistency, stable wording, actionable help text,
  and accurate spans.
- Improve parser recovery where common syntax mistakes currently create noisy
  cascading diagnostics.
- Keep `README.md`, `docs/language-spec.md`, `docs/prelude.md`, and
  `docs/implementation-status.md` aligned with compiler behavior.
- Add more end-to-end example programs that exercise functions, arrays,
  expression-valued control flow, checked indexing, and diagnostics.
- Keep equality semantics for unsupported types covered by spec text, checker
  diagnostics, tests, and implementation status.

CLI:

- Keep CLI code thin and delegate compiler behavior to package APIs.
- Keep `--help`, `--version`, explicit commands, and error exit codes stable.
- Add snapshot or fixture-based tests for CLI output where output is intended to
  be stable.

Language server:

- Keep language-server diagnostics based on the same compiler APIs used by the
  CLI.
- Track document versions carefully to avoid reporting stale diagnostics.
- Add tests for opened documents, changed documents, and syntax errors.

VS Code extension:

- Ensure the bundled language server is built and launched consistently.
- Keep language configuration, brackets, comments, and indentation behavior
  aligned with the current language surface.
- Improve README instructions for local development and VSIX packaging where
  needed.

Exit criteria:

- `bun run check` is the expected local quality gate.
- The current MVP examples compile consistently.
- Diagnostics for supported syntax have stable tests.
- Implementation status accurately reflects all supported behavior.

---

## Phase 1: Type Declarations and Object Values

Goal: introduce named types and object support as the next major foundation for
real programs.

Candidate work:

- Implement `type Name = ...;` declarations.
- Add a separate type namespace if that remains the chosen design.
- Implement object type syntax and object literals.
- Implement object property access and type checking.
- Implement object field assignment only after mutability and assignment rules
  are specified clearly.
- Add tests for duplicate fields, missing fields, extra fields, field ordering,
  nested objects, and diagnostic spans.

CLI:

- No dedicated CLI feature work is expected unless object support changes emitted
  file behavior or diagnostics formats.

Language server:

- Ensure diagnostics for type declarations and objects match compiler behavior.
- Add document symbols for type and function declarations if declaration data is
  stable enough.

VS Code extension:

- Update syntax highlighting for `type` declarations, object type syntax, object
  literals, and property access.
- Keep bracket and indentation behavior sensible for object literals and object
  types.

Design questions to settle first:

- Exact structural typing rules for objects.
- Whether object field order has any semantic significance.
- Shadowing rules for values and types.
- Mutability rules for object values and object fields.

Exit criteria:

- Named object types can be parsed, checked, emitted to JavaScript, and diagnosed
  end-to-end.
- Object examples are present in the language spec and compiler tests.
- Unsupported object behavior fails with clear diagnostics.

---

## Phase 2: Enums and Exhaustive Match

Goal: add algebraic data modeling and exhaustive control flow.

Candidate work:

- Add match guards if they become part of the initial `match` feature.

CLI:

- No dedicated CLI feature work is expected beyond preserving diagnostic output
  and generated JavaScript behavior.

Language server:

- Add document symbols for enum declarations if declaration data is stable
  enough.

VS Code extension:

- Update syntax highlighting for enum declarations, variants, `match`, patterns,
  and match arms.

Design questions to settle first:

- Whether guards are part of the initial `match` feature.

Exit criteria:

- Fieldless enums, associated-data enums, and exhaustive `match` work
  end-to-end.
- The checker can produce focused missing-case and malformed-pattern
  diagnostics.
- The generated JavaScript remains readable and stable.

---

## Phase 3: Option, Result, and Error Handling

Goal: support explicit absence and recoverable errors without exposing
JavaScript `null`, `undefined`, or ordinary exceptions as language-level control
flow.

Candidate work:

- Decide whether `Option` and `Result` are built-in types, prelude types, or
  standard-library types.
- Implement enough generics or compiler-known type forms to express
  `Option<T>` and `Result<T, E>`.
- Add construction, matching, and ergonomic access patterns.
- Implement the `try` operator after `Result` semantics are specified.
- Define how panics are represented in generated JavaScript.
- Replace ad hoc runtime failures with the chosen panic model where appropriate.
- Add tests for explicit handling, rejected implicit truthiness, and diagnostic
  quality.

CLI:

- No dedicated CLI feature work is expected unless panic or runtime-profile
  choices require new compile options.

Language server:

- Surface diagnostics for invalid `try` usage and unhandled result-like values if
  those checks become part of the language.

VS Code extension:

- Update syntax highlighting if `try`, generic type syntax, or related enum
  patterns add new syntax forms.

Design questions to settle first:

- Generic function syntax and type parameter constraints (basic generic type
  declarations are specified in section 25 of the language spec).
- Whether `Option` and `Result` need special checker support.
- Exact `try` operator syntax and permitted contexts.
- Boundary behavior for JavaScript exceptions.

Exit criteria:

- Programs can model absence and recoverable errors explicitly.
- `try` lowers predictably to JavaScript.
- Diagnostics guide users away from exception-like or truthiness-based patterns.

---

## Phase 4: Modules, Imports, and Interop Boundaries

Goal: make multi-file programs and explicit JavaScript/TypeScript interop
possible.

Candidate work:

- Specify module syntax, file resolution, and export rules.
- Implement name resolution across source files.
- Decide how generated JavaScript modules are emitted.
- Specify JavaScript/TypeScript interop declarations.
- Define how ambient declarations relate to generated TypeScript declarations.
- Add tests for duplicate exports, missing imports, cycles, visibility, and
  stable output paths.

CLI:

- Add support for compiling a module graph.
- Define output directory behavior before multi-file emission is added.
- Document supported file extensions, generated output behavior, and common
  commands.
- Add machine-readable diagnostics output if needed by tools and editors.

Language server:

- Add go-to definition after cross-file name resolution exists.
- Report module resolution diagnostics with useful import-chain context.
- Add completion for imports only after module resolution rules are stable.

VS Code extension:

- Update syntax highlighting for import, export, and interop declaration syntax.
- Add extension-level configuration only if module resolution needs editor
  settings.

Design questions to settle first:

- How much JavaScript interop is allowed before the type system is mature.
- Re-exports and opaque-type syntax.
- Dependency declaration format in `polena.toml`, both for external
  dependencies and for workspace-internal references.
- Compilation-target field in `polena.toml` (browser, Node, and similar).

The module path syntax, import grammar, package layout, workspace layout,
and the declarations-only/`main` rules are specified in section 30 of the
language spec.

Exit criteria:

- Multi-file programs compile through the CLI.
- Interop boundaries are explicit in source code.
- Module diagnostics include useful source spans and import chains.

---

## Phase 5: Standard Library and Runtime Profiles

Goal: move from a tiny compiler-provided prelude toward deliberate core library
support.

Candidate work:

- Split provisional prelude behavior from long-term standard library design.
- Define runtime profiles for browser, CLI, and shared JavaScript environments.
- Add basic string, array, numeric, and formatting helpers only when the type
  system can support their signatures cleanly.
- Add safe array access such as `.get(index)` after `Option` exists.
- Define parsing helpers that return `Result` or `Option`.
- Keep runtime helpers small, explicit, and tested.

CLI:

- Add compile options for runtime profile selection if profiles are not inferred
  from project configuration.

Language server:

- Use the same runtime profile assumptions as the CLI when checking source files.

VS Code extension:

- Expose runtime profile configuration only if the language server needs editor
  settings to match CLI behavior.

Design questions to settle first:

- Standard library packaging and import model.
- Runtime profile selection.
- Whether standard library code is written in Polena, TypeScript, or a mix during
  the bootstrap period.

Exit criteria:

- Common small programs do not depend on compiler magic beyond intentional
  built-ins.
- Runtime helpers have tests and documented behavior.
- The prelude is documented as either stable or explicitly provisional.

---

## Phase 6: TypeScript Declarations

Goal: generate useful `.d.ts` files for JavaScript and TypeScript consumers.

Candidate work:

- Define which Polena constructs are publicly exportable.
- Map Polena primitive, array, object, enum, function, `Option`, and `Result`
  types to TypeScript declarations.
- Decide how explicit interop declarations affect generated `.d.ts` output.
- Add declaration generation as a separate compiler phase.
- Add tests that compare emitted JavaScript and emitted declarations.

CLI:

- Add an option or command behavior for declaration output after the compiler API
  supports it.

Language server:

- No dedicated language-server feature work is expected unless generated
  declarations become visible to editor workflows.

VS Code extension:

- No dedicated VS Code extension work is expected for declaration generation.

Exit criteria:

- Exported Polena APIs produce stable declaration files.
- Unsupported constructs produce clear diagnostics or documented fallback output.
- Declaration generation does not leak checker internals into code generation.

---

## Phase 7: Rust Port Preparation

Goal: reduce risk before beginning the actual Rust implementation.

Candidate work:

- Document compiler phase APIs and data ownership expectations.
- Keep AST, token, diagnostic, type, and symbol data as explicit discriminated
  unions or Rust-like records.
- Avoid TypeScript-only patterns in core compiler logic.
- Build a corpus of accepted and rejected programs with expected diagnostics.
- Add golden tests for emitted JavaScript where output stability matters.
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
- Async functions and async runtime behavior.
- Package management and npm ecosystem integration.
- Optimization passes.
- Incremental compilation.
- Rich formatter support.
- Additional editor features such as refactors and semantic tokens.
- Advanced generic programming.
- Traits or `impl`-style extension mechanisms.

---

## Near-Term Recommended Order

The next few useful steps are:

1. Stabilize diagnostics and tests for the current MVP.
2. Specify and implement `type` declarations.
3. Add object types and object literals as an end-to-end feature.
4. Implement fieldless enums and exhaustive `match`.
5. Revisit `Option`, `Result`, and generics with concrete enum experience.

This order keeps each milestone useful on its own while building toward the
language features that unlock larger programs.
