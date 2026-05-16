# Collections and Objects

Arrays, checked indexing, object values, object types, and structural object typing.

---

## 16. Arrays

Arrays are ordered collections of values of the same type.

```tsx
const empty = [];
const numbers = [1, 2, 3];
```

The type syntax for arrays places brackets before the element type:

```tsx
[]number
[]string
[]User
```

Example:

```tsx
const numbers: []number = [1, 2, 3];
```

The type of an empty array cannot always be inferred:

```tsx
const values = []; // Invalid unless context determines the element type.
```

Valid examples:

```tsx
const values: []number = [];
const other: []number = []number{};
```

Literal syntax for explicitly typed empty arrays is **TBD**.

---

### 16.1 Array Length

Arrays expose their length as a property:

```tsx
numbers.length
```

`length` currently has type `number`.

A dedicated array index type is desirable. A likely name is:

```tsx
Index
```

Whether `length` should continue to return `number` or eventually return
`Index` is **TBD**.

The conversion model between `number`, `Index`, and any future integer types is
**TBD**.

---

### 16.2 Array Indexing

Array indexing uses square brackets:

```tsx
const first = numbers[0];
```

Indexing is checked by default.

If the index is out of bounds, the program panics.

```tsx
const value = numbers[index]; // Type: number. Panics if index is invalid.
```

The current JavaScript backend emits a runtime bounds check for this operation
and accepts integer-valued `number` indexes. Negative, fractional, `NaN`, and
out-of-bounds indexes panic at runtime.

The intended long-term direction is that arbitrary `number` values should not
necessarily be valid indexes. Integer literals may be allowed in index contexts:

```tsx
values[0]
```

But the following should be rejected or checked:

```tsx
values[1.5] // Invalid or checked.
values[-1]  // Invalid or checked.
```

This operation does not return `undefined`.

Array indexing never produces an untyped missing value.

Array elements may be assigned by index:

```tsx
values[0] = "Ada";
```

Index assignment checks index validity at runtime under the same rules as index
access. Invalid indexes panic. The assigned value must be compatible with the
array element type.

In the MVP, array values are mutable sequence values. `const` and `let` control
whether a binding can be reassigned; they do not freeze or deeply mutate the
array value itself.

---

### 16.3 Safe Array Access

Safe array access returns an optional value.

```tsx
const value = numbers.get(index);
```

The type of `get` is:

```tsx
fn get(index: number): Option<T>
```

The final parameter type may become `Index`.

Example:

```tsx
const label = match numbers.get(index) {
	.Some(value) => "Value: ${value}",
	.None => "No value",
};
```

---

### 16.4 Unsafe Array Access

An explicit unsafe indexing operation may be added later for performance-critical code.

Possible syntax:

```tsx
const value = numbers.unsafeGet(index);
```

or:

```tsx
const value = unsafe numbers[index];
```

This is **TBD**.

Safe code must not rely on unchecked indexing.

---

### 16.5 Bounds Checks and Build Modes

The language may support multiple build modes, such as:

- development mode,
- safe production mode,
- performance mode.

Build modes may affect:

- amount of runtime checking,
- diagnostic quality,
- panic messages,
- emitted debugging metadata,
- optimization level.

However, build modes must not silently change the meaning of safe code.

Checked operations remain checked unless the compiler can prove the check unnecessary.

Example:

```tsx
let i = 0;

while i < numbers.length {
	const value = numbers[i]; // Compiler may prove this access is safe.
	i += 1;
}
```

Explicit unsafe operations are the mechanism for opting out of checks.

---

## 17. Objects

Objects are fixed-shape structured values.

They resemble JavaScript object literals syntactically but are semantically closer to structs.

```tsx
const user = {
	id: "1",
	name: "Ada",
	active: true,
};
```

Properties are accessed with dot notation:

```tsx
user.name
```

Objects cannot be used as hash maps. Use a `Map` type for dynamic key/value storage.

Dynamic property access is **TBD**.

### 17.1 Mutability

In the MVP, object and array values use JavaScript-like runtime mutability.
`const` and `let` control binding mutability, not deep value mutability:

- `const` prevents rebinding,
- `let` allows rebinding,
- object fields may be assigned when the field is known and the value type is
  compatible,
- array elements may be assigned when the index and element value are valid.

`const` does not freeze the object or array value.

```tsx
const user = {
	name: "Ada",
};

user = { name: "Grace" }; // Invalid: rebinding a const binding.
user.name = "Grace";     // Valid: mutating the object value.
```

`let` permits rebinding the variable. It does not make nested values more or
less mutable than they otherwise are.

```tsx
let user = {
	name: "Ada",
};

user = { name: "Grace" }; // Valid: rebinding a let binding.
user.name = "Lovelace";   // Valid: mutating the object value.
```

Property assignment requires the property to be known on the object's static type
and the assigned value to be compatible with the property type.

```tsx
type User = {
	name: string,
};

const user: User = {
	name: "Ada",
};

user.name = "Grace"; // Valid.
user.email = "a@example.com"; // Invalid: User has no field email.
user.name = 42; // Invalid: name has type string.
```

Mutation through function parameters is allowed in the MVP because object and
array values are reference-like values at runtime.

```tsx
fn rename(user: User): void {
	user.name = "Grace";
}
```

Readonly fields, immutable collection types, ownership, borrowing, and deeper
immutability controls are deferred.

---

### 17.2 Object Types

Object types are written with property names and types:

```tsx
type User = {
	id: string,
	name: string,
	active: boolean,
};
```

Example:

```tsx
const user: User = {
	id: "1",
	name: "Ada",
	active: true,
};
```

---

### 17.3 Structural Typing

Object types are structural.

A value is compatible with an object type if it has the required fields with compatible types.

```tsx
type Named = {
	name: string,
};

const user = {
	id: "1",
	name: "Ada",
};

fn greet(value: Named): string {
	"Hello ${value.name}"
}

greet(user);
```

Extra fields are allowed when assigning to a narrower structural type.

Fresh object literals assigned directly to an annotated object type are checked
exactly. Missing fields and excess fields are rejected.

```tsx
const named: Named = {
	id: "1", // Invalid: fresh object literal has excess field id.
	name: "Ada",
};
```

The current compiler MVP parses and checks object type declarations, object
literals, structural object assignability, known-field property access, and
known-field property assignment.

---

### 17.4 Property Access Safety

Accessing a property that is not known to exist on a type is invalid.

```tsx
type User = {
	name: string,
};

fn getEmail(user: User): string {
	user.email // Invalid: User has no field email.
}
```

Property access never produces `undefined`.

