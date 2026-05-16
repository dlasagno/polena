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
] as const;

const targetValues = [
  { label: '"executable"', documentation: "Package must export fn main(): void." },
  { label: '"library"', documentation: "Package exports form the public surface." },
] as const;

export function getManifestCompletions(
  document: TextDocument,
  position: Position,
): CompletionItem[] {
  const line = getLine(document.getText(), position.line);
  const beforeCursor = line.slice(0, position.character);
  const currentKey = keyForLine(line);

  if (currentKey === "target" && beforeCursor.includes("=")) {
    return targetValues.map(
      (value): CompletionItem => ({
        label: value.label,
        kind: CompletionItemKind.Value,
        insertText: value.label,
        documentation: value.documentation,
      }),
    );
  }

  if (!isFieldCompletionPosition(beforeCursor)) {
    return [];
  }

  const usedFields = fieldsInManifest(document.getText(), position.line);
  return manifestFields
    .filter((field) => !usedFields.has(field.name) || field.name === currentKey)
    .map(
      (field): CompletionItem => ({
        label: field.name,
        kind: CompletionItemKind.Field,
        insertText: field.insertText,
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: field.documentation,
      }),
    );
}

function fieldsInManifest(source: string, currentLine: number): ReadonlySet<string> {
  const fields = new Set<string>();
  const lines = source.split(/\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (lineIndex === currentLine) {
      continue;
    }
    const key = keyForLine(lines[lineIndex] ?? "");
    if (key !== undefined) {
      fields.add(key);
    }
  }

  return fields;
}

function keyForLine(line: string): string | undefined {
  return /^([A-Za-z_][A-Za-z0-9_$]*)\s*=/.exec(line.trim())?.[1];
}

function isFieldCompletionPosition(beforeCursor: string): boolean {
  const trimmed = beforeCursor.trimStart();
  return !trimmed.startsWith("#") && !beforeCursor.includes("=");
}

function getLine(source: string, line: number): string {
  return source.split(/\n/)[line] ?? "";
}
