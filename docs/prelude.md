# Prelude

Status: provisional

The prelude is a small set of names that are available in every Polena program
without an import.

The current prelude is intentionally tiny. It exists to make toy programs useful
while the language does not yet have modules, imports, runtime profiles, or a
real standard library.

Prelude items are compiler-provided for now. This should be treated as a
temporary implementation detail, not as the final standard library design.

---

## `println`

```tsx
println(message: string): void
```

Writes `message` followed by a line break.

For the current JavaScript target, `println` is emitted as `console.log`.

Example:

```tsx
const name = "Ada";
println("Hello ${name}");
```

Only `string` values may be passed directly. Other values should be printed with
string interpolation:

```tsx
const count = 3;
println("count = ${count}");
```

---

## Deferred Items

The prelude does not yet include input, sleeping, parsing helpers, filesystem
access, or other runtime APIs.

These features are deferred because they require more language and runtime
design:

- Input depends on whether the program runs in a CLI, browser, or another
  JavaScript host.
- Numeric parsing should return an explicit `Result` or `Option`, which is not
  implemented yet.
- Sleeping is naturally asynchronous in JavaScript, and async functions are not
  part of the current compiler MVP.
- A real core or standard library depends on the module and import system, which
  is still unresolved.
