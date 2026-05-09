import { analyze } from "@polena/compiler";
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

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(
  (_params: InitializeParams): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: false,
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
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onHover(() => null);

function publishDiagnostics(document: TextDocument): void {
  const analysis = analyze(document.getText());
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: toLspDiagnostics(analysis.diagnostics, document.uri),
  });
}

documents.listen(connection);
connection.listen();
