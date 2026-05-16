import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import { makeLocation, spanFrom, type Span } from "./span";

export type PackageManifest = {
  readonly name: string;
  readonly version: string;
  readonly target: "executable" | "library";
};

export type ParseManifestResult =
  | {
      readonly ok: true;
      readonly manifest: PackageManifest;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function parsePackageManifest(source: string): ParseManifestResult {
  const diagnostics: Diagnostic[] = [];
  const fields = new Map<string, { readonly value: string; readonly span: Span }>();
  const lines = source.split(/\n/);
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const trimmed = line.trim();
    const lineNumber = lineIndex + 1;
    if (trimmed === "" || trimmed.startsWith("#")) {
      offset += line.length + 1;
      continue;
    }

    const sectionMatch = /^\[[^\]]+\]$/.exec(trimmed);
    if (sectionMatch !== null) {
      diagnostics.push(
        manifestError(
          `Unsupported manifest section '${trimmed}'.`,
          lineSpan(offset, lineNumber, line),
          {
            label: "only flat package fields are supported",
          },
        ),
      );
      offset += line.length + 1;
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_$]*)\s*=\s*"([^"]*)"\s*$/.exec(trimmed);
    if (match === null) {
      diagnostics.push(
        manifestError("Invalid manifest entry.", lineSpan(offset, lineNumber, line), {
          label: 'expected a field like name = "my_app"',
        }),
      );
      offset += line.length + 1;
      continue;
    }

    const key = match[1] ?? "";
    const value = match[2] ?? "";
    const keyColumn = line.indexOf(key) + 1;
    fields.set(key, {
      value,
      span: spanFrom(
        makeLocation(offset + keyColumn - 1, lineNumber, keyColumn),
        makeLocation(offset + line.length, lineNumber, line.length + 1),
      ),
    });
    offset += line.length + 1;
  }

  const name = requiredField(fields, "name", source, diagnostics);
  const version = requiredField(fields, "version", source, diagnostics);
  const target = requiredField(fields, "target", source, diagnostics);

  if (name !== undefined && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name.value)) {
    diagnostics.push(
      manifestError(`Invalid package name '${name.value}'.`, name.span, {
        label: "package names must be valid Polena identifiers",
      }),
    );
  }

  if (target !== undefined && target.value !== "executable" && target.value !== "library") {
    diagnostics.push(
      manifestError(`Invalid package target '${target.value}'.`, target.span, {
        label: 'target must be "executable" or "library"',
      }),
    );
  }

  if (
    diagnostics.length > 0 ||
    name === undefined ||
    version === undefined ||
    target === undefined
  ) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    manifest: {
      name: name.value,
      version: version.value,
      target: target.value as "executable" | "library",
    },
    diagnostics,
  };
}

function requiredField(
  fields: ReadonlyMap<string, { readonly value: string; readonly span: Span }>,
  name: string,
  source: string,
  diagnostics: Diagnostic[],
): { readonly value: string; readonly span: Span } | undefined {
  const field = fields.get(name);
  if (field !== undefined) {
    return field;
  }
  diagnostics.push(
    manifestError(
      `Missing required manifest field '${name}'.`,
      lineSpan(0, 1, source.split(/\n/)[0] ?? ""),
      {
        label: "add this field to polena.toml",
      },
    ),
  );
  return undefined;
}

function manifestError(
  message: string,
  span: Span,
  options: { readonly label: string },
): Diagnostic {
  return error(message, span, {
    code: DiagnosticCode.InvalidPackageManifest,
    label: options.label,
  });
}

function lineSpan(offset: number, line: number, text: string): Span {
  return spanFrom(
    makeLocation(offset, line, 1),
    makeLocation(offset + text.length, line, text.length + 1),
  );
}
