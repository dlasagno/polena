# AGENTS.md

This file contains instructions for AI coding agents working in this repository.

If you are an LLM agent, read this file before making changes.

## Project Context

This repository contains a compiler for a new programming language.

The initial implementation is written in TypeScript. A later goal is to port the
compiler to Rust. Therefore, code should be clear, explicit, well-tested, and
designed in a way that maps naturally to Rust.

Do not optimize prematurely. Do not introduce clever abstractions unless they
solve a demonstrated problem.

## Primary Goals

When working in this repository, optimize for:

1. Correct compiler behavior.
2. Clear and maintainable architecture.
3. High-quality diagnostics.
4. Comprehensive tests.
5. Simple TypeScript that can later be ported to Rust.
6. Minimal, justified dependencies.
7. Small, reviewable changes.

## Agent Behavior Rules

Before editing:

- Inspect the repository structure.
- Read relevant existing files.
- Check `package.json` for scripts and dependencies.
- Check existing tests and conventions.
- Prefer following existing project style over inventing a new one.

When editing:

- Make the smallest useful change.
- Keep changes focused on the user request.
- Do not rewrite unrelated code.
- Do not rename public APIs unless requested or clearly necessary.
- Do not introduce large abstractions without explaining why.
- Do not silently change language semantics.
- Preserve formatting conventions.
- Add tests for behavior changes.
- Update docs when needed.

After editing:

- Run relevant checks if tool access is available.
- Report what changed.
- Report which checks were run.
- Report any checks that could not be run.
- Mention risks, limitations, or follow-up tasks.

## TypeScript Guidelines

Use TypeScript conservatively.

Prefer:

- Explicit types for exported APIs.
- Discriminated unions for AST, tokens, diagnostics, IR, and semantic entities.
- Plain objects for compiler data.
- `readonly` where it improves clarity.
- `Map` and `Set` for lookup tables.
- Small pure functions.
- Explicit return values.
- Stable IDs for cross-references.
- Separate modules for separate compiler phases.

Avoid:

- `any`, unless there is a documented reason.
- Dynamic property access for core data structures.
- Prototype manipulation.
- Decorators in compiler core.
- Class-heavy architectures for AST nodes.
- Hidden mutation.
- Global mutable state.
- Exceptions for ordinary user-facing language errors.
- Complex generic programming unless it clearly improves correctness.
- Runtime reflection for compiler logic.

Use `unknown` instead of `any` when handling uncertain values.

## Rust Portability Guidelines

The compiler is expected to be ported to Rust later.

Write TypeScript that has a reasonably obvious Rust equivalent.

Prefer TypeScript like this:

```ts
export type Token =
  | { kind: "Identifier"; span: Span; text: string }
  | { kind: "Integer"; span: Span; text: string }
  | { kind: "String"; span: Span; text: string }
  | { kind: "Equal"; span: Span }
  | { kind: "Eof"; span: Span };
```

This maps well to Rust:

```rust
pub enum Token {
    Identifier { span: Span, text: String },
    Integer { span: Span, text: String },
    String { span: Span, text: String },
    Equal { span: Span },
    Eof { span: Span },
}
```

Prefer explicit result objects:

```ts
export type CompileResult<T> =
  | { ok: true; value: T; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };
```

Avoid callback-heavy or promise-heavy architecture in core compiler phases unless
there is a clear I/O boundary.

## Language Specification

The language specification in `docs/language-spec.md` is the source of truth for
syntax and semantics.

When implementing language behavior:

- Check the relevant section of `docs/language-spec.md` first.
- Do not infer semantics from TypeScript, JavaScript, Rust, Zig, or other
  languages when the spec says otherwise.
- Treat `TBD` sections as unresolved design questions. Ask the user before
  implementing behavior that depends on a `TBD`.
- Update the spec when a change intentionally adds, removes, or changes language
  syntax or semantics.
- Keep examples in the spec aligned with parser, checker, and diagnostic tests.

Core semantic goals from the spec include:

- Compile to JavaScript as the primary target.
- Generate TypeScript declaration files eventually.
- Avoid implicit truthiness; only `boolean` values may be used in conditions.
- Avoid implicit coercion between unrelated types.
- Do not expose JavaScript `null` or `undefined` as ordinary language values.
- Represent optional values explicitly.
- Represent recoverable errors with `Result`, not ordinary exceptions.
- Use panics only for programmer errors or violated invariants.
- Require exhaustive matches over enums.
- Keep JavaScript and TypeScript interop boundaries explicit.
- Do not add user-facing classes to the initial core language.

## Compiler Phase Boundaries

Respect compiler phase boundaries.

Expected phases may include:

- Source files and spans
- Lexer
- Parser
- AST
- Name resolution
- Type checking
- IR lowering
- Optimization, if any
- Code generation or interpretation
- Diagnostics and reporting
- CLI integration

Do not mix phases unnecessarily.

Examples:

- The lexer should not perform name resolution.
- The parser should not perform type checking.
- The type checker should not parse source text.
- Diagnostics should not depend on CLI formatting.
- CLI code should be thin and call compiler APIs.

## Diagnostics Requirements

Diagnostics are part of the product.

When adding or changing diagnostics:

- Include source spans whenever possible.
- Make messages actionable.
- Prefer stable diagnostic codes if the project has them.
- Avoid vague messages like invalid syntax.
- Avoid producing many cascading errors from one root cause.
- Add tests for diagnostics.

Diagnostic data should be structured separately from rendering.

Good diagnostic structure:

```ts
export type Diagnostic = {
  readonly severity: "error" | "warning" | "note";
  readonly code?: string;
  readonly message: string;
  readonly span?: Span;
  readonly notes?: DiagnosticNote[];
};
```

Rendering should happen in a separate module.

## Parser Guidelines

When modifying the parser:

- Keep parsing functions small and named after grammar constructs.
- Preserve source spans.
- Include recovery for common syntax errors where practical.
- Avoid using exceptions for normal parse errors.
- Add tests for valid and invalid syntax.
- Consider how grammar changes affect diagnostics and formatting.

When adding syntax, include examples in tests or docs.

## Lexer Guidelines

When modifying the lexer:

- Preserve exact text where needed.
- Preserve spans for every token.
- Handle EOF explicitly.
- Report unterminated strings, invalid characters, and malformed numbers.
- Keep lexing independent from parsing.
- Add tests for edge cases.

## AST and IR Guidelines

For AST and IR definitions:

- Use discriminated unions.
- Include spans in syntax-level nodes.
- Avoid attaching type information directly to parsed AST unless this is an
  intentional design choice.
- Prefer separate maps or tables for semantic information.
- Use IDs for references if nodes are stored in arenas or tables.

Example:

```ts
export type ExprId = number;

export type Expr =
  | { kind: "Name"; span: Span; text: string }
  | { kind: "Call"; span: Span; callee: ExprId; args: ExprId[] };
```

## Testing Instructions

When changing compiler behavior, add tests.

Look for existing test conventions before creating new ones.

Useful test categories:

- Lexer token tests
- Parser AST tests
- Parser error recovery tests
- Diagnostic rendering tests
- Name resolution tests
- Type checking tests
- IR lowering tests
- End-to-end CLI tests
- Regression tests

Tests should be deterministic and easy to inspect.

If snapshots are used, ensure they are intentional and stable.

Do not update snapshots blindly. Explain why snapshot output changed.

## Commands

This project is initialized with Bun. Prefer Bun commands and Bun's package
manager unless the project files clearly indicate otherwise.

Check `package.json` for the authoritative list of scripts before running
commands. Do not invent scripts that are not defined.

Common commands may include:

```bash
bun test
bun run typecheck
bun run lint
bun run format
```

If scripts are not yet present, report that they are unavailable instead of
claiming they were run.

If the project changes package managers later, use the lockfile to infer the
correct tool:

- `bun.lock` or `bun.lockb` means Bun is likely.
- `package-lock.json` means npm is likely.
- `pnpm-lock.yaml` means pnpm is likely.
- `yarn.lock` means yarn is likely.

Do not install new tools globally.

## Dependency Policy

Do not add dependencies casually.

Before adding a dependency, consider:

- Can this be implemented simply in the repository?
- Is the dependency maintained?
- Is the dependency small?
- Is the license compatible?
- Does it complicate the Rust port?
- Does it affect runtime startup or CLI distribution?

If adding a dependency, explain why it is needed.

Avoid dependencies for:

- Tiny utility functions
- Basic data structures
- Simple string manipulation
- Features used only once

## Generated Code Policy

Do not commit generated files unless the repository already does so or the user
explicitly asks.

If code generation is introduced:

- Document how to regenerate files.
- Add tests for generated behavior.
- Keep generated output deterministic.
- Clearly mark generated files.

## LLM-Specific Requirements

As an LLM agent:

- Do not pretend to have run commands if you have not.
- Do not invent files, APIs, scripts, or test results.
- Do not hide uncertainty.
- Ask for clarification if the task is ambiguous and the risk of guessing is
  high.
- Prefer concrete code over broad recommendations when asked to implement.
- Keep explanations concise but complete.
- Ensure all code examples are syntactically plausible.
- Follow the repository's existing style.

If you produce code, review it for:

- Type errors
- Missing imports
- Incorrect paths
- Non-existent APIs
- Inconsistent naming
- Broken tests
- Formatting issues
- Overly complex logic
- Rust portability problems

## Safety and Security

Do not introduce code that:

- Executes arbitrary user input as shell commands.
- Reads or writes outside intended project paths.
- Leaks environment variables.
- Logs secrets.
- Downloads code at runtime without explicit user approval.
- Disables security checks without explanation.

For compiler features that interact with the file system, keep behavior explicit
and testable.

## Performance Guidance

Correctness comes first.

For performance-sensitive code:

- Prefer simple algorithms initially.
- Add benchmarks before major optimizations if possible.
- Explain complexity tradeoffs.
- Avoid micro-optimizations that obscure logic.
- Keep data ownership and mutation clear.

Potentially performance-sensitive areas include:

- Lexing
- Parsing
- Name lookup
- Type inference
- Incremental compilation
- Diagnostic rendering

## Documentation Requirements

Update documentation when changing:

- Language syntax
- Semantics
- Compiler architecture
- CLI behavior
- Diagnostics
- Public APIs
- Test conventions

Add comments for non-obvious logic, especially:

- Parser recovery
- Type inference
- Name resolution
- Borrowing or ownership-inspired architecture
- Lowering decisions
- Diagnostic deduplication

Avoid comments that merely restate the code.

## Pull Request Summary Template

When presenting changes, use this structure when appropriate:

```md
Summary:
- Added ...
- Changed ...
- Fixed ...

Tests:
- npm test
- npm run typecheck

Notes:
- ...
```

If tests were not run:

```md
Tests:
- Not run. Reason: ...
```

## Do Not Do These Things

Do not:

- Rewrite the entire compiler without explicit instruction.
- Mix formatting-only changes with behavioral changes unless requested.
- Add a framework where a small module is enough.
- Add dependencies without justification.
- Use `any` to bypass type errors.
- Remove tests because they fail.
- Suppress diagnostics instead of fixing the cause.
- Change the language design silently.
- Claim a Rust port is complete unless it actually is.
- Commit secrets or local machine paths.
- Depend on a specific user's environment.

## Final Response Expectations

When completing a task, tell the user:

- What changed.
- Which files were modified.
- Which commands were run.
- Any remaining concerns or follow-up recommendations.

Be honest and specific.


---
