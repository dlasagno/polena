import type { NodeId } from "./ast";
import type { Span } from "./span";
import type { Type } from "./types";

export type DefinitionKind =
  | "Local"
  | "Function"
  | "Prelude"
  | "TypeAlias"
  | "EnumVariant"
  | "Field";

export type Definition = {
  readonly kind: DefinitionKind;
  readonly nodeId: NodeId;
  readonly name: string;
  readonly nameSpan: Span;
  readonly fullSpan: Span;
};

export type ReferenceTarget =
  | {
      readonly kind: "Local";
      readonly name: string;
      readonly definitionNodeId: NodeId;
      readonly nameSpan: Span;
      readonly fullSpan: Span;
    }
  | {
      readonly kind: "Function";
      readonly name: string;
      readonly definitionNodeId: NodeId;
      readonly nameSpan: Span;
      readonly fullSpan: Span;
    }
  | {
      readonly kind: "Prelude";
      readonly name: string;
    }
  | {
      readonly kind: "TypeAlias";
      readonly name: string;
      readonly definitionNodeId: NodeId;
      readonly nameSpan: Span;
      readonly fullSpan: Span;
    }
  | {
      readonly kind: "EnumVariant";
      readonly enumName: string;
      readonly variantName: string;
      readonly definitionNodeId: NodeId;
      readonly nameSpan: Span;
      readonly fullSpan: Span;
    }
  | {
      readonly kind: "Field";
      readonly name: string;
      readonly definitionNodeId: NodeId;
      readonly nameSpan: Span;
      readonly fullSpan: Span;
    };

export type Semantics = {
  readonly expressionTypes: Map<NodeId, Type>;
  readonly references: Map<NodeId, ReferenceTarget>;
  readonly definitions: Definition[];
};

export function emptySemantics(): Semantics {
  return {
    expressionTypes: new Map(),
    references: new Map(),
    definitions: [],
  };
}
