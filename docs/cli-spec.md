# CLI Specification

Status: first draft
Scope: the `polena` command-line interface — argument parsing, command dispatch, exit codes, and output streams.

This document defines how Polena operations are surfaced to users on the command line. The operations themselves are specified in [docs/build-spec.md](build-spec.md); this document does not redefine their semantics.

---

## 1. Goals

- A single binary, `polena`, exposes all user-facing operations as subcommands.
- Argument parsing is predictable and consistent across commands.
- Exit codes, stdout, and stderr have clearly defined roles.
- The CLI is a thin dispatcher: argument parsing, error formatting, and process exit. Operation logic lives in the build and compiler packages.

---

## 2. Command surface

```
polena build [path] [--out-dir <dir>]
polena init  [path] [--name <name>]
polena run   [path]
polena --version | -V | version
polena --help    | -h | help
```

`[path]` denotes a package directory and defaults to the current working directory.

The bare words `version` and `help` are accepted as subcommands in addition to the flag forms, to match expectations from other language CLIs.

---

## 3. Global options

The following options are recognized on any command:

- `-h`, `--help` — print the help for the current command (or the top-level help when no command is given) and exit with code 0.
- `-V`, `--version` — print the compiler version and exit with code 0.

When a global flag is present, it takes precedence over the subcommand's normal behavior.

---

## 4. `polena build`

```
polena build [path] [--out-dir <dir>]
```

- `path` — package directory containing `polena.toml`. Defaults to `.`.
- `--out-dir <dir>` — overrides the manifest's `[build].out-dir`. See build spec §7.

Runs the build operation defined in build spec §5.

---

## 5. `polena init`

```
polena init [path] [--name <name>]
```

- `path` — directory to initialize. Defaults to `.`.
- `--name <name>` — package name written into `polena.toml`. Defaults to the basename of `path`, sanitized to a valid Polena identifier. If sanitization cannot produce a valid name, the CLI fails with a diagnostic asking for an explicit `--name`.

Runs the init operation defined in build spec §6.

---

## 6. `polena run`

```
polena run [path]
```

- `path` — package directory. Defaults to `.`.

Runs the run operation defined in build spec §8. The CLI does not interpret or modify the runtime's input or output; they are connected directly to the calling process.

---

## 7. `polena --version` and `polena --help`

`--version` prints `polena <version>` to stdout, followed by a newline, and exits with code 0.

`--help` without a subcommand prints the top-level help and exits with code 0. `--help` combined with a subcommand (e.g. `polena build --help`) prints the help for that subcommand and exits with code 0.

The exact wording and layout of help text is implementation-defined and not part of this stability contract.

---

## 8. Argument parsing rules

- Flags begin with `-` (short) or `--` (long).
- Long flags that take a value use the form `--flag <value>` (separate arguments). The `--flag=value` form is not supported.
- Short flags are not combined: `-Vh` is a usage error; use `-V` or `-h`.
- The first non-flag argument after the subcommand is the positional `path`. A second non-flag argument is a usage error.
- Unknown flags are usage errors.
- Usage errors print a one-line error to stderr, followed by the relevant help text, and exit with code 1.

---

## 9. Exit codes

| Code | Meaning |
|------|---------|
| 0    | Success. |
| 1    | Failure: argument error, manifest error, compilation errors, I/O failure, or — for `polena run` — failure to invoke the runtime. |

`polena run` is an exception to row 1: when `build` succeeds and the runtime is invoked, the exit code of `polena run` is the runtime's exit code unchanged, including 0 for success and any non-zero value the runtime returns.

A future revision may introduce finer-grained exit codes. Consumers should not encode assumptions beyond "0 is success."

---

## 10. Output streams

- `stdout` carries command output that is the requested result: help text, the version string, and (during `run`) the runtime's own stdout.
- `stderr` carries diagnostics, errors, warnings, and anything that is not the requested result. During `run`, this includes the runtime's own stderr.

A machine-readable output mode is not specified.

---

## 11. Stability

- The set of subcommands, their positional arguments, and their flag names are stable.
- Help text wording, diagnostic wording, and exit-code granularity beyond §9 are not stable in the current draft.
- The manifest schema is stable per the build spec; the CLI does not extend it.
