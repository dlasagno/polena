# Polena VS Code Extension

This extension adds syntax highlighting, basic language configuration, and
language-server diagnostics for Polena source files in VS Code.

It currently targets the compiler MVP syntax implemented in this repository,
including:

- `fn`, `const`, `let`, `if`, `else`, `while`, `break`, `continue`, and `return`
- Primitive types: `number`, `bigint`, `string`, `boolean`, and `void`
- Boolean literals, numeric literals, operators, and punctuation
- `//` line comments
- Double-quoted strings with `${...}` interpolation
- Polena multiline strings that use repeated `\\` line prefixes

## Local development

1. From the repository root, run `bun run --cwd packages/vscode-extension build`.
2. Open the `packages/vscode-extension` folder in VS Code.
3. Press `F5` to launch an Extension Development Host.
4. Open a `.plna` or `.polena` file in the new window.

The build step compiles both the language server and the extension client.

To create an installable VSIX:

```sh
bun run --cwd packages/vscode-extension build:vsix
```

To build and install the VSIX into Cursor or VS Code:

```sh
bun run --cwd packages/vscode-extension install:vsix:cursor
bun run --cwd packages/vscode-extension install:vsix:vscode
```
