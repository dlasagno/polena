import { analyze, type AnalyzeResult } from "@polena/compiler";
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
import { toLspDiagnostics } from "./diagnostics";
import { getHover } from "./hover";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analysisCache = new Map<
  string,
  { readonly version: number; readonly analysis: AnalyzeResult }
>();

connection.onInitialize(
  (_params: InitializeParams): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
    },
  }),
);

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined).catch(() => {
    // Configuration is optional for the diagnostics-only MVP.
  });
});

documents.onDidOpen((event) => publishDiagnostics(event.document));
documents.onDidChangeContent((event) => publishDiagnostics(event.document));
documents.onDidSave((event) => publishDiagnostics(event.document));
documents.onDidClose((event) => {
  analysisCache.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri);
  if (document === undefined) {
    return null;
  }

  return getHover(document, getAnalysis(document), params.position);
});

function publishDiagnostics(document: TextDocument): void {
  const analysis = getAnalysis(document);
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: toLspDiagnostics(analysis.diagnostics, document.uri),
  });
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

documents.listen(connection);
connection.listen();
