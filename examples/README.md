# Polena Examples

These packages are small executable programs that demonstrate the compiler's
current implemented surface. They are intentionally practical rather than
speculative; future language designs that do not compile yet belong in docs, not
as runnable examples.

Run an example from the repository root:

```bash
bun run ./packages/cli/src/index.ts run examples/basic
```

Build without running:

```bash
bun run ./packages/cli/src/index.ts build examples/basic
```

## Packages

| Example | Focus |
|---|---|
| `basic` | Modules, exported types, object literals, and string interpolation. |
| `collections` | Arrays, safe `.get` access, checked indexing, mutation, loops, and `Result`. |
| `enums` | Fieldless enums, associated data, contextual enum shorthand, and exhaustive `match`. |
| `generics` | Generic object aliases, generic enums, generic functions, `Option`, and `Result`. |
| `tasks` | A small multi-module domain model using imported types, `Option`, and enum payloads. |
| `task_cli` | A complete command-line app using `main(args)`, command parsing, seeded data, and app output. |
| `directives` | Current placeholder for directive design notes, kept compiling with commented future syntax. |

When adding examples, prefer a focused package that compiles end-to-end and
documents current behavior. If the example relies on intended but unimplemented
language design, put it in `docs/language/examples.md` instead.
