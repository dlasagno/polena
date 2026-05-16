# Future Features

Deferred design areas that are intentionally outside the initial core.

---

## 26. Traits

Classes are not part of the core language.

Shared behavior may eventually be modeled using traits.

Possible syntax:

```tsx
trait Display {
	fn display(self): string;
}

impl Display for User {
	fn display(self): string {
		self.name
	}
}
```

Traits are **TBD** and may be deferred.

The likely initial approach is to start with plain functions and defer methods,
associated functions, `impl` blocks, and traits until the core language is more
stable.

---

## 27. Classes

User-defined classes are not part of the initial language.

The language may eventually support consuming JavaScript classes through interop declarations.

Example direction:

```tsx
declare type AbortController = extern object {
	signal: AbortSignal,
	fn abort(): void,
};

declare fn AbortController.new(): AbortController;
```

Class interop is **TBD**.

---

## 31. Async

Async is **TBD**.

Because the language targets JavaScript and modern web development, async support is expected eventually.

Possible direction:

```tsx
async fn fetchUser(id: string): Result<User, FetchError> {
	// ...
}
```

Interaction between async, `Result`, and `try` is **TBD**.

---

## 32. Compile-Time Evaluation

Compile-time evaluation is planned but not part of the minimal core.

The long-term goal is Zig-inspired metaprogramming that can reduce runtime bundle size and improve developer experience.

Possible future syntax:

```tsx
const routes = comptime scanRoutes("./src/pages");
```

Compile-time code may be used for:

- route generation,
- schema generation,
- environment validation,
- build-time feature flags,
- CSS extraction,
- static asset manifests,
- API client generation,
- dead-code elimination.

Initial support may begin with constant evaluation.

Example:

```tsx
const size = comptime 1024 * 4;
```

Compile-time side effects such as reading files, environment variables, or network resources are **TBD** and should be explicit for caching and reproducibility.

Compiler directives are related to compile-time evaluation but distinct. A
directive such as `@enumVariantNames(Color)` is itself a compile-time operation
and does not need an explicit `comptime` marker.

Directive definitions and open design questions are tracked separately in
[Compiler Directives](../compiler-directives.md).

---

## 33. Build Modes

The compiler may support multiple build modes.

Possible modes:

```tsx
development
safe-production
performance
```

Build modes may affect:

- optimization level,
- emitted debugging information,
- diagnostic verbosity,
- panic messages,
- runtime assertion detail,
- dead-code elimination,
- compile-time evaluation aggressiveness.

Build modes must not silently change the semantics of safe code.

Unsafe operations may be compiled differently depending on the mode.

