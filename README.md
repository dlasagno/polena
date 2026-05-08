# polena

Polena programming language

## Compiler MVP

The current implementation is a very small compiler MVP for testing basic Polena
programs end-to-end. It supports:

- Line comments with `//`
- `number`, `string`, and `boolean` literals
- `const` and `let` declarations with required initializers
- Optional variable type annotations
- Function declarations with typed parameters and explicit return types
- Final-expression function returns and explicit `return expr;`
- Function calls
- Unary `!` and `-`
- Binary arithmetic, comparison, `and`, and `or` expressions
- `if` expressions and statement-position `if` without `else`

It intentionally does not yet support arrays, objects, enums, match expressions,
modules/imports, string interpolation, loops, reassignment, or the full type
system from the language draft.

Example:

```tsx
fn add(a: number, b: number): number {
  a + b
}

const value = add(20, 22);
```

Polena source files use `.plna` as the standard extension. The CLI also accepts
the longer `.polena` extension for now.

Compile a file to JavaScript:

```sh
bun run compile example.plna
```

The CLI also supports explicit commands and standard help/version flags:

```sh
bun run src/index.ts --help
bun run src/index.ts --version
bun run src/index.ts compile example.plna --out example.js
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
