# Bindings and Expressions

Variables, statements, blocks, and operators.

---

## 11. Variables

The language has two variable declaration forms:

```tsx
const
let
```

A `const` binding cannot be reassigned.

A `let` binding can be reassigned.

Variables must be initialized when declared.

```tsx
const name: string = "Ada";
let count: number = 0;
```

The following is invalid:

```tsx
let count: number;
```

---

### 11.1 Type Inference

Type annotations may be omitted when the type can be inferred from the initializer.

```tsx
const pi = 3.14;       // number
const name = "Ada";    // string
const active = true;   // boolean
```

---

### 11.2 Reassignment

Only `let` bindings may be reassigned.

```tsx
let count = 0;
count = count + 1;
```

The following is invalid:

```tsx
const count = 0;
count = count + 1;
```

---

### 11.3 Shadowing

The initial compiler MVP does not allow a declaration to reuse a name that is
already declared in the same scope or in an outer scope.

More expressive shadowing behavior is **TBD**, including Rust-style variable
redeclaration shadowing where a name may be redeclared to produce a new binding,
possibly with a different type.

Potential options:

1. Allow shadowing in inner scopes.
2. Disallow shadowing entirely.
3. Allow explicit shadowing using a dedicated syntax.
4. Allow same-scope variable redeclaration shadowing.

---

## 12. Statements and Semicolons

Statements must end with semicolons.

```tsx
const a = 1;
const b = 2;
```

Some constructs contain blocks that may evaluate to a value. In such blocks, the final expression must not have a semicolon.

```tsx
const sum = {
	const a = 1;
	const b = 2;
	a + b
};
```

A final expression with a semicolon is treated as a statement and its value is discarded.

---

## 13. Blocks

A block is a sequence of statements surrounded by braces.

```tsx
{
	const a = 1;
	const b = 2;
}
```

Blocks may be evaluable.

An evaluable block ends with an expression without a semicolon:

```tsx
{
	const a = 1;
	const b = 2;
	a + b
}
```

The value of the block is the value of the final expression.

A block without a final expression has type `void`.

```tsx
{
	const a = 1;
	const b = 2;
}
```

---

## 15. Operators

---

### 15.1 Arithmetic Operators

Arithmetic operators operate on numeric values.

```tsx
1 + 2.0
5 - 1.5
2 * 3
6 / 2
7 % 3
2 ** 8
```

Initial supported signatures:

```tsx
number + number = number
number - number = number
number * number = number
number / number = number
number % number = number
number ** number = number

bigint + bigint = bigint
bigint - bigint = bigint
bigint * bigint = bigint
bigint / bigint = bigint
bigint % bigint = bigint
```

Mixing `number` and `bigint` is invalid without explicit conversion.

```tsx
1 + 2n // Invalid.
```

Bigint exponentiation is **TBD**.

Division behavior for bigint is **TBD**.

---

### 15.2 Comparison Operators

Comparison operators can only be applied to values with compatible types and
supported comparison operations.

```tsx
1 == 1
3 != 1
5 > 3
5 >= 5
4 < 7
8 <= 9
```

Supported ordering signatures:

```tsx
number > number = boolean
number >= number = boolean
number < number = boolean
number <= number = boolean

bigint > bigint = boolean
bigint >= bigint = boolean
bigint < bigint = boolean
bigint <= bigint = boolean
```

Ordering is not supported for `boolean`, `string`, arrays, objects, functions,
or mixed `number`/`bigint` operands.

Ordering support for future user-defined types is **TBD**.

Equality support is type-specific:

- primitive values may be compared with `==` and `!=`,
- fieldless enum values may be compared with `==` and `!=` when both operands
  have the same enum type,
- object values cannot be compared with `==` or `!=`,
- array values cannot be compared with `==` or `!=`,
- function values cannot be compared with `==` or `!=`,
- equality for enums with associated data, `Option`, `Result`, and other
  user-defined types is **TBD**.

For primitive values, comparisons follow the language's own semantics.

Comparing unrelated types is invalid:

```tsx
1 == "1" // Invalid.
```

Because equality does not perform implicit coercion, there is no `===` operator.

Objects and arrays cannot be compared with `==` or `!=`.

```tsx
const a = { x: 1 };
const b = { x: 1 };
a == b // Invalid.
```

```tsx
const xs = [1];
const ys = [1];
xs == ys // Invalid.
```

Use explicit functions for reference or structural comparison.

```tsx
sameRef(a, b)
deepEqual(a, b)
User.equals(a, b)
```

Exact standard-library names for these operations are **TBD**.

---

### 15.3 Logical Operators

Logical operators only operate on booleans.

```tsx
true and true
false or true
!true
```

Supported signatures:

```tsx
boolean and boolean = boolean
boolean or boolean = boolean
!boolean = boolean
```

Unlike JavaScript’s `&&` and `||`, `and` and `or` do not return arbitrary operand values.

The following is invalid:

```tsx
const value = name or "Anonymous";
```

Use explicit optional/defaulting operators for optional values.

---

### 15.4 Assignment Operators

Basic assignment:

```tsx
x = value;
```

Compound assignment is supported for numeric values:

```tsx
x += 1;
x -= 1;
x *= 2;
x /= 2;
x %= 2;
```

Compound assignment may target bindings, object fields, or array elements when
the target value and right-hand side have the same numeric type.

Additional compound operators are **TBD**.

---

### 15.5 String and Array Concatenation

The `++` operator concatenates strings and arrays.

```tsx
"Hello, " ++ "world"
[1] ++ [2, 3]
```

Supported signatures:

```tsx
string ++ string = string
[]T ++ []T = []T
```

For arrays, both operands must contain the same element type.

```tsx
[1] ++ ["x"] // Invalid.
```

