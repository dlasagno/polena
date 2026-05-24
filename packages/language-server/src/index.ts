import { analyze, type AnalyzeResult } from "@polena/compiler";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createConnection,
  DidChangeConfigurationNotification,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  type InitializeParams,
  type InitializeResult,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getDefinition } from "./definition";
import { toLspDiagnostics } from "./diagnostics";
import { getDocumentSymbols } from "./document-symbols";
import { getHover } from "./hover";
import { getManifestCompletions } from "./manifest-completion";
import { isManifestUri } from "./manifest";
import {
  analyzePackageForDocument,
  type LanguageServerIo,
  type OpenDocumentSnapshot,
} from "./package-analysis";
import { getDocumentHighlights, getReferences } from "./references";
import { getRenameEdit, prepareRename } from "./rename";
import { getSignatureHelp } from "./signature-help";
import { getSourceCompletions } from "./source-completion";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analysisCache = new Map<
  string,
  { readonly version: number; readonly analysis: AnalyzeResult }
>();
const packageDiagnosticUris = new Map<string, Set<string>>();
const packageRootByUri = new Map<string, string>();

connection.onInitialize(
  (_params: InitializeParams): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      completionProvider: {
        triggerCharacters: ['"', "=", "."],
      },
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
      },
    },
  }),
);

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined).catch(() => {
    // Configuration is optional for the diagnostics-only MVP.
  });
});

documents.onDidOpen((event) => {
  void publishDiagnostics(event.document);
});
documents.onDidChangeContent((event) => {
  void publishDiagnostics(event.document);
});
documents.onDidSave((event) => {
  void publishDiagnostics(event.document);
});
documents.onDidClose((event) => {
  analysisCache.delete(event.document.uri);
  void publishDiagnostics(event.document, { clearFallback: true });
});

connection.onHover(async (params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return null;
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return null;
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return getHover(document, packageAnalysis.analysis, params.position, {
      analysesByModuleName: packageDiagnostics?.analysesByModuleName,
    });
  }

  return getHover(document, getAnalysis(document), params.position);
});

connection.onDefinition(async (params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return null;
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return null;
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return getDefinition(document, packageAnalysis.analysis, params.position, {
      analysesByModuleName: packageDiagnostics?.analysesByModuleName,
    });
  }

  return getDefinition(document, getAnalysis(document), params.position);
});

connection.onReferences(async (params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return getReferences(
      document,
      packageAnalysis.analysis,
      params.position,
      { includeDeclaration: params.context.includeDeclaration },
      {
        currentModuleName: packageAnalysis.moduleName,
        analysesByModuleName: packageDiagnostics?.analysesByModuleName,
      },
    );
  }

  return getReferences(document, getAnalysis(document), params.position, {
    includeDeclaration: params.context.includeDeclaration,
  });
});

connection.onDocumentHighlight(async (params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return getDocumentHighlights(document, packageAnalysis.analysis, params.position, {
      currentModuleName: packageAnalysis.moduleName,
      analysesByModuleName: packageDiagnostics?.analysesByModuleName,
    });
  }

  return getDocumentHighlights(document, getAnalysis(document), params.position);
});

connection.onPrepareRename(async (params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return null;
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return null;
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return prepareRename(document, packageAnalysis.analysis, params.position, {
      currentModuleName: packageAnalysis.moduleName,
      analysesByModuleName: packageDiagnostics?.analysesByModuleName,
    });
  }

  return prepareRename(document, getAnalysis(document), params.position);
});

connection.onRenameRequest(async (params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return null;
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return null;
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return getRenameEdit(document, packageAnalysis.analysis, params.position, params.newName, {
      currentModuleName: packageAnalysis.moduleName,
      analysesByModuleName: packageDiagnostics?.analysesByModuleName,
    });
  }

  return getRenameEdit(document, getAnalysis(document), params.position, params.newName);
});

connection.onDocumentSymbol((params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return [];
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }

  return getDocumentSymbols(document, getAnalysis(document));
});

connection.onCompletion(async (params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return [];
  }

  if (isManifestUri(params.textDocument.uri)) {
    return getManifestCompletions(document, params.position);
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return getSourceCompletions(document, packageAnalysis.analysis, params.position);
  }

  return getSourceCompletions(document, getAnalysis(document), params.position);
});

connection.onSignatureHelp(async (params) => {
  if (isManifestUri(params.textDocument.uri)) {
    return null;
  }

  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return null;
  }

  const packageDiagnostics = await getPackageDiagnostics(document);
  const packageAnalysis = packageDiagnostics?.analysesByUri.get(document.uri);
  if (packageAnalysis !== undefined) {
    return getSignatureHelp(document, packageAnalysis.analysis, params.position, {
      analysesByModuleName: packageDiagnostics?.analysesByModuleName,
    });
  }

  return getSignatureHelp(document, getAnalysis(document), params.position);
});

async function publishDiagnostics(
  document: TextDocument,
  options: { readonly clearFallback?: boolean } = {},
): Promise<void> {
  const packageDiagnostics = await getPackageDiagnostics(document);
  if (packageDiagnostics !== undefined) {
    const previousUris = packageDiagnosticUris.get(packageDiagnostics.packageRoot) ?? new Set();
    const nextUris = new Set(packageDiagnostics.diagnosticsByUri.keys());

    for (const [uri, diagnostics] of packageDiagnostics.diagnosticsByUri) {
      packageRootByUri.set(uri, packageDiagnostics.packageRoot);
      connection.sendDiagnostics({
        uri,
        diagnostics: toLspDiagnostics(diagnostics, uri),
      });
    }

    for (const uri of previousUris) {
      if (!nextUris.has(uri)) {
        packageRootByUri.delete(uri);
        connection.sendDiagnostics({ uri, diagnostics: [] });
      }
    }

    packageDiagnosticUris.set(packageDiagnostics.packageRoot, nextUris);
    return;
  }

  if (options.clearFallback === true) {
    clearPreviousPackageDiagnostics(document.uri);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  clearPreviousPackageDiagnostics(document.uri);
  if (isManifestUri(document.uri)) {
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    return;
  }

  const analysis = getAnalysis(document);
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: toLspDiagnostics(analysis.diagnostics, document.uri),
  });
}

function clearPreviousPackageDiagnostics(uri: string): void {
  const previousRoot = packageRootByUri.get(uri);
  if (previousRoot === undefined) {
    return;
  }

  for (const packageUri of packageDiagnosticUris.get(previousRoot) ?? []) {
    packageRootByUri.delete(packageUri);
    connection.sendDiagnostics({ uri: packageUri, diagnostics: [] });
  }
  packageDiagnosticUris.delete(previousRoot);
}

async function getPackageDiagnostics(document: TextDocument) {
  const documentPath = pathFromUri(document.uri);
  if (documentPath === undefined) {
    return undefined;
  }

  try {
    return await analyzePackageForDocument({
      documentPath,
      openDocuments: openDocumentSnapshots(),
      io: nodeIo,
    });
  } catch (reason) {
    connection.console.error(`Package analysis failed: ${formatUnknownError(reason)}`);
    return undefined;
  }
}

function getAnalysis(document: TextDocument): AnalyzeResult {
  const cached = analysisCache.get(document.uri);
  if (cached !== undefined && cached.version === document.version) {
    return cached.analysis;
  }

  const analysis = analyze(document.getText());
  analysisCache.set(document.uri, { version: document.version, analysis });
  return analysis;
}

function openDocumentSnapshots(): readonly OpenDocumentSnapshot[] {
  const snapshots: OpenDocumentSnapshot[] = [];
  for (const document of documents.all()) {
    const path = pathFromUri(document.uri);
    if (path !== undefined) {
      snapshots.push({
        uri: document.uri,
        path,
        text: document.getText(),
      });
    }
  }
  return snapshots;
}

function pathFromUri(uri: string): string | undefined {
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
}

const nodeIo: LanguageServerIo = {
  readTextFile: (path) => fs.readFile(path, "utf8"),
  readDir: (path) => fs.readdir(path),
  stat: async (path) => {
    try {
      const info = await fs.stat(path);
      if (info.isFile()) {
        return "file";
      }
      if (info.isDirectory()) {
        return "directory";
      }
      return "missing";
    } catch (reason) {
      if (isNotFoundError(reason)) {
        return "missing";
      }
      throw reason;
    }
  },
};

function isNotFoundError(reason: unknown): boolean {
  return (
    typeof reason === "object" && reason !== null && "code" in reason && reason.code === "ENOENT"
  );
}

function formatUnknownError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

documents.listen(connection);
connection.listen();
