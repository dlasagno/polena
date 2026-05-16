import type { ImportDeclaration, Program } from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import type { PackageManifest } from "./manifest";
import type { Span } from "./span";

export type SourceFile = {
  readonly path: string;
  readonly source: string;
};

export type ModuleName = string;
export type ModuleId = number;

export type ModuleFile = {
  readonly id: ModuleId;
  readonly name: ModuleName;
  readonly path: string;
  readonly source: string;
  readonly program: Program;
};

export type PackageProgram = {
  readonly manifest: PackageManifest;
  readonly rootDir: string;
  readonly sourceDir: string;
  readonly entryModuleId: ModuleId;
  readonly modules: readonly ModuleFile[];
};

export type ModuleGraph = {
  readonly importsByModule: ReadonlyMap<ModuleId, readonly ResolvedImport[]>;
  readonly modulesInDependencyOrder: readonly ModuleId[];
};

export type ResolvedImport = {
  readonly declaration: ImportDeclaration;
  readonly moduleId: ModuleId;
};

export type BuildPackageProgramResult =
  | {
      readonly ok: true;
      readonly packageProgram: PackageProgram;
      readonly graph: ModuleGraph;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function buildPackageProgram(input: {
  readonly manifest: PackageManifest;
  readonly rootDir: string;
  readonly sourceDir: string;
  readonly files: readonly SourceFile[];
  readonly programs: ReadonlyMap<string, Program>;
}): BuildPackageProgramResult {
  const diagnostics: Diagnostic[] = [];
  const modules: ModuleFile[] = [];
  const moduleNames = new Map<string, ModuleFile>();

  for (const file of input.files) {
    if (!isSupportedSourceFile(file.path)) {
      continue;
    }
    const name = moduleNameFromPath(file.path, input.sourceDir);
    if (name === undefined) {
      continue;
    }
    const program = input.programs.get(file.path);
    if (program === undefined) {
      continue;
    }
    const existing = moduleNames.get(name);
    if (existing !== undefined) {
      diagnostics.push(
        error(`Duplicate module '${name}'.`, program.span, {
          code: DiagnosticCode.DuplicateModule,
          sourcePath: file.path,
          label: "this file resolves to a module name that is already used",
          notes: [{ kind: "help", message: `conflicts with ${existing.path}` }],
        }),
      );
      continue;
    }
    const moduleFile = {
      id: modules.length,
      name,
      path: file.path,
      source: file.source,
      program,
    };
    modules.push(moduleFile);
    moduleNames.set(name, moduleFile);
  }

  const entry = moduleNames.get("@/");
  if (entry === undefined) {
    diagnostics.push(
      error("Package entry module 'src/index.plna' is missing.", emptySpan(), {
        code: DiagnosticCode.MissingModule,
        sourcePath: `${input.sourceDir.replace(/\/$/, "")}/index.plna`,
        label: "add src/index.plna",
      }),
    );
  }

  const importsByModule = new Map<ModuleId, ResolvedImport[]>();
  for (const moduleFile of modules) {
    const resolved: ResolvedImport[] = [];
    for (const declaration of moduleFile.program.imports) {
      if (declaration.path.prefix !== "current-package") {
        diagnostics.push(
          error(`Unsupported import '${declaration.path.text}'.`, declaration.path.span, {
            code: DiagnosticCode.UnsupportedModuleImport,
            sourcePath: moduleFile.path,
            label: "only current-package imports beginning with '@/' are implemented",
          }),
        );
        continue;
      }

      const importedName = `@/${declaration.path.segments.join("/")}`;
      const importedModule = moduleNames.get(importedName);
      if (importedModule === undefined) {
        diagnostics.push(
          error(`Missing module '${importedName}'.`, declaration.path.span, {
            code: DiagnosticCode.MissingModule,
            sourcePath: moduleFile.path,
            label: "no source file resolves to this module",
          }),
        );
        continue;
      }
      resolved.push({ declaration, moduleId: importedModule.id });
    }
    importsByModule.set(moduleFile.id, resolved);
  }

  diagnostics.push(...detectCycles(modules, importsByModule));

  if (diagnostics.length > 0 || entry === undefined) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    packageProgram: {
      manifest: input.manifest,
      rootDir: input.rootDir,
      sourceDir: input.sourceDir,
      entryModuleId: entry.id,
      modules,
    },
    graph: {
      importsByModule,
      modulesInDependencyOrder: topologicalOrder(modules, importsByModule),
    },
    diagnostics,
  };
}

export function moduleNameFromPath(path: string, sourceDir: string): ModuleName | undefined {
  const normalizedPath = normalizePath(path);
  const normalizedSourceDir = normalizePath(sourceDir).replace(/\/$/, "");
  const prefix = `${normalizedSourceDir}/`;
  if (!normalizedPath.startsWith(prefix)) {
    return undefined;
  }
  const relative = normalizedPath.slice(prefix.length);
  const withoutExtension = relative.replace(/\.(plna|polena)$/, "");
  if (withoutExtension === "index") {
    return "@/";
  }
  if (withoutExtension.endsWith("/index")) {
    return `@/${withoutExtension.slice(0, -"/index".length)}`;
  }
  return `@/${withoutExtension}`;
}

export function jsPathForModule(moduleName: ModuleName): string {
  if (moduleName === "@/") {
    return "index.js";
  }
  return `${moduleName.slice(2)}.js`;
}

export function relativeJsImportPath(fromModule: ModuleName, toModule: ModuleName): string {
  const fromDir = dirname(jsPathForModule(fromModule));
  const toPath = jsPathForModule(toModule);
  const relative = relativePath(fromDir, toPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function detectCycles(
  modules: readonly ModuleFile[],
  importsByModule: ReadonlyMap<ModuleId, readonly ResolvedImport[]>,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const visiting: ModuleId[] = [];
  const visited = new Set<ModuleId>();

  function visit(moduleId: ModuleId): void {
    if (visited.has(moduleId)) {
      return;
    }
    const activeIndex = visiting.indexOf(moduleId);
    if (activeIndex >= 0) {
      const cycle = [...visiting.slice(activeIndex), moduleId];
      const names = cycle.map((id) => modules[id]?.name ?? "<unknown>");
      for (let index = 0; index < cycle.length - 1; index += 1) {
        const from = cycle[index];
        const to = cycle[index + 1];
        if (from === undefined || to === undefined) {
          continue;
        }
        const importDecl = importsByModule
          .get(from)
          ?.find((candidate) => candidate.moduleId === to)?.declaration;
        if (importDecl !== undefined) {
          diagnostics.push(
            error("Circular import detected.", importDecl.path.span, {
              code: DiagnosticCode.CircularImport,
              sourcePath: modules[from]?.path,
              label: "this import participates in a cycle",
              notes: [{ kind: "help", message: names.join(" -> ") }],
            }),
          );
        }
      }
      return;
    }

    visiting.push(moduleId);
    for (const imported of importsByModule.get(moduleId) ?? []) {
      visit(imported.moduleId);
    }
    visiting.pop();
    visited.add(moduleId);
  }

  for (const moduleFile of modules) {
    visit(moduleFile.id);
  }

  return diagnostics;
}

function topologicalOrder(
  modules: readonly ModuleFile[],
  importsByModule: ReadonlyMap<ModuleId, readonly ResolvedImport[]>,
): readonly ModuleId[] {
  const visited = new Set<ModuleId>();
  const order: ModuleId[] = [];
  function visit(moduleId: ModuleId): void {
    if (visited.has(moduleId)) {
      return;
    }
    visited.add(moduleId);
    for (const imported of importsByModule.get(moduleId) ?? []) {
      visit(imported.moduleId);
    }
    order.push(moduleId);
  }
  for (const moduleFile of modules) {
    visit(moduleFile.id);
  }
  return order;
}

function isSupportedSourceFile(path: string): boolean {
  return path.endsWith(".plna") || path.endsWith(".polena");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/");
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function relativePath(fromDir: string, toPath: string): string {
  const fromParts = fromDir === "" ? [] : fromDir.split("/");
  const toParts = toPath.split("/");
  while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return [...fromParts.map(() => ".."), ...toParts].join("/");
}

function emptySpan(): Span {
  return {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 0, line: 1, column: 1 },
  };
}
