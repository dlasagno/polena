# Modules, Packages, and Interop

Module paths, imports, package structure, standard-library imports, workspaces,
and JavaScript/TypeScript interop.

---

This document describes the intended module and package model. Current compiler
support is narrower and is tracked in
[`../implementation-status.md`](../implementation-status.md).

---

## 30. Modules and Packages

Polena code is organized into modules and packages.

A **module** is a single source file. A **package** is a directory of related
modules, identified by a `polena.toml` configuration file.

---

### 30.1 Modules

Each `.plna` file is a module. The filesystem layout determines the module
tree directly: there are no separate `mod` declarations.

A module body contains declarations:

- `import` declarations,
- `type` declarations,
- `const` declarations,
- `fn` declarations.

Free-standing statements and expressions at module scope are invalid in package
modules. Statements and expressions appear inside declaration bodies.

```tsx
const greeting = "Hello"; // OK: declaration with literal initializer.

println(greeting); // Invalid: free-standing expression at module scope.

fn run(): void {
	println(greeting); // OK: inside a function body.
}
```

Top-level `const` initializers in package modules are intended to be compile-time
constants. Function calls and other runtime expressions are not permitted at
module scope:

```tsx
const port = 8080;     // OK.
const env = readEnv(); // Invalid: runtime expression.
```

The exact set of permitted compile-time-constant initializers is **TBD**. The
likely initial set includes:

- literal values (numbers, strings, booleans),
- references to other compile-time `const` bindings,
- arithmetic, comparison, and logical operators applied to compile-time
  constants,
- enum variant constructors applied to compile-time constants,
- array and object literals whose elements and fields are compile-time
  constants.

Compile-time evaluation beyond this set is **TBD**. See
[Compile-Time Evaluation](future-features.md#32-compile-time-evaluation).

---

### 30.2 Module Names and Paths

A module's name is its path from the package's `src/` directory, with `/` as
the separator and no file extension. Modules inside the current package are
referenced with the `@/` prefix:

```
my_app/
    polena.toml
    src/
        index.plna          → module @/
        utils.plna          → module @/utils
        users/
            index.plna      → module @/users
            roles.plna      → module @/users/roles
```

An `index.plna` file represents its containing directory as a module. The
directory's path is the module's name; there is no `/index` segment in any
import path. A package's root entry module is therefore `src/index.plna`,
referenced internally as `@/`.

A directory must not contain both a file `<name>.plna` and a directory
`<name>/` whose `index.plna` would resolve to the same module name. Such a
conflict is an error.

A module's name is stable. It does not change based on which file imports it.

Import paths always begin with a reserved or package-rooted prefix. Relative
paths are not used.

External consumers reference a package's root module using the package name.
Submodules are reached by suffixing the path.

---

### 30.3 Visibility

Declarations are private to their module by default. The `export` keyword
makes a declaration available to other modules:

```tsx
export fn parseUser(input: string): Result<User, ParseError> {
	// ...
}

export type User = {
	id: string,
	name: string,
};

fn helper(): void {
	// Module-private.
}
```

`export` may appear on `fn`, `const`, and `type` declarations.

Re-exports (forwarding an imported name to a module's public surface) are
**TBD**.

A type may be exported while its constructors remain private. The exact syntax
and rules for opaque types are **TBD**.

---

### 30.4 Imports

`import` declarations bring names from other modules into scope.

Import paths begin with one of:

- `@/` — the current package,
- `@std/` — the standard library,
- a package name from the workspace or dependencies.

```tsx
import @/utils/parse;        // intra-package
import @std/io;              // standard library
import some_dep/foo;         // external dependency
```

The `@` sigil is also used elsewhere in the language for compiler directives.
The import-path forms `@/...` and `@<name>/...` are unambiguous in import
position. See
[Compile-Time Evaluation](future-features.md#32-compile-time-evaluation).

The recommended style is the **qualified import**, which makes the imported
module available under a local name:

```tsx
import @/utils/parse;

fn run(): void {
	parse.line("hello");
}
```

The local name is the last segment of the import path. An alias may be given
with `as`:

```tsx
import @/utils/parse as p;

fn run(): void {
	p.line("hello");
}
```

An import may also pull specific names directly into the importing module's
scope. The unqualified list uses the `type` keyword to import type names:

```tsx
import @/users.{type User, parseUser};
```

The `type` keyword is required for every type name in an unqualified list.
This keeps the type/value namespace boundary explicit at the import site.

Imported names may be aliased individually:

```tsx
import @/users.{type User as DbUser, parseUser as parse};
```

An unqualified list adds names alongside the qualified module binding. The
qualified binding is still available. An `as` clause on the import aliases the
qualified binding and appears after the unqualified list:

```tsx
import @/users.{type User, parseUser} as u;
// u.parseUser, u.User, User, and parseUser are all in scope.
```

External packages are imported by package name. A package's root module
(its `src/index.plna`) is imported with the bare package name; submodules
are reached by suffixing the path:

```tsx
import some_dep;             // some_dep's root module
import some_dep/foo;         // a submodule of some_dep
```

Importing the current package's own root module from within the package
(`import @/;` or `import @;`) is **TBD**.

There are no default exports and no glob (`*`) imports.

Imports must appear at the top of a module, before any other declaration.

Circular imports are invalid. Module dependency cycles are reported as errors
at every `import` statement that participates in the cycle.

---

### 30.5 Standard Library Imports

The `@std` prefix is reserved for the standard library.

Standard library modules are organized by runtime applicability:

- `@std/<module>` — modules that work in every supported runtime
  (for example `@std/option`, `@std/result`, `@std/list`, `@std/string`).
- `@std/node/<module>` — modules that only work on the Node.js runtime
  (for example `@std/node/fs`).
- `@std/browser/<module>` — modules that only work in a browser runtime
  (for example `@std/browser/dom`).

```tsx
import @std/io;
import @std/node/fs;
import @std/browser/dom;
```

A package's compilation target is expected to declare which runtime namespaces
it may import from. The exact manifest field is **TBD**. Importing a
runtime-specific module that is incompatible with the package's compilation
target is an error at the import site.

The transitive propagation rule — that a library importing a
runtime-specific module is itself constrained to that runtime and must
declare so — is **TBD**.

The full contents of the standard library are **TBD** and intentionally small
for the prototype. Until specific standard-library modules ship, the prelude
(see `../prelude.md`) provides a small set of names implicitly, without an
import declaration.

---

### 30.6 Packages

A package is a directory containing a `polena.toml` file and a `src/`
directory:

```
my_app/
    polena.toml
    src/
        index.plna
        ...
```

`polena.toml` contains package metadata. The minimum required form:

```toml
name = "my_app"
version = "0.1.0"
target = "executable"
```

Language-level fields:

- **`name`** — the package name. Must be a valid Polena identifier. It is
  the prefix external consumers use to import this package.
- **`version`** — the package version.
- **`target`** — `"executable"` or `"library"`. Declares the package's role.
  An **executable** package must define `export fn main(): void` in its
  entry module. A **library** package must not define
  `main` in its entry module.
- **`runtime`** — `"node"`, `"bun"`, or `"deno"`. Optional package metadata
  used by the build system's `run` operation. It is required to run an
  executable package and ignored for libraries.

The optional `[build]` section may contain:

- **`out-dir`** — output directory for emitted JavaScript. It is resolved
  relative to the package root unless absolute and defaults to `dist`.

The `target` field declares what the package produces, not the compilation
target (browser, Node, and similar) — that concept is separate and **TBD**.

The complete manifest and package build behavior are specified in
[`../build-spec.md`](../build-spec.md). Command-line behavior is specified in
[`../cli-spec.md`](../cli-spec.md).

Combining library and executable roles in a single package is **TBD**.

Dependency declarations, workspaces, and other `polena.toml` fields are
**TBD**.

---

### 30.7 Entry Modules and `main`

Every package has an **entry module** at `src/index.plna`. The entry module
is fixed by convention; there is no override.

An **executable** package must define an exported `main` function in its
entry module:

```tsx
// src/index.plna

export fn main(): void {
	println("Hello");
}
```

The `main` function:

- has the signature `fn main(): void` or, when the package declares a
  CLI-capable runtime, `fn main(args: []string): void`,
- must be exported,
- is invoked exactly once when the compiled program is executed.

When `main` declares one `[]string` parameter, that parameter receives the
command-line arguments passed to the program, excluding the runtime binary and
the generated entry module path. The supported `node`, `bun`, and `deno`
runtimes are CLI-capable. Packages without a runtime, and future runtimes that
are not CLI-capable, must use `fn main(): void`.

A **library** package must not define `main` in its entry module. Its
exports form the package's public surface; external consumers reach them
via the bare package name.

Returning errors or explicit exit codes from `main` (for example
`fn main(): Result<void, E>`) is **TBD** and depends on the panic and
exit-code design. See [Panic](algebraic-data-and-errors.md#193-panic).

---

### 30.8 Workspaces

A workspace groups several related packages under a single top-level
`polena.toml`. The common use is a project composed of multiple deployable
units that share library code — for example a web frontend, a backend
service, and a library of shared types and helpers.

A workspace is a directory whose top-level `polena.toml` contains a
`[workspace]` section listing its member packages:

```
my_project/
    polena.toml
    frontend/
        polena.toml
        src/
            index.plna
    backend/
        polena.toml
        src/
            index.plna
    shared/
        polena.toml
        src/
            index.plna
```

```toml
[workspace]
members = ["frontend", "backend", "shared"]
```

The workspace's top-level `polena.toml` does not declare a package. It has
no `name`, `version`, or `target` fields. Its only role is to group member
packages.

Each member is a complete package as described in [Packages](#306-packages) and
is treated as such by the compiler. Members may reference each other through
dependency declarations.

Workspaces are flat: a workspace member cannot itself be a workspace.

The exact mechanism for declaring dependencies between workspace members,
and between any package and external dependencies, is **TBD**.

---

### 30.9 Interop Boundary

Polena modules do not import JavaScript or TypeScript files directly by file
path. External code is consumed through declaration files described in
[JavaScript and TypeScript Interop](#javascript-and-typescript-interop).

---

## JavaScript and TypeScript Interop

Interop is not part of the initial core, but the language is designed with
JavaScript output and TypeScript ecosystem compatibility in mind.

Planned interop features:

- import JavaScript/TypeScript modules,
- consume compatible declaration files,
- generate TypeScript declaration files,
- optionally convert `.d.ts` files into the language's own declaration format,
- represent unsafe/dynamic values as `unknown`,
- map `null` and `undefined` at boundaries into `Option<T>` where possible.

---

### Native Declaration Files

The language may define its own declaration file format for external modules.

Possible syntax:

```tsx
declare module "slugify" {
	export fn slugify(input: string): string;
}
```

A converter may transform compatible `.d.ts` files into native declarations.

Unsupported TypeScript constructs may be converted to `unknown` or rejected.

This is **TBD**.
