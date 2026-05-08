import { compile, type Diagnostic } from "./compiler";

export { compile } from "./compiler";
export type { CompileResult, Diagnostic } from "./compiler";

const supportedSourceExtensions = [".plna", ".polena"] as const;

if (import.meta.main) {
  const inputPath = Bun.argv[2];

  if (inputPath === undefined) {
    console.error("Usage: bun run src/index.ts <file.plna>");
    process.exit(1);
  }

  if (!isSupportedSourceFile(inputPath)) {
    console.error("Expected a Polena source file ending in .plna or .polena.");
    process.exit(1);
  }

  const source = await Bun.file(inputPath).text();
  const result = compile(source);

  if (!result.ok) {
    for (const diagnostic of result.diagnostics) {
      console.error(formatDiagnostic(diagnostic, inputPath));
    }
    process.exit(1);
  }

  console.log(result.js);
}

export function isSupportedSourceFile(path: string): boolean {
  return supportedSourceExtensions.some((extension) => path.endsWith(extension));
}

function formatDiagnostic(diagnostic: Diagnostic, fileName: string): string {
  if (diagnostic.span === undefined) {
    return `${diagnostic.severity}: ${diagnostic.message}`;
  }

  const { line, column } = diagnostic.span.start;
  return `${fileName}:${line}:${column}: ${diagnostic.severity}: ${diagnostic.message}`;
}
