# Prelude

Status: removed

Polena currently has no compiler-provided prelude. Names such as `Option`,
`Result`, and `println` are ordinary standard-library declarations and must be
imported explicitly when used from a package.

The first standard-library slice lives under `packages/stdlib` and is exposed
to Polena code as `@std/`. It currently includes `@std/core`, `@std/io`,
`@std/option`, `@std/result`, `@std/parse`, `@std/math`, `@std/string`, `@std/array`,
`@std/collections/map`, and `@std/collections/set`.

---

## Core

`@std/core` exports the foundational enum types and a basic print function:

```tsx
import @std/core.{type Option, type Result, println};
```

```tsx
type Option<T> = enum {
	Some(T),
	None,
}

type Result<T, E> = enum {
	Ok(T),
	Err(E),
}
```

`println(message: string): void` writes a line through the JavaScript target's
`console.log`.

---

## Array `.get(index)`

```tsx
items.get(index): Option<T>
```

Returns `.Some(value)` when `index` is an integer within bounds, otherwise
returns `.None`. The `Option` type must be in scope where `.get` is used.

Checked indexing with `items[index]` still panics on invalid indexes.

---

## Standard Library Modules

- `@std/core` exports `Option`, `Result`, `println`, `assert`, `todo`, and
  `unreachable`.
- `@std/io` exports `println` and `eprintln`.
- `@std/option` exports `is_some`, `is_none`, `unwrap`, `expect`, `unwrap_or`, `flatten`,
  `and_with`, `or_else`, and `to_result`.
- `@std/result` exports `is_ok`, `is_err`, `unwrap`, `expect`, `unwrap_or`, `flatten`,
  `and_with`, `or_else`, `ok`, `err`, and `from_option`.
- `@std/parse` exports `ParseError`, `parse_int`, and `parse_float`.
- `@std/math` exports basic JavaScript-backed number helpers such as `abs`,
  `floor`, `ceil`, `round`, `min`, `max`, `pow`, and `sqrt`.
- `@std/string` exports basic string helpers including `trim`, `split`, `join`,
  and `replace_all`. Since `string` is a primitive type token, import it with
  an alias when using qualified calls:

```tsx
import @std/string as strings;

const trimmed = strings.trim(" Ada ");
```

- `@std/array` exports `len`, `is_empty`, `get`, `last`, `slice`, `concat`,
  `push`, and `pop`.
- `@std/collections/map` exports an opaque `Map<K, V>` type plus `new`, `len`, `get`,
  `insert`, `contains_key`, and `remove`. These are backed by the JavaScript
  `Map` object.
- `@std/collections/set` exports an opaque `Set<T>` type plus `new`, `len`, `add`,
  `contains`, and `remove`. These are backed by the JavaScript `Set` object.

---

## Deferred Items

The standard library does not yet include input, sleeping, filesystem access,
or other runtime APIs. Basic numeric parsing lives in `@std/parse`.

These features are deferred because they require more language and runtime
design:

- Input depends on whether the program runs in a CLI, browser, or another
  JavaScript host.
- Runtime-specific APIs need a stable package/import model.
