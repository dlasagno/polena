import { describe, expect, test } from "bun:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getManifestCompletions } from "../manifest-completion";

describe("manifest completions", () => {
  test("offers missing package manifest fields", () => {
    const document = manifestDocument('name = "app"\n');
    const completions = getManifestCompletions(document, { line: 1, character: 0 });

    expect(completions.map((item) => item.label)).toEqual([
      "version",
      "target",
      "runtime",
      "[build]",
    ]);
  });

  test("offers target values after target assignment", () => {
    const document = manifestDocument('name = "app"\nversion = "0.1.0"\ntarget = ');
    const completions = getManifestCompletions(document, { line: 2, character: 9 });

    expect(completions.map((item) => item.label)).toEqual(['"executable"', '"library"']);
  });

  test("offers runtime values after runtime assignment", () => {
    const document = manifestDocument(
      'name = "app"\nversion = "0.1.0"\ntarget = "executable"\nruntime = ',
    );
    const completions = getManifestCompletions(document, { line: 3, character: 10 });

    expect(completions.map((item) => item.label)).toEqual(['"node"', '"bun"', '"deno"']);
  });

  test("offers build fields inside the build section", () => {
    const document = manifestDocument('name = "app"\n\n[build]\n');
    const completions = getManifestCompletions(document, { line: 3, character: 0 });

    expect(completions.map((item) => item.label)).toEqual(["out-dir"]);
  });

  test("does not offer field snippets inside comments or assigned values", () => {
    const commentDocument = manifestDocument("# ");
    const valueDocument = manifestDocument('name = "');

    expect(getManifestCompletions(commentDocument, { line: 0, character: 2 })).toEqual([]);
    expect(getManifestCompletions(valueDocument, { line: 0, character: 8 })).toEqual([]);
  });
});

function manifestDocument(source: string): TextDocument {
  return TextDocument.create("file:///app/polena.toml", "toml", 1, source);
}
