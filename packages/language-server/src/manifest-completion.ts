import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
} from "vscode-languageserver/node";
import type { Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

const manifestFields = [
  {
    name: "name",
    insertText: 'name = "$1"',
    documentation: "Package name used by external imports.",
  },
  {
    name: "version",
    insertText: 'version = "$1"',
    documentation: "Package version.",
  },
  {
    name: "target",
    insertText: 'target = "executable"',
    documentation: 'Package role: "executable" or "library".',
  },
  {
    name: "runtime",
    insertText: 'runtime = "node"',
    documentation: 'Runtime used by "polena run": "node", "bun", or "deno".',
  },
  {
    name: "[build]",
    insertText: '[build]\nout-dir = "dist"',
    documentation: "Build settings.",
  },
] as const;

const buildFields = [
  {
    name: "out-dir",
    insertText: 'out-dir = "dist"',
    documentation: "Output directory for emitted JavaScript.",
  },
] as const;

const targetValues = [
  { label: '"executable"', documentation: "Package must export fn main(): void." },
  { label: '"library"', documentation: "Package exports form the public surface." },
] as const;

const runtimeValues = [
  { label: '"node"', documentation: "Run emitted JavaScript with Node.js." },
  { label: '"bun"', documentation: "Run emitted JavaScript with Bun." },
  { label: '"deno"', documentation: "Run emitted JavaScript with Deno." },
] as const;

export function getManifestCompletions(
  document: TextDocument,
  position: Position,
): CompletionItem[] {
  const line = getLine(document.getText(), position.line);
  const beforeCursor = line.slice(0, position.character);
  const currentKey = keyForLine(line);
  const section = sectionForLine(document.getText(), position.line);

  if (currentKey === "target" && beforeCursor.includes("=")) {
    return valueCompletions(targetValues);
  }

  if (currentKey === "runtime" && beforeCursor.includes("=")) {
    return valueCompletions(runtimeValues);
  }

  if (!isFieldCompletionPosition(beforeCursor)) {
    return [];
  }

  if (section === "build") {
    const usedFields = fieldsInSection(document.getText(), position.line, "build");
    return buildFields
      .filter((field) => !usedFields.has(field.name) || field.name === currentKey)
      .map(fieldCompletion);
  }

  const usedFields = topLevelFieldsInManifest(document.getText(), position.line);
  return manifestFields
    .filter((field) => !usedFields.has(field.name) || field.name === currentKey)
    .map(fieldCompletion);
}

function topLevelFieldsInManifest(source: string, currentLine: number): ReadonlySet<string> {
  const fields = new Set<string>();
  const lines = source.split(/\n/);
  let section: string | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (lineIndex === currentLine) {
      continue;
    }
    const line = lines[lineIndex] ?? "";
    const nextSection = sectionForRawLine(line);
    if (nextSection !== undefined) {
      section = nextSection;
      if (section === "build") {
        fields.add("[build]");
      }
      continue;
    }
    const key = section === undefined ? keyForLine(line) : undefined;
    if (key !== undefined) {
      fields.add(key);
    }
  }

  return fields;
}

function fieldsInSection(
  source: string,
  currentLine: number,
  sectionName: string,
): ReadonlySet<string> {
  const fields = new Set<string>();
  const lines = source.split(/\n/);
  let section: string | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? "";
    const nextSection = sectionForRawLine(line);
    if (nextSection !== undefined) {
      section = nextSection;
      continue;
    }
    if (lineIndex === currentLine || section !== sectionName) {
      continue;
    }
    const key = keyForLine(line);
    if (key !== undefined) {
      fields.add(key);
    }
  }

  return fields;
}

function keyForLine(line: string): string | undefined {
  return /^([A-Za-z_][A-Za-z0-9_$-]*)\s*=/.exec(line.trim())?.[1];
}

function isFieldCompletionPosition(beforeCursor: string): boolean {
  const trimmed = beforeCursor.trimStart();
  return !trimmed.startsWith("#") && !beforeCursor.includes("=");
}

function getLine(source: string, line: number): string {
  return source.split(/\n/)[line] ?? "";
}

function sectionForLine(source: string, line: number): string | undefined {
  const lines = source.split(/\n/);
  let section: string | undefined;
  for (let index = 0; index < line; index += 1) {
    const nextSection = sectionForRawLine(lines[index] ?? "");
    if (nextSection !== undefined) {
      section = nextSection;
    }
  }
  return section;
}

function sectionForRawLine(line: string): string | undefined {
  return /^\[([^\]]+)\]\s*$/.exec(line.trim())?.[1];
}

function fieldCompletion(field: {
  readonly name: string;
  readonly insertText: string;
  readonly documentation: string;
}): CompletionItem {
  return {
    label: field.name,
    kind: CompletionItemKind.Field,
    insertText: field.insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    documentation: field.documentation,
  };
}

function valueCompletions(
  values: readonly { readonly label: string; readonly documentation: string }[],
): CompletionItem[] {
  return values.map(
    (value): CompletionItem => ({
      label: value.label,
      kind: CompletionItemKind.Value,
      insertText: value.label,
      documentation: value.documentation,
    }),
  );
}
