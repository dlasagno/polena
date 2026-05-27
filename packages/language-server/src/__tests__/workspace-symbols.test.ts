import { describe, expect, test } from "bun:test";
import { analyze, analyzePackage } from "@polena/compiler";
import { SymbolKind } from "vscode-languageserver/node";
import {
  getWorkspaceSymbols,
  workspaceSymbolSourcesFromModules,
  type WorkspaceSymbolSource,
} from "../workspace-symbols";

describe("workspace symbols", () => {
  test("returns filtered top-level symbols with locations", () => {
    const source = [
      "type User = { name: string };",
      "type Status = enum { Ready };",
      "fn greet(user: User): string { user.name }",
      'const user: User = { name: "Ada" };',
    ].join("\n");
    const sources: WorkspaceSymbolSource[] = [
      {
        uri: "file:///standalone.plna",
        analysis: analyze(source),
      },
    ];

    expect(
      getWorkspaceSymbols("user", sources).map((symbol) => [
        symbol.name,
        symbol.kind,
        symbol.location.uri,
        symbol.location.range,
      ]),
    ).toEqual([
      [
        "user",
        SymbolKind.Constant,
        "file:///standalone.plna",
        {
          start: { line: 3, character: 6 },
          end: { line: 3, character: 10 },
        },
      ],
      [
        "User",
        SymbolKind.Struct,
        "file:///standalone.plna",
        {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 9 },
        },
      ],
    ]);
  });

  test("builds sources from package modules", () => {
    const indexSource = "export const version = 1;";
    const usersSource = [
      "export type User = { name: string };",
      "export fn greeting(user: User): string { user.name }",
    ].join("\n");
    const result = analyzePackage({
      manifest: { name: "workspace-symbols-test", version: "0.1.0", target: "library" },
      rootDir: "/app",
      sourceDir: "/app/src",
      files: [
        { path: "/app/src/index.plna", source: indexSource },
        { path: "/app/src/users.plna", source: usersSource },
      ],
    });

    expect(result.diagnostics).toHaveLength(0);
    expect(
      getWorkspaceSymbols("greet", workspaceSymbolSourcesFromModules(result.analyses)).map(
        (symbol) => [symbol.name, symbol.kind, symbol.containerName, symbol.location.uri],
      ),
    ).toEqual([["greeting", SymbolKind.Function, "@/users", "file:///app/src/users.plna"]]);
  });
});
