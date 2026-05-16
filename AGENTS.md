# AGENTS.md

Instructions for AI coding agents working in this repository.

Read this before making changes. Keep changes small, grounded in the existing
code, and honest about what was verified.

## Project Context

Polena is a compiler for a new programming language.

The implementation is currently TypeScript in a Bun workspace. A later goal is
to port the compiler to Rust, so core compiler code should stay explicit,
simple, data-oriented, and well tested.

Optimize for:

1. Correct language behavior.
2. Clear compiler phase boundaries.
3. High-quality diagnostics.
4. Focused tests for behavior changes.
5. TypeScript that maps naturally to Rust.
6. Minimal dependencies.
7. Small, reviewable changes.

## Repository Map

- `packages/compiler` contains source files, spans, lexer, parser, AST,
  semantic analysis, checker, code generation, query helpers, and diagnostic
  rendering.
- `packages/build` owns package layout, `polena.toml`, source discovery,
  build/init/run operations, and runtime invocation.
- `packages/cli` owns command-line argument parsing and process I/O. Keep it
  thin.
- `packages/language-server` owns LSP diagnostics, package analysis overlays,
  manifest completions, hover, and document symbols.
- `packages/vscode-extension` owns VS Code packaging, grammar, language
  configuration, and the LSP client.
- `examples` contains package examples that should keep compiling.
- `docs/language-spec.md` is the language-spec entry point.
- `docs/language/` contains the topic spec files that collectively define
  language syntax and semantics.
- `docs/implementation-status.md` describes what the current compiler actually
  implements.
- `docs/build-spec.md` and `docs/cli-spec.md` define package and CLI behavior.
- `docs/prelude.md` describes compiler-provided prelude items.

## Before Editing

- Check the current worktree status and do not overwrite unrelated user changes.
- Read the files relevant to the change before editing.
- Check `package.json` for available scripts. Do not invent commands.
- Follow existing style, data shapes, tests, and module boundaries.
- For language behavior, read `docs/language-spec.md` and the relevant
  `docs/language/` topic file first.
- If a relevant spec section is marked **TBD**, ask before implementing behavior
  that depends on it.

## Language and Semantics

Do not silently change language design. If a change intentionally adds, removes,
or changes syntax or semantics, update the relevant spec file and
`docs/implementation-status.md`.

Core language goals to preserve:

- Compile to JavaScript as the primary target.
- Avoid implicit truthiness; only `boolean` values may be used in conditions.
- Avoid implicit coercion between unrelated types.
- Do not expose JavaScript `null` or `undefined` as ordinary language values.
- Represent optional values with `Option`.
- Represent recoverable errors with `Result`, not ordinary exceptions.
- Use panics only for programmer errors or violated invariants.
- Require exhaustive matches over enums.
- Keep JavaScript and TypeScript interop boundaries explicit.
- Do not add user-facing classes to the initial core language.

## Compiler Boundaries

Keep phases separate.

- The lexer should not perform parsing, name resolution, or type checking.
- The parser should preserve spans and recover from common syntax errors where
  practical, but should not type-check.
- Semantic analysis/checking should report structured diagnostics rather than
  throwing for user-facing language errors.
- Code generation should consume checked structures and should not reinterpret
  source text.
- Diagnostic data should stay separate from diagnostic rendering.
- CLI and LSP code should call compiler/build APIs rather than duplicating
  compiler behavior.

## TypeScript Style

Prefer:

- Explicit exported types.
- Discriminated unions for tokens, AST, diagnostics, semantic entities, and
  result types.
- Plain objects and small pure functions.
- `readonly` where it improves clarity.
- `Map` and `Set` for lookup tables.
- Explicit result objects such as `{ ok: true, ... } | { ok: false, ... }`.
- Stable node IDs or maps for cross-references.

Avoid:

- `any`; use `unknown` for uncertain values.
- Hidden global mutable state.
- Exceptions for ordinary language diagnostics.
- Runtime reflection for compiler logic.
- Class-heavy AST or semantic models.
- Complex generic programming unless it clearly improves correctness.
- Callback-heavy or promise-heavy architecture inside core compiler phases.

## Diagnostics

Diagnostics are product behavior.

When adding or changing diagnostics:

- Include source spans whenever possible.
- Use stable diagnostic codes when the project has a matching code.
- Make messages specific and actionable.
- Avoid vague messages such as "invalid syntax".
- Avoid cascading diagnostics from one root cause.
- Add or update tests for valid behavior and diagnostic behavior.

## Tests and Checks

When changing compiler behavior, add tests. Look for the nearest existing test
style first.

Useful areas:

- Lexer token and error tests.
- Parser AST and recovery tests.
- Checker/type diagnostics.
- Diagnostic rendering tests.
- Package build/CLI tests.
- Language-server diagnostics, hover, symbols, and completion tests.
- Example package coverage when behavior affects user-facing workflows.

Use Bun. Common commands are:

```bash
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run check
```

Run the narrowest relevant checks during development, and run `bun run check`
before finishing when feasible.

## Documentation

Update docs when changing:

- Language syntax or semantics.
- Implemented feature status.
- Compiler architecture or public APIs.
- CLI/package behavior.
- Diagnostics or test conventions.
- Prelude behavior.

Use the right document:

- Intended language design: `docs/language/*.md`.
- Current support matrix: `docs/implementation-status.md`.
- Build/package behavior: `docs/build-spec.md`.
- CLI behavior: `docs/cli-spec.md`.
- Prelude: `docs/prelude.md`.
- Planning: `docs/roadmap.md`.

## Dependencies and Generated Files

Do not add dependencies casually. Before adding one, check whether the feature
can be implemented simply in the repo and whether the dependency complicates
the Rust port, startup, CLI distribution, or licensing.

Do not commit generated files unless the repository already does so or the user
explicitly asks. If generated output becomes part of the repo, document how to
regenerate it and keep it deterministic.

## Safety

Do not introduce code that:

- Executes arbitrary user input as shell commands.
- Reads or writes outside intended project paths.
- Leaks environment variables or secrets.
- Downloads code at runtime without explicit approval.
- Disables security checks without explanation.

For compiler features that interact with the filesystem, keep behavior explicit
and testable.

## Final Response

When completing a task, report:

- What changed.
- Which files were modified.
- Which commands were run.
- Any remaining concerns or follow-up recommendations.

Do not claim a command was run if it was not. Do not claim behavior is
implemented if only the spec or docs changed.
