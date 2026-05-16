# Primitive Types

Primitive values, literals, strings, and `void`.

---

## 4. Primitive Types

The primitive types are:

```tsx
number
bigint
boolean
string
```

All primitive values are immutable.

Primitive values are based on JavaScript primitives at runtime, but the language gives them stricter and safer static semantics.

---

## 5. Number

The `number` type represents a 64-bit floating-point number, equivalent to JavaScript’s `number`.

Integer-looking literals are still values of type `number`.

```tsx
1
1.05
0.255e3
1_000_000

0xff
0o70
0b1100
```

Supported forms:

```tsx
123
123.456
1e9
1.5e-3
0xff
0o755
0b1010
```

Underscores may be used for readability:

```tsx
1_000_000
```

Underscores do not affect the value.

---

## 6. Bigint

The `bigint` type represents arbitrary-size integers.

A bigint literal uses the same syntax as a number literal, followed by `n`.

```tsx
1n
1_000_000n

0xffn
0o70n
0b1100n
```

Unlike `number`, bigint values cannot represent fractional values.

The following is invalid:

```tsx
1.5n
```

---

## 7. Boolean

The `boolean` type has exactly two values:

```tsx
true
false
```

Only values of type `boolean` may be used in conditionals and logical operations.

The following is invalid:

```tsx
const count = 0;

if count {
	// Invalid: count is number, not boolean.
}
```

Instead, comparisons must be explicit:

```tsx
if count != 0 {
	// Valid.
}
```

---

## 8. String

The `string` type represents immutable text values.

Basic string literals use double quotes:

```tsx
"Hello"
"This is a string"
```

Strings support interpolation:

```tsx
"Hello ${name}"
```

Plain string literals do not require runtime interpolation. Interpolated strings are evaluated at runtime.

Multiline strings use repeated `\\` line prefixes that can be indented as much as needed, the text starts after the `\\` on each line:

```tsx
\\This is a
\\multiline string.
\\This supports
\\${interpolation} too.
```

---

### 8.1 Escape Sequences

The following escape sequences are supported in string literals:

| Escape sequence | Value |
|---|---|
| `\0` | U+0000 NUL |
| `\t` | U+0009 horizontal tab |
| `\n` | U+000A line feed |
| `\r` | U+000D carriage return |
| `\"` | U+0022 quotation mark |
| `\\` | U+005C backslash |

Additional Unicode escape forms are **TBD**.

---

## 14. Void

The `void` type represents the absence of a meaningful value.

Functions that do not return a value have return type `void`.

```tsx
fn log(message: string): void {
	console.log(message);
}
```

`void` values cannot be meaningfully inspected or compared.

