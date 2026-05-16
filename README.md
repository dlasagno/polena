# Polena

Polena programming language

## Compiler MVP

The current implementation is a compiler MVP for testing Polena programs
end-to-end. It supports:

- Line comments with `//`
- Item and module doc comments with `///` and `//!`
- `number`, `bigint`, `string`, and `boolean` literals
- String interpolation and multiline strings
- `const` and `let` declarations with required initializers
- Basic reassignment for `let` bindings
- Optional variable type annotations
- Transparent type aliases with `type Name = ExistingType;`
- Function declarations with typed parameters and explicit return types
- Generic function declarations with inferred type arguments
- Final-expression function returns and explicit `return expr;`
- `void` function returns
- Function calls
- A provisional prelude with `println(message: string): void`, `Option<T>`, and
  `Result<T, E>`
- Unary `!` and `-`
- Binary arithmetic, comparison, `and`, and `or` expressions
- String and array concatenation with `++`
- `if` expressions and statement-position `if` without `else`
- `while` loops, `break`/`continue`, and expression-valued `while ... else ...`
- Numeric compound assignment for bindings, object fields, and array elements
- Array type syntax such as `[]number` and named aliases for array types
- Array literals, typed empty arrays, `.length`, checked indexing, and checked
  index assignment
- Safe array access with `.get(index): Option<T>`
- Object type aliases, exact object literal checking, structural object
  assignment, property access, and field assignment
- Fieldless and associated-data enum declarations, enum values, enum equality
  for fieldless enums, and exhaustive `match` expressions with wildcard arms
- Package builds from `polena.toml` and `src/index.plna`
- Current-package module imports with `@/module`, exported declarations, and
  multi-file ESM output
- Language-server diagnostics, manifest completions, hover, and document
  symbols

It intentionally does not yet support object field readonly controls,
external packages, standard-library imports, workspaces, explicit generic
function call type arguments, or the full type system from the language draft.

Example:

```tsx
type Score = number;

fn add(a: Score, b: Score): Score {
  a + b
}

let value: Score = add(20, 21);
value += 1;
```

Polena source files use `.plna` as the standard extension. The CLI also accepts
the longer `.polena` extension for now.

## Package layout

Polena is organized as a small Bun workspace:

- `packages/compiler` contains the compiler core, diagnostics, parser, checker,
  and JavaScript code generator.
- `packages/build` contains manifest parsing, package layout, build, init, and
  run operations.
- `packages/cli` contains the `polena` command line entrypoint and process I/O.
- `packages/language-server` contains the diagnostics-first language server.
- `packages/vscode-extension` contains the VS Code grammar and LSP client.

## Documentation

- [docs/language-spec.md](docs/language-spec.md) is the entry point for the
  intended language design.
- [docs/implementation-status.md](docs/implementation-status.md) tracks what the
  current TypeScript compiler actually implements.
- [docs/prelude.md](docs/prelude.md) documents compiler-provided prelude items.
- [docs/build-spec.md](docs/build-spec.md) and
  [docs/cli-spec.md](docs/cli-spec.md) define package and CLI behavior.
- [docs/roadmap.md](docs/roadmap.md) lists current planning priorities.

## VS Code Extension

A local VS Code extension lives in `packages/vscode-extension`.

To try it:

```sh
bun run --cwd packages/vscode-extension build
code packages/vscode-extension
```

Then press `F5` in VS Code to launch an Extension Development Host and open any
`.plna` or `.polena` file in that window. Syntax highlighting works alongside
language-server diagnostics, hover, document symbols, and manifest completions.

Create an installable VSIX:

```sh
bun run --cwd packages/vscode-extension build:vsix
```

Build and install the VSIX into Cursor or VS Code:

```sh
bun run cursor:install
bun run vscode:install
```

## CLI

Initialize a package:

```sh
bun run packages/cli/src/index.ts init my_app --yes
```

Build a package to JavaScript modules:

```sh
bun run build:example examples/basic --out-dir dist/basic
```

A package contains a `polena.toml` manifest and a `src/index.plna` entry module:

```toml
name = "my_app"
version = "0.1.0"
target = "executable"
runtime = "node"
```

```tsx
// src/index.plna
export fn main(): void {
  println("Hello");
}
```

Build a standalone executable for the current platform:

```sh
bun run build:binary
```

That writes the compiler to `dist/polena` on Unix-like systems and
`dist/polena.exe` on Windows.

The CLI also supports explicit commands and standard help/version flags:

```sh
bun run packages/cli/src/index.ts --help
bun run packages/cli/src/index.ts --version
bun run packages/cli/src/index.ts build examples/basic --out-dir dist/basic
bun run packages/cli/src/index.ts run examples/basic
bun run packages/cli/src/index.ts run examples/basic -- arg1 arg2
./dist/polena --version
```

When compilation fails, diagnostics include the source location and a small code
snippet:

```text
error[PLN102]: Unknown name 'missing'.
  --> example.plna:1:15
  |
1 | const value = missing;
  |               ^^^^^^^ no value with this name is in scope
  |
help: declare it before using it, or check for a spelling mistake
```

See [docs/prelude.md](docs/prelude.md) for the currently available prelude
functions.

See [docs/implementation-status.md](docs/implementation-status.md) for a
feature-by-feature view of what the current MVP implements from the language
draft.

## Development

Install dependencies:

```sh
bun install
```

Common checks:

```sh
bun run typecheck
bun run lint
bun run format:check
bun test
```

Run the full local check suite:

```sh
bun run check
```

Format files:

```sh
bun run format
```
