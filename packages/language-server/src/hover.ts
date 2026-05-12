import { findNodeAt, formatType, type AnalyzeResult } from "@polena/compiler";
import type { Hover, Position } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

export function getHover(
  document: TextDocument,
  analysis: AnalyzeResult,
  position: Position,
): Hover | null {
  const nodeId = findNodeAt(analysis.program, document.offsetAt(position));
  if (nodeId === undefined) {
    return null;
  }

  const type = analysis.semantics.expressionTypes.get(nodeId);
  if (type === undefined) {
    return null;
  }

  return {
    contents: {
      kind: "plaintext",
      value: formatType(type),
    },
  };
}
