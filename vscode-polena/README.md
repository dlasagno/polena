# Polena Syntax

This extension adds syntax highlighting and basic language configuration for
Polena source files in VS Code.

It currently targets the compiler MVP syntax implemented in this repository,
including:

- `fn`, `const`, `let`, `if`, `else`, `while`, `break`, `continue`, and `return`
- Primitive types: `number`, `bigint`, `string`, `boolean`, and `void`
- Boolean literals, numeric literals, operators, and punctuation
- `//` line comments
- Double-quoted strings with `${...}` interpolation
- Polena multiline strings that use repeated `\\` line prefixes

## Local development

1. Open the `vscode-polena` folder in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open a `.plna` or `.polena` file in the new window.

No build step is required because the extension is grammar-only.
