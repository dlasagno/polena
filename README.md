# polena

Polena programming language

## Compiler MVP

The current implementation is a very small compiler MVP for testing basic Polena
programs end-to-end. It supports:

- Line comments with `//`
- `number`, `bigint`, `string`, and `boolean` literals
- String interpolation and multiline strings
- `const` and `let` declarations with required initializers
- Basic reassignment for `let` bindings
- Numeric compound assignment: `+=`, `-=`, `*=`, `/=`, `%=` for `let` bindings
- Optional variable type annotations
- Function declarations with typed parameters and explicit return types
- Final-expression function returns and explicit `return expr;`
- `void` function returns
- Function calls
- A provisional prelude with `println(message: string): void`
- Unary `!` and `-`
- Binary arithmetic, comparison, `and`, and `or` expressions
- `if` expressions and statement-position `if` without `else`
- `while` loops, `break`/`continue`, and expression-valued `while ... else ...`
- Array type syntax such as `[]number`
- Array literals, typed empty arrays, `.length`, and checked indexing

It intentionally does not yet support objects, enums, match expressions, modules/imports,
or the full type system from the language draft.

Example:

```tsx
fn add(a: number, b: number): number {
  a + b
}

let value = add(20, 21);
value += 1;
```

Polena source files use `.plna` as the standard extension. The CLI also accepts
the longer `.polena` extension for now.

## Package layout

Polena is organized as a small Bun workspace:

- `packages/compiler` contains the compiler core, diagnostics, parser, checker,
  and JavaScript code generator.
- `packages/cli` contains the `polena` command line entrypoint and file I/O.
- `packages/language-server` contains the diagnostics-first language server.
- `packages/vscode-extension` contains the VS Code grammar and LSP client.

## VS Code extension

A local VS Code extension lives in `packages/vscode-extension`.

To try it:

```sh
bun run --cwd packages/vscode-extension build
code packages/vscode-extension
```

Then press `F5` in VS Code to launch an Extension Development Host and open any
`.plna` or `.polena` file in that window. Syntax highlighting works alongside
language-server diagnostics.

Create an installable VSIX:

```sh
bun run --cwd packages/vscode-extension build:vsix
```

Compile a file to JavaScript:

```sh
bun run compile example.plna
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
bun run packages/cli/src/index.ts compile example.plna --out example.js
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
