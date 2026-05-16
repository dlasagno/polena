import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("Polena Language Server");
  const serverModule = resolveServerModule(context);
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "polena" },
      { scheme: "file", pattern: "**/polena.toml" },
    ],
    outputChannel,
    synchronize: {
      fileEvents: [
        vscode.workspace.createFileSystemWatcher("**/*.{plna,polena}"),
        vscode.workspace.createFileSystemWatcher("**/polena.toml"),
      ],
    },
  };

  client = new LanguageClient("polena", "Polena Language Server", serverOptions, clientOptions);
  context.subscriptions.push(client, outputChannel);
  outputChannel.appendLine(`Starting language server from ${serverModule}`);
  void client.start().catch((reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    outputChannel?.appendLine(`Failed to start language server: ${message}`);
    void vscode.window.showErrorMessage(`Failed to start Polena language server: ${message}`);
  });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}

function resolveServerModule(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(path.join("dist", "server.js"));
}
