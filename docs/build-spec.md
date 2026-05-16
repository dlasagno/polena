# Build Specification

Status: first draft
Scope: the `@polena/build` package, the `polena.toml` manifest, and the `build`, `init`, and `run` operations.

This document is the source of truth for the `polena.toml` manifest format and for the semantics of building, scaffolding, and running Polena packages. How these operations are surfaced on the command line is defined in [docs/cli-spec.md](cli-spec.md).

---

## 1. Goals

- Define a small, declarative package manifest.
- Provide a single operation that turns a package on disk into emitted JavaScript.
- Provide a single operation that scaffolds a new package.
- Provide a single operation that runs an executable package against a chosen JavaScript runtime.
- Keep package-management concerns isolated from the language compiler. The compiler operates on in-memory sources; the build package owns the filesystem, the manifest, and the package layout convention.

---

## 2. Non-goals

The following are deliberately out of scope for this draft. They may be specified in future revisions.

- External package dependencies, lockfiles, and registries.
- Workspaces and multi-package projects.
- Build profiles (debug/release), feature flags, or build scripts.
- Browser bundling, asset pipelines, and HTML generation.
- Cross-runtime compatibility shims.
- Argument forwarding through `polena run`.
- A clean operation that removes the output directory.

---

## 3. Package layout

A Polena package is a directory containing:

- `polena.toml` — the manifest, at the package root.
- `src/index.plna` — the entry module, required.
- `src/**/*.plna` — optional additional modules, discovered recursively.

The package root is the directory containing `polena.toml`. Source files with the `.polena` extension are also accepted, but `.plna` is preferred.

Any file or directory outside `src/` is ignored by the build.

---

## 4. The manifest (`polena.toml`)

The manifest is a TOML 1.0 file. The fields below are recognized. Unknown top-level fields, unknown sections, and unknown fields inside known sections produce diagnostics.

### 4.1 Top-level fields

| Field     | Type   | Required | Notes |
|-----------|--------|----------|-------|
| `name`    | string | yes      | Must be a valid Polena identifier. |
| `version` | string | yes      | Free-form; semver is recommended. |
| `target`  | string | yes      | `"executable"` or `"library"`. |
| `runtime` | string | no       | `"node"`, `"bun"`, or `"deno"`. Only meaningful for `target = "executable"`. Required to use `polena run`; ignored for libraries. |

### 4.2 `[build]` section

| Field     | Type   | Required | Notes |
|-----------|--------|----------|-------|
| `out-dir` | string | no       | Output directory, resolved relative to the package root. Defaults to `dist`. |

### 4.3 Example

```toml
name = "my_app"
version = "0.1.0"
target = "executable"
runtime = "node"

[build]
out-dir = "dist"
```

### 4.4 Validation

- Missing required fields produce a diagnostic that names the field and points at the manifest.
- An invalid value for `target` or `runtime` produces a diagnostic that lists the permitted values.
- An invalid `name` produces a diagnostic that explains the identifier rule.
- Unknown fields and unknown sections produce diagnostics rather than being silently ignored. This prevents typos in field names from going unnoticed.

---

## 5. The `build` operation

`build` compiles a package into JavaScript modules written to its output directory.

### 5.1 Inputs

- A package root directory.
- An optional output-directory override.

### 5.2 Behavior

1. Resolve the package root. If `polena.toml` is missing, fail with a diagnostic.
2. Parse the manifest. If parsing produces any errors, fail.
3. Verify `src/index.plna` exists. If missing, fail with a diagnostic.
4. Read all `.plna` and `.polena` source files under `src/` recursively.
5. Hand the manifest and sources to the compiler. The compiler produces emitted files and diagnostics. If any diagnostics are errors, fail.
6. Resolve the output directory (see §7).
7. Write each emitted file to the output directory, creating subdirectories as needed. Existing files at those paths are overwritten without warning.

### 5.3 Output stability

- For unchanged inputs, the set of emitted files and their paths under the output directory are stable across runs.
- Removed source files are not garbage-collected from the output directory by `build`.

---

## 6. The `init` operation

`init` scaffolds a new package in a directory.

### 6.1 Inputs

- A target directory.
- An optional package name.

If no name is supplied, the default is the basename of the target directory, sanitized to a valid Polena identifier. If the sanitized basename is empty or otherwise unusable, `init` fails and asks for an explicit name.

### 6.2 Behavior

1. If `polena.toml` already exists in the target directory, fail without making changes.
2. Create the target directory if it does not exist.
3. Create `src/`.
4. Write `polena.toml` using the template in §6.3.
5. Write `src/index.plna` using the template in §6.3.

### 6.3 Templates

`polena.toml`:

```toml
name = "<name>"
version = "0.1.0"
target = "executable"
runtime = "node"
```

`src/index.plna`:

```tsx
export fn main(): void {
  println("Hello, Polena!");
}
```

The `[build]` section is intentionally omitted; the default output directory is sufficient for new packages.

---

## 7. Output directory resolution

The output directory is resolved by the first of the following that is present:

1. The `--out-dir` flag passed to `build` or `run`.
2. The `[build].out-dir` field in the manifest.
3. The default: `dist`.

The resolved path is interpreted relative to the package root. Absolute paths are accepted and used as-is.

---

## 8. The `run` operation

`run` builds the package, then executes the entry module against a runtime.

### 8.1 Preconditions

- The package's `target` must be `"executable"`. Running a library fails with a diagnostic.
- The manifest's `runtime` field must be set. If missing, `run` fails with a diagnostic that explains how to set it.
- The runtime binary must be present on `PATH`. If missing, `run` fails with a diagnostic that names the missing binary.

### 8.2 Behavior

1. Run the `build` operation. On failure, propagate the failure without invoking the runtime.
2. Resolve the entry file: `<out-dir>/index.js`.
3. Invoke the runtime (see §8.3) with the entry file as its program input,
   followed by any command-line arguments supplied by the caller.
4. The runtime's standard input, standard output, and standard error are connected to the calling process.
5. The exit code of `run` is the runtime's exit code unchanged.

### 8.3 Runtimes

Polena does not bundle a runtime. The following values are recognized.

| `runtime` | Invocation                  |
|-----------|-----------------------------|
| `"node"`  | `node <entry> ...args`      |
| `"bun"`   | `bun <entry> ...args`       |
| `"deno"`  | `deno run <entry> ...args`  |

Other values are rejected at manifest parse time.

---

## 9. Diagnostics

- Manifest parsing diagnostics use the compiler's diagnostic infrastructure with spans that point into `polena.toml`.
- Compilation diagnostics use the compiler's existing diagnostic format and renderer.
- I/O failures (missing files, permission errors, write failures) are reported as plain messages without source spans.

---

## 10. Future directions

The items listed in §2 as non-goals are the most likely candidates for future revisions. In addition:

- `[dependencies]` and `[dev-dependencies]` sections once external packages are introduced.
- A `[workspace]` section once multi-package projects are introduced.
- Manifest fields controlling declaration output (`.d.ts`) once the compiler supports it.
- A `browser` runtime value paired with a build pipeline that emits a browser-loadable artifact.
- Finer-grained exit codes from operations, surfaced through the CLI.
