import type { Span } from "./span";

export type NodeId = number;

export type PrimitiveType = "number" | "bigint" | "string" | "boolean" | "void";

export type TypeNode =
  | {
      readonly kind: "PrimitiveType";
      readonly nodeId: NodeId;
      readonly name: PrimitiveType;
      readonly span: Span;
    }
  | {
      readonly kind: "ArrayType";
      readonly nodeId: NodeId;
      readonly element: TypeNode;
      readonly span: Span;
    }
  | {
      readonly kind: "NamedType";
      readonly nodeId: NodeId;
      readonly name: string;
      readonly nameSpan: Span;
      readonly span: Span;
    }
  | {
      readonly kind: "ObjectType";
      readonly nodeId: NodeId;
      readonly fields: readonly ObjectTypeField[];
      readonly span: Span;
    }
  | {
      readonly kind: "EnumType";
      readonly nodeId: NodeId;
      readonly variants: readonly EnumVariantTypeNode[];
      readonly span: Span;
    }
  | {
      readonly kind: "UnknownType";
      readonly nodeId: NodeId;
      readonly span: Span;
    };

export type ObjectTypeField = {
  readonly kind: "ObjectTypeField";
  readonly nodeId: NodeId;
  readonly name: string;
  readonly nameSpan: Span;
  readonly type: TypeNode;
  readonly span: Span;
};

export type EnumVariantTypeNode = {
  readonly kind: "EnumVariantType";
  readonly nodeId: NodeId;
  readonly name: string;
  readonly nameSpan: Span;
  readonly payload: readonly TypeNode[];
  readonly span: Span;
};

export type Program = {
  readonly kind: "Program";
  readonly nodeId: NodeId;
  readonly declarations: readonly TopLevelDeclaration[];
  readonly span: Span;
};

export type TopLevelDeclaration =
  | FunctionDeclaration
  | TypeDeclaration
  | VariableDeclaration
  | AssignmentStatement
  | BreakStatement
  | ContinueStatement
  | ExpressionStatement;

export type TypeDeclaration = {
  readonly kind: "TypeDeclaration";
  readonly nodeId: NodeId;
  readonly name: string;
  readonly nameSpan: Span;
  readonly value: TypeNode;
  readonly span: Span;
};

export type FunctionDeclaration = {
  readonly kind: "FunctionDeclaration";
  readonly nodeId: NodeId;
  readonly name: string;
  readonly nameSpan: Span;
  readonly params: readonly Parameter[];
  readonly returnType: TypeNode;
  readonly body: Block;
  readonly span: Span;
};

export type Parameter = {
  readonly kind: "Parameter";
  readonly nodeId: NodeId;
  readonly name: string;
  readonly nameSpan: Span;
  readonly type: TypeNode;
  readonly span: Span;
};

export type Block = {
  readonly kind: "Block";
  readonly nodeId: NodeId;
  readonly statements: readonly Statement[];
  readonly finalExpression?: Expression;
  readonly span: Span;
  readonly isMissing?: boolean;
};

export type Statement =
  | VariableDeclaration
  | AssignmentStatement
  | ReturnStatement
  | BreakStatement
  | ContinueStatement
  | ExpressionStatement;

export type VariableDeclaration = {
  readonly kind: "VariableDeclaration";
  readonly nodeId: NodeId;
  readonly mutability: "const" | "let";
  readonly name: string;
  readonly nameSpan: Span;
  readonly typeAnnotation?: TypeNode;
  readonly initializer: Expression;
  readonly span: Span;
};

export type ReturnStatement = {
  readonly kind: "ReturnStatement";
  readonly nodeId: NodeId;
  readonly expression: Expression;
  readonly span: Span;
};

export type BreakStatement = {
  readonly kind: "BreakStatement";
  readonly nodeId: NodeId;
  readonly expression?: Expression;
  readonly span: Span;
};

export type ContinueStatement = {
  readonly kind: "ContinueStatement";
  readonly nodeId: NodeId;
  readonly span: Span;
};

export type AssignmentOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%=";

export type AssignmentStatement = {
  readonly kind: "AssignmentStatement";
  readonly nodeId: NodeId;
  readonly operator: AssignmentOperator;
  readonly target: AssignmentTarget;
  readonly value: Expression;
  readonly span: Span;
};

export type AssignmentTarget = NameExpression | MemberExpression | IndexExpression;

export type ExpressionStatement = {
  readonly kind: "ExpressionStatement";
  readonly nodeId: NodeId;
  readonly expression: Expression;
  readonly span: Span;
};

export type Expression =
  | LiteralExpression
  | ArrayLiteralExpression
  | ObjectLiteralExpression
  | NameExpression
  | UnaryExpression
  | BinaryExpression
  | IfExpression
  | WhileExpression
  | MatchExpression
  | CallExpression
  | IndexExpression
  | MemberExpression
  | EnumVariantExpression;

export type LiteralExpression =
  | {
      readonly kind: "NumberLiteral";
      readonly nodeId: NodeId;
      readonly value: number;
      readonly text: string;
      readonly span: Span;
    }
  | {
      readonly kind: "BigIntLiteral";
      readonly nodeId: NodeId;
      readonly text: string;
      readonly span: Span;
    }
  | {
      readonly kind: "StringLiteral";
      readonly nodeId: NodeId;
      readonly parts: readonly StringPart[];
      readonly span: Span;
    }
  | {
      readonly kind: "BooleanLiteral";
      readonly nodeId: NodeId;
      readonly value: boolean;
      readonly span: Span;
    };

export type StringPart =
  | {
      readonly kind: "StringText";
      readonly value: string;
    }
  | {
      readonly kind: "StringInterpolation";
      readonly expression: Expression;
    };

export type NameExpression = {
  readonly kind: "NameExpression";
  readonly nodeId: NodeId;
  readonly name: string;
  readonly span: Span;
};

export type ArrayLiteralExpression = {
  readonly kind: "ArrayLiteral";
  readonly nodeId: NodeId;
  readonly elements: readonly Expression[];
  readonly span: Span;
};

export type ObjectLiteralExpression = {
  readonly kind: "ObjectLiteral";
  readonly nodeId: NodeId;
  readonly fields: readonly ObjectLiteralField[];
  readonly span: Span;
};

export type ObjectLiteralField = {
  readonly kind: "ObjectLiteralField";
  readonly nodeId: NodeId;
  readonly name: string;
  readonly nameSpan: Span;
  readonly value: Expression;
  readonly span: Span;
};

export type UnaryOperator = "!" | "-";

export type UnaryExpression = {
  readonly kind: "UnaryExpression";
  readonly nodeId: NodeId;
  readonly operator: UnaryOperator;
  readonly operand: Expression;
  readonly span: Span;
};

export type BinaryOperator =
  | "+"
  | "++"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "and"
  | "or";

export type BinaryExpression = {
  readonly kind: "BinaryExpression";
  readonly nodeId: NodeId;
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
  readonly span: Span;
};

export type IfExpression = {
  readonly kind: "IfExpression";
  readonly nodeId: NodeId;
  readonly condition: Expression;
  readonly thenBlock: Block;
  readonly elseBlock?: Block;
  readonly span: Span;
};

export type LoopContinuation = Expression | AssignmentStatement;

export type WhileExpression = {
  readonly kind: "WhileExpression";
  readonly nodeId: NodeId;
  readonly condition: Expression;
  readonly continuation?: LoopContinuation;
  readonly body: Block;
  readonly elseBlock?: Block;
  readonly span: Span;
};

export type MatchExpression = {
  readonly kind: "MatchExpression";
  readonly nodeId: NodeId;
  readonly scrutinee: Expression;
  readonly arms: readonly MatchArm[];
  readonly span: Span;
};

export type MatchArm = {
  readonly kind: "MatchArm";
  readonly nodeId: NodeId;
  readonly pattern: MatchPattern;
  readonly body: Expression;
  readonly span: Span;
};

export type MatchPattern =
  | {
      readonly kind: "EnumVariantPattern";
      readonly nodeId: NodeId;
      readonly enumName?: string;
      readonly enumNameSpan?: Span;
      readonly variantName: string;
      readonly variantNameSpan: Span;
      readonly payload?: readonly EnumPayloadPattern[];
      readonly payloadSpan?: Span;
      readonly resolvedEnumName?: string;
      readonly span: Span;
    }
  | {
      readonly kind: "WildcardPattern";
      readonly nodeId: NodeId;
      readonly span: Span;
    };

export type EnumPayloadPattern =
  | {
      readonly kind: "BindingPattern";
      readonly nodeId: NodeId;
      readonly name: string;
      readonly nameSpan: Span;
      readonly span: Span;
    }
  | {
      readonly kind: "WildcardPattern";
      readonly nodeId: NodeId;
      readonly span: Span;
    };

export type CallExpression = {
  readonly kind: "CallExpression";
  readonly nodeId: NodeId;
  readonly callee: Expression;
  readonly args: readonly Expression[];
  readonly span: Span;
};

export type IndexExpression = {
  readonly kind: "IndexExpression";
  readonly nodeId: NodeId;
  readonly target: Expression;
  readonly index: Expression;
  readonly span: Span;
};

export type MemberExpression = {
  readonly kind: "MemberExpression";
  readonly nodeId: NodeId;
  readonly target: Expression;
  readonly name: string;
  readonly nameSpan: Span;
  readonly span: Span;
};

export type EnumVariantExpression = {
  readonly kind: "EnumVariantExpression";
  readonly nodeId: NodeId;
  readonly enumName?: string;
  readonly enumNameSpan?: Span;
  readonly variantName: string;
  readonly variantNameSpan: Span;
  readonly resolvedEnumName?: string;
  readonly span: Span;
};
