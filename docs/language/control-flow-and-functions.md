# Control Flow and Functions

`if`, `while`, `break`, `continue`, and function declarations.

---

## 22. Control Flow

---

### 22.1 If Expressions

`if` is an expression.

The condition must be a `boolean`.

```tsx
const result = if 1 > 0 {
	"1 is greater than 0"
} else {
	"Impossible"
};
```

Parentheses around the condition are optional:

```tsx
if condition {
	// ...
}

if (condition) {
	// ...
}
```

For style consistency, the formatter may prefer one form. The canonical style is **TBD**.

---

### 22.2 If Branch Types

If an `if` expression is used as a value, all branches must evaluate to compatible types.

```tsx
const value = if enabled {
	1
} else {
	0
};
```

The following is invalid:

```tsx
const value = if enabled {
	1
} else {
	"no"
};
```

If an `if` is used as a statement and does not evaluate to a value, branch types may be `void`.

---

### 22.3 Else Requirement

If an `if` expression is used as a value, it must have an `else` branch.

```tsx
const value = if condition {
	1
}; // Invalid.
```

An `if` used as a statement may omit `else`.

```tsx
if condition {
	doSomething();
}
```

---

### 22.4 While Loops

A basic `while` loop repeats while its condition is true.

```tsx
while condition {
	// ...
}
```

The condition must be a `boolean`.

---

### 22.5 Break and Continue

Loops support `break` and `continue`.

```tsx
while condition {
	if shouldSkip {
		continue;
	}

	if shouldStop {
		break;
	}
}
```

---

### 22.6 While Continue Expression

A `while` loop may have a continue expression, inspired by Zig.

```tsx
let i = 0;

while i < end : (i += 1) {
	// Loop body.
}
```

The continue expression is executed after each iteration, including when `continue` is used.

Precise ordering rules are **TBD**.

---

### 22.7 While as Expression

A `while` loop may evaluate to a value by using `break value`.

```tsx
let i = 0;

const found = while i < items.length : (i += 1) {
	if items[i] == target {
		break true;
	}
} else {
	false
};
```

Rules:

- `break value` exits the loop with a value.
- The `else` block is evaluated if the loop condition becomes false normally.
- The `else` block is not evaluated if the loop exits using `break`.
- If a `while` is used as an expression, all possible exit values must have compatible types.

This feature is included but may be deferred in implementation.

---

## 23. Functions

Functions are declared using `fn`.

```tsx
fn add(a: number, b: number): number {
	a + b
}
```

Syntax:

```tsx
fn name(argName: ArgType, otherArg: OtherType): ReturnType {
	// body
}
```

The return type may be inferred when possible:

```tsx
fn add(a: number, b: number) {
	a + b
}
```

Return type inference rules are **TBD**.

---

### 23.1 Function Return Values

A function returns:

1. the value of an explicit `return` statement, or
2. the final expression of the function body if present.

```tsx
fn add(a: number, b: number): number {
	a + b
}
```

Equivalent explicit form:

```tsx
fn add(a: number, b: number): number {
	return a + b;
}
```

A function with no returned value has type `void`.

```tsx
fn log(message: string): void {
	console.log(message);
}
```

---

### 23.2 Return Statements

A `return` statement exits the current function.

```tsx
fn abs(value: number): number {
	if value < 0 {
		return -value;
	}

	value
}
```

A return statement must end with a semicolon.

```tsx
return value;
```

---

### 23.3 Anonymous Functions

Anonymous functions use `fn` without a name.

```tsx
const double = fn (value: number): number {
	value * 2
};
```

Return types may be inferred:

```tsx
const double = fn (value: number) {
	value * 2
};
```

Anonymous functions may be passed directly:

```tsx
const names = users.map(fn (user) {
	user.name
});
```

Arrow functions are not part of the language.

---

### 23.4 Function Types

Function type syntax is **TBD**.

Possible syntax:

```tsx
fn(number, number): number
```

Example:

```tsx
const op: fn(number, number): number = fn (a, b) {
	a + b
};
```

