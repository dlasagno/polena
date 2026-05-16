# Examples

Small examples that demonstrate the intended language shape.

---

## 35. Example Program

```tsx
type User = {
	id: string,
	name: string,
	nickname: Option<string>,
};

type ParseError = enum {
	MissingId,
	MissingName,
};

fn displayName(user: User): string {
	match user.nickname {
		.Some(name) => name,
		.None => user.name,
	}
}

fn greet(user: User): string {
	"Hello ${displayName(user)}"
}

const user = {
	id: "1",
	name: "Ada",
	nickname: .None,
};

const message = greet(user);
```

---

## 36. Example: Checked Array Access

```tsx
fn firstOrDefault(values: []number, fallback: number): number {
	match values.get(0) {
		.Some(value) => value,
		.None => fallback,
	}
}

fn first(values: []number): number {
	values[0] // Panics if the array is empty.
}
```

---

## 37. Example: Result-Based Error Handling

```tsx
type NumberError = enum {
	Invalid,
	OutOfRange,
};

fn parseNumber(input: string): Result<number, NumberError> {
	// Implementation TBD.
}

fn parsePort(input: string): Result<number, NumberError> {
	const port = try parseNumber(input);

	if port < 0 or port > 65535 {
		return .Err(NumberError.OutOfRange);
	}

	.Ok(port)
}
```

