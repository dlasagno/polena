# Lexical Structure

Source files, comments, identifiers, and reserved words.

---

## 2. Source Code

Source files are expected to be UTF-8 encoded.

Line endings may be LF or CRLF, but line comments end at LF.

---

## 3. Comments

The language supports only line comments. Block comments are not part of the
language.

```tsx
// This is a line comment. It starts with "//" and ends at the next LF.
```

Two doc-comment forms are recognized:

- `///` introduces an **item doc comment**, attached to the declaration that
  immediately follows it. Multiple consecutive `///` lines form a single
  doc-comment block.
- `//!` introduces a **module doc comment**, attached to the enclosing module.
  Module doc comments must appear at the top of a file, before any
  declaration.

```tsx
//! This module implements basic parser helpers.

/// Parses a single line, returning the trimmed contents.
///
/// Returns `.None` for an empty line.
export fn parseLine(input: string): Option<string> {
	// ...
}
```

Doc-comment content is treated as Markdown by external documentation
tooling. The compiler does not validate or render doc-comment content; it
only attaches the text to the corresponding declaration or module.

---

## 9. Identifiers

Identifiers must follow these rules:

- May contain letters, digits, underscores, and `$`.
- Must not start with a digit.
- Are case-sensitive.
- Must not be reserved words.

Examples:

```tsx
name
userName
$user
_internal
value2
```

Invalid examples:

```tsx
2value
const
fn
if
```

Unicode identifiers are **TBD**.

---

## 10. Reserved Words

The following words are reserved:

```tsx
and
as
bigint
boolean
break
comptime
const
continue
else
enum
false
fn
if
impl
let
match
number
or
return
string
trait
true
type
unknown
while
```

Additional reserved words may be added as the language evolves.

