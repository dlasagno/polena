import { check, type ImportedModule, type ImportedName, type ModuleExports } from "./checker";
import { generateJavaScript, generateJavaScriptModule } from "./codegen";
import { stdlibSources } from "@polena/stdlib";
import type { Expression, Program } from "./ast";
import { error, type Diagnostic } from "./diagnostic";
import { DiagnosticCode } from "./diagnostic-codes";
import { lex } from "./lexer";
import type { PackageManifest } from "./manifest";
import {
  buildPackageProgram,
  jsPathForModule,
  type ModuleFile,
  type ModuleGraph,
  type ModuleId,
  type ModuleName,
  type PackageProgram,
  type SourceFile,
} from "./modules";
import { parse } from "./parser";
import type { Semantics } from "./semantics";

export type AnalyzeResult = {
  readonly program: Program;
  readonly diagnostics: readonly Diagnostic[];
  readonly semantics: Semantics;
};

export type PackageDiagnostic = {
  readonly path: string;
  readonly diagnostic: Diagnostic;
};

export type CompileResult =
  | {
      readonly ok: true;
      readonly js: string;
      readonly diagnostics: readonly Diagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
    };

export type { PackageManifest, ModuleFile, ModuleId, ModuleName, PackageProgram, SourceFile };

export type EmittedFile = {
  readonly path: string;
  readonly contents: string;
};

export type StandardLibrary = {
  readonly files: readonly SourceFile[];
};

export const bundledStandardLibrary: StandardLibrary = {
  files: stdlibSources,
};

type PackageCompileInput = {
  readonly manifest: PackageManifest;
  readonly rootDir: string;
  readonly sourceDir: string;
  readonly files: readonly SourceFile[];
  readonly standardLibrary?: StandardLibrary;
};

type NormalizedPackageCompileInput = Omit<PackageCompileInput, "standardLibrary"> & {
  readonly standardLibrary: StandardLibrary;
};

export type CompilePackageResult =
  | {
      readonly ok: true;
      readonly packageProgram: PackageProgram;
      readonly diagnostics: readonly Diagnostic[];
      readonly files: readonly EmittedFile[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
    };

export type AnalyzePackageResult =
  | {
      readonly ok: true;
      readonly packageProgram: PackageProgram;
      readonly diagnostics: readonly PackageDiagnostic[];
      readonly analyses: readonly ModuleAnalysis[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly PackageDiagnostic[];
      readonly analyses: readonly ModuleAnalysis[];
    };

export type ModuleAnalysis = {
  readonly moduleName: ModuleName;
  readonly path: string;
  readonly analysis: AnalyzeResult;
};

type PackageAnalysisPipelineResult =
  | {
      readonly ok: true;
      readonly packageProgram: PackageProgram;
      readonly graph: ModuleGraph;
      readonly diagnostics: readonly PackageDiagnostic[];
      readonly analyses: readonly ModuleAnalysis[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly PackageDiagnostic[];
      readonly analyses: readonly ModuleAnalysis[];
    };

type ParsedStdlibFile = {
  readonly program: Program;
  readonly diagnostics: readonly Diagnostic[];
};

type CheckedStdlibModule = {
  readonly exports: ModuleExports;
  readonly analysis: ModuleAnalysis;
};

type StandardLibraryCache = {
  readonly parsedByPath: ReadonlyMap<string, ParsedStdlibFile>;
  readonly canReuseCheckedModules: boolean;
  readonly checkedByPath: Map<string, CheckedStdlibModule>;
};

const standardLibraryCaches = new WeakMap<StandardLibrary, StandardLibraryCache>();

export function analyze(source: string): AnalyzeResult {
  const lexResult = lex(source);
  const parseResult = parse(lexResult.tokens);
  const checkResult = check(parseResult.program);
  const diagnostics = [
    ...lexResult.diagnostics,
    ...parseResult.diagnostics,
    ...checkResult.diagnostics,
  ];

  return {
    program: parseResult.program,
    diagnostics,
    semantics: checkResult.semantics,
  };
}

export function compile(source: string): CompileResult {
  const analysis = analyze(source);

  if (analysis.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { ok: false, diagnostics: analysis.diagnostics };
  }

  return {
    ok: true,
    js: generateJavaScript(analysis.program, analysis.semantics),
    diagnostics: analysis.diagnostics,
  };
}

export function analyzePackage(input: {
  readonly manifest: PackageManifest;
  readonly rootDir: string;
  readonly sourceDir: string;
  readonly files: readonly SourceFile[];
  readonly standardLibrary?: StandardLibrary;
}): AnalyzePackageResult {
  const analysis = analyzePackagePipeline(withStandardLibrary(input));
  if (!analysis.ok) {
    return {
      ok: false,
      diagnostics: analysis.diagnostics,
      analyses: analysis.analyses,
    };
  }

  return {
    ok: true,
    packageProgram: analysis.packageProgram,
    diagnostics: analysis.diagnostics,
    analyses: analysis.analyses,
  };
}

export function compilePackage(input: {
  readonly manifest: PackageManifest;
  readonly rootDir: string;
  readonly sourceDir: string;
  readonly files: readonly SourceFile[];
  readonly standardLibrary?: StandardLibrary;
}): CompilePackageResult {
  const analysis = analyzePackagePipeline(withStandardLibrary(input));
  const diagnostics = analysis.diagnostics.map(packageDiagnosticToDiagnostic);

  if (!analysis.ok) {
    return { ok: false, diagnostics };
  }

  const modules = modulesToEmit(analysis.packageProgram, analysis.graph);
  const analysesByPath = new Map(analysis.analyses.map((item) => [item.path, item.analysis]));
  return {
    ok: true,
    packageProgram: analysis.packageProgram,
    diagnostics,
    files: analysis.packageProgram.modules
      .filter((moduleFile) => modules.has(moduleFile.id))
      .map((moduleFile) => ({
        path: jsPathForModule(moduleFile.name),
        contents: generateJavaScriptModule({
          module: moduleFile,
          packageProgram: analysis.packageProgram,
          moduleGraph: analysis.graph,
          isEntry: moduleFile.id === analysis.packageProgram.entryModuleId,
          semantics: analysesByPath.get(moduleFile.path)?.semantics,
        }),
      })),
  };
}

function withStandardLibrary(input: PackageCompileInput): NormalizedPackageCompileInput {
  return {
    ...input,
    standardLibrary: input.standardLibrary ?? bundledStandardLibrary,
  };
}

function cacheForStandardLibrary(standardLibrary: StandardLibrary): StandardLibraryCache {
  const existing = standardLibraryCaches.get(standardLibrary);
  if (existing !== undefined) {
    return existing;
  }

  const parsedByPath = new Map<string, ParsedStdlibFile>();
  for (const file of standardLibrary.files) {
    const lexResult = lex(file.source);
    const parseResult = parse(lexResult.tokens, { moduleMode: true });
    parsedByPath.set(file.path, {
      program: parseResult.program,
      diagnostics: [...lexResult.diagnostics, ...parseResult.diagnostics],
    });
  }

  const canReuseCheckedModules = [...parsedByPath.values()].every((parsed) =>
    parsed.program.imports.every((declaration) => declaration.path.prefix === "std"),
  );
  const cache: StandardLibraryCache = {
    parsedByPath,
    canReuseCheckedModules,
    checkedByPath: new Map(),
  };
  standardLibraryCaches.set(standardLibrary, cache);
  return cache;
}

function cachedCheckedStdlibModule(
  cache: StandardLibraryCache,
  moduleFile: ModuleFile,
): CheckedStdlibModule | undefined {
  if (!cache.canReuseCheckedModules || moduleFile.origin !== "std") {
    return undefined;
  }
  return cache.checkedByPath.get(moduleFile.path);
}

function analyzePackagePipeline(
  input: NormalizedPackageCompileInput,
): PackageAnalysisPipelineResult {
  const diagnostics: PackageDiagnostic[] = [];
  const programs = new Map<string, Program>();
  const standardLibraryCache = cacheForStandardLibrary(input.standardLibrary);

  for (const file of input.files) {
    const lexResult = lex(file.source);
    const parseResult = parse(lexResult.tokens, { moduleMode: true });
    diagnostics.push(
      ...diagnosticsForPath(file.path, [...lexResult.diagnostics, ...parseResult.diagnostics]),
    );
    programs.set(file.path, parseResult.program);
  }
  for (const file of input.standardLibrary.files) {
    const cached = standardLibraryCache.parsedByPath.get(file.path);
    if (cached === undefined) {
      continue;
    }
    diagnostics.push(...diagnosticsForPath(file.path, cached.diagnostics));
    programs.set(file.path, cached.program);
  }

  const packageResult = buildPackageProgram({
    ...input,
    stdFiles: input.standardLibrary.files,
    programs,
  });
  diagnostics.push(...packageDiagnostics(packageResult.diagnostics, input.sourceDir));
  if (!packageResult.ok) {
    return { ok: false, diagnostics, analyses: [] };
  }

  const exportsByModule = new Map<ModuleId, ModuleExports>();
  const analyses: ModuleAnalysis[] = [];
  const moduleById = new Map(
    packageResult.packageProgram.modules.map((moduleFile) => [moduleFile.id, moduleFile]),
  );

  for (const moduleId of packageResult.graph.modulesInDependencyOrder) {
    const moduleFile = moduleById.get(moduleId);
    if (moduleFile === undefined) {
      continue;
    }
    const cachedStdModule = cachedCheckedStdlibModule(standardLibraryCache, moduleFile);
    if (cachedStdModule !== undefined) {
      diagnostics.push(
        ...diagnosticsForPath(moduleFile.path, cachedStdModule.analysis.analysis.diagnostics),
      );
      analyses.push(cachedStdModule.analysis);
      exportsByModule.set(moduleFile.id, cachedStdModule.exports);
      continue;
    }

    const moduleDiagnostics: Diagnostic[] = [];
    moduleDiagnostics.push(...validateModuleConstInitializers(moduleFile));
    const imports = buildCheckImports(
      moduleFile,
      packageResult.graph,
      packageResult.packageProgram,
      exportsByModule,
      moduleDiagnostics,
    );
    const checkResult = check(moduleFile.program, {
      ...imports,
      allowTargetEscapes:
        moduleFile.origin === "std" ||
        packageResult.packageProgram.manifest.unsafe?.targetEscapes === true,
    });
    moduleDiagnostics.push(...checkResult.diagnostics);
    diagnostics.push(...diagnosticsForPath(moduleFile.path, moduleDiagnostics));
    analyses.push({
      moduleName: moduleFile.name,
      path: moduleFile.path,
      analysis: {
        program: moduleFile.program,
        diagnostics: moduleDiagnostics,
        semantics: checkResult.semantics,
      },
    });
    exportsByModule.set(moduleFile.id, checkResult.exports);
    if (standardLibraryCache.canReuseCheckedModules && moduleFile.origin === "std") {
      const analysis = analyses[analyses.length - 1];
      if (analysis !== undefined) {
        standardLibraryCache.checkedByPath.set(moduleFile.path, {
          exports: checkResult.exports,
          analysis,
        });
      }
    }
  }

  diagnostics.push(
    ...packageDiagnostics(validateMain(packageResult.packageProgram), input.sourceDir),
  );

  if (diagnostics.some((item) => item.diagnostic.severity === "error")) {
    return { ok: false, diagnostics, analyses };
  }

  return {
    ok: true,
    packageProgram: packageResult.packageProgram,
    graph: packageResult.graph,
    diagnostics,
    analyses,
  };
}

function modulesToEmit(packageProgram: PackageProgram, graph: ModuleGraph): ReadonlySet<ModuleId> {
  const included = new Set<ModuleId>();
  function include(moduleId: ModuleId): void {
    if (included.has(moduleId)) {
      return;
    }
    included.add(moduleId);
    for (const imported of graph.importsByModule.get(moduleId) ?? []) {
      include(imported.moduleId);
    }
  }

  for (const moduleFile of packageProgram.modules) {
    if (moduleFile.origin === "package") {
      include(moduleFile.id);
    }
  }
  return included;
}

function buildCheckImports(
  moduleFile: ModuleFile,
  graph: ModuleGraph,
  packageProgram: PackageProgram,
  exportsByModule: ReadonlyMap<ModuleId, ModuleExports>,
  diagnostics: Diagnostic[],
): {
  readonly qualifiedImports: readonly ImportedModule[];
  readonly valueImports: readonly ImportedName[];
  readonly typeImports: readonly ImportedName[];
} {
  const qualifiedImports: ImportedModule[] = [];
  const valueImports: ImportedName[] = [];
  const typeImports: ImportedName[] = [];
  const resolvedImports = graph.importsByModule.get(moduleFile.id) ?? [];

  for (const importDeclaration of moduleFile.program.imports) {
    const resolved = resolvedImports.find(
      (candidate) => candidate.declaration.nodeId === importDeclaration.nodeId,
    );
    if (resolved === undefined) {
      continue;
    }
    const importedModule = packageProgram.modules[resolved.moduleId];
    const moduleExports = exportsByModule.get(resolved.moduleId);
    if (importedModule === undefined || moduleExports === undefined) {
      continue;
    }

    qualifiedImports.push({
      moduleName: importedModule.name,
      alias:
        importDeclaration.alias?.name ??
        importDeclaration.path.segments[importDeclaration.path.segments.length - 1] ??
        "module",
      values: moduleExports.values,
      types: moduleExports.types,
    });

    for (const item of importDeclaration.items) {
      if (item.namespace === "value") {
        const symbol = moduleExports.values.get(item.name);
        if (symbol === undefined) {
          diagnostics.push(
            error(
              `Module '${importedModule.name}' does not export value '${item.name}'.`,
              item.nameSpan,
              {
                code: DiagnosticCode.UnknownExport,
                sourcePath: moduleFile.path,
                label: "this exported value was not found",
              },
            ),
          );
          continue;
        }
        valueImports.push({
          localName: item.alias?.name ?? item.name,
          exportedName: item.name,
          moduleName: importedModule.name,
          symbol,
        });
      } else {
        const symbol = moduleExports.types.get(item.name);
        if (symbol === undefined) {
          diagnostics.push(
            error(
              `Module '${importedModule.name}' does not export type '${item.name}'.`,
              item.nameSpan,
              {
                code: DiagnosticCode.UnknownExport,
                sourcePath: moduleFile.path,
                label: "this exported type was not found",
              },
            ),
          );
          continue;
        }
        typeImports.push({
          localName: item.alias?.name ?? item.name,
          exportedName: item.name,
          moduleName: importedModule.name,
          symbol,
        });
      }
    }
  }

  return { qualifiedImports, valueImports, typeImports };
}

function validateMain(packageProgram: PackageProgram): readonly Diagnostic[] {
  const entry = packageProgram.modules[packageProgram.entryModuleId];
  if (entry === undefined) {
    return [];
  }
  const main = entry.program.declarations.find(
    (
      declaration,
    ): declaration is Extract<
      Program["declarations"][number],
      { readonly kind: "FunctionDeclaration" }
    > => declaration.kind === "FunctionDeclaration" && declaration.name === "main",
  );
  if (packageProgram.manifest.target === "library") {
    if (main !== undefined) {
      return [
        error("Library packages must not define 'main' in the entry module.", main.nameSpan, {
          code: DiagnosticCode.MainInLibrary,
          sourcePath: entry.path,
          label: "remove this entry point or change the package target",
        }),
      ];
    }
    return [];
  }
  if (main === undefined) {
    return [
      error("Executable packages must export 'main' from src/index.plna.", entry.program.span, {
        code: DiagnosticCode.MissingMain,
        sourcePath: entry.path,
        label: "add 'export fn main(): void'",
      }),
    ];
  }
  if (
    !main.exported ||
    main.typeParameters.length !== 0 ||
    !isValidMainParameters(main) ||
    main.returnType.kind !== "PrimitiveType" ||
    main.returnType.name !== "void"
  ) {
    return [
      error(
        "'main' must have signature 'export fn main(): void' or 'export fn main(args: []string): void'.",
        main.nameSpan,
        {
          code: DiagnosticCode.InvalidMain,
          sourcePath: entry.path,
          label: "entry point signature is invalid",
        },
      ),
    ];
  }
  if (main.params.length === 1 && packageProgram.manifest.runtime === undefined) {
    return [
      error(
        "'main' with command-line arguments requires a runtime in polena.toml.",
        main.nameSpan,
        {
          code: DiagnosticCode.InvalidMain,
          sourcePath: entry.path,
          label: 'add runtime = "node", "bun", or "deno"',
        },
      ),
    ];
  }
  return [];
}

function isValidMainParameters(
  main: Extract<Program["declarations"][number], { readonly kind: "FunctionDeclaration" }>,
): boolean {
  if (main.params.length === 0) {
    return true;
  }
  if (main.params.length !== 1) {
    return false;
  }

  const paramType = main.params[0]?.type;
  return (
    paramType?.kind === "ArrayType" &&
    paramType.element.kind === "PrimitiveType" &&
    paramType.element.name === "string"
  );
}

function validateModuleConstInitializers(moduleFile: ModuleFile): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const declaration of moduleFile.program.declarations) {
    if (declaration.kind !== "VariableDeclaration") {
      continue;
    }
    if (!isModuleConstExpression(declaration.initializer)) {
      diagnostics.push(
        error(
          "Module-scope const initializer must be compile-time constant.",
          declaration.initializer.span,
          {
            code: DiagnosticCode.InvalidModuleConst,
            sourcePath: moduleFile.path,
            label: "function calls and runtime expressions are not allowed here",
          },
        ),
      );
    }
  }
  return diagnostics;
}

function diagnosticsForPath(
  path: string,
  diagnostics: readonly Diagnostic[],
): readonly PackageDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    path: diagnostic.sourcePath ?? path,
    diagnostic,
  }));
}

function packageDiagnostics(
  diagnostics: readonly Diagnostic[],
  sourceDir: string,
): readonly PackageDiagnostic[] {
  return diagnosticsForPath(`${sourceDir.replace(/\/$/, "")}/index.plna`, diagnostics);
}

function packageDiagnosticToDiagnostic(item: PackageDiagnostic): Diagnostic {
  if (item.diagnostic.sourcePath !== undefined) {
    return item.diagnostic;
  }
  return { ...item.diagnostic, sourcePath: item.path };
}

function isModuleConstExpression(expression: Expression): boolean {
  switch (expression.kind) {
    case "NumberLiteral":
    case "BigIntLiteral":
    case "StringLiteral":
    case "BooleanLiteral":
    case "NameExpression":
    case "DirectiveExpression":
    case "EnumVariantExpression":
      return true;
    case "ArrayLiteral":
      return expression.elements.every(isModuleConstExpression);
    case "ObjectLiteral":
      return expression.fields.every((field) => isModuleConstExpression(field.value));
    case "UnaryExpression":
      return isModuleConstExpression(expression.operand);
    case "BinaryExpression":
      return isModuleConstExpression(expression.left) && isModuleConstExpression(expression.right);
    case "MemberExpression":
      return expression.target.kind === "NameExpression";
    case "CallExpression":
      return (
        expression.callee.kind === "MemberExpression" &&
        expression.callee.target.kind === "NameExpression" &&
        expression.args.every(isModuleConstExpression)
      );
    case "PanicExpression":
    case "RecoveryExpression":
    case "IfExpression":
    case "WhileExpression":
    case "MatchExpression":
    case "IndexExpression":
      return false;
  }
}

export { generateJavaScript } from "./codegen";
export { lex } from "./lexer";
export { parse } from "./parser";
export { moduleNameFromPath } from "./modules";
export { findHoverTarget, findNodeAt } from "./query";
export type { Diagnostic } from "./diagnostic";
export type { NodeId, Program } from "./ast";
export type { Definition, ReferenceTarget, Semantics } from "./semantics";
export type { HoverTarget, HoverTargetKind } from "./query";
