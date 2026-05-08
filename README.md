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
