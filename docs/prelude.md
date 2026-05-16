# Prelude

Status: provisional

The prelude is a small set of names that are available in every Polena program
without an import.

The current prelude is intentionally tiny. It exists to make small programs
useful while the standard library, external packages, and runtime profiles are
still being designed.

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

## `Option<T>`

```tsx
type Option<T> = enum {
	Some(T),
	None,
}
```

Represents either a present value or no value.

Example:

```tsx
const values = [10, 20];

const label = match values.get(0) {
	.Some(value) => "value ${value}",
	.None => "missing",
};
```

---

## `Result<T, E>`

```tsx
type Result<T, E> = enum {
	Ok(T),
	Err(E),
}
```

Represents either a successful value or a recoverable error value.

Example:

```tsx
type ParseError = enum {
	Empty,
	Invalid,
};

const parsed: Result<number, ParseError> = .Ok(42);
```

---

## Array `.get(index)`

```tsx
items.get(index): Option<T>
```

Returns `.Some(value)` when `index` is an integer within bounds, otherwise
returns `.None`.

Checked indexing with `items[index]` still panics on invalid indexes.

---

## Deferred Items

The prelude does not yet include input, sleeping, parsing helpers, filesystem
access, or other runtime APIs.

These features are deferred because they require more language and runtime
design:

- Input depends on whether the program runs in a CLI, browser, or another
  JavaScript host.
- Numeric parsing should return an explicit `Result` or `Option`.
- Sleeping is naturally asynchronous in JavaScript, and async functions are not
  part of the current compiler MVP.
- A real core or standard library depends on a stable package/import model for
  standard-library code, external packages, and runtime-specific APIs.
