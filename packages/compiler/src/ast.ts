import type { Span } from "./span";

export type PrimitiveType = "number" | "bigint" | "string" | "boolean" | "void";

export type TypeNode =
  | {
      readonly kind: "PrimitiveType";
      readonly name: PrimitiveType;
      readonly span: Span;
    }
  | {
      readonly kind: "ArrayType";
      readonly element: TypeNode;
      readonly span: Span;
    }
  | {
      readonly kind: "UnknownType";
      readonly span: Span;
    };

export type Program = {
  readonly kind: "Program";
  readonly declarations: readonly TopLevelDeclaration[];
  readonly span: Span;
};

export type TopLevelDeclaration =
  | FunctionDeclaration
  | VariableDeclaration
  | AssignmentStatement
  | BreakStatement
  | ContinueStatement
  | ExpressionStatement;

export type FunctionDeclaration = {
  readonly kind: "FunctionDeclaration";
  readonly name: string;
  readonly nameSpan: Span;
  readonly params: readonly Parameter[];
  readonly returnType: TypeNode;
  readonly body: Block;
  readonly span: Span;
};

export type Parameter = {
  readonly kind: "Parameter";
  readonly name: string;
  readonly nameSpan: Span;
  readonly type: TypeNode;
  readonly span: Span;
};

export type Block = {
  readonly kind: "Block";
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
  readonly mutability: "const" | "let";
  readonly name: string;
  readonly nameSpan: Span;
  readonly typeAnnotation?: TypeNode;
  readonly initializer: Expression;
  readonly span: Span;
};

export type ReturnStatement = {
  readonly kind: "ReturnStatement";
  readonly expression: Expression;
  readonly span: Span;
};

export type BreakStatement = {
  readonly kind: "BreakStatement";
  readonly expression?: Expression;
  readonly span: Span;
};

export type ContinueStatement = {
  readonly kind: "ContinueStatement";
  readonly span: Span;
};

export type AssignmentOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%=";

export type AssignmentStatement = {
  readonly kind: "AssignmentStatement";
  readonly operator: AssignmentOperator;
  readonly name: string;
  readonly nameSpan: Span;
  readonly value: Expression;
  readonly span: Span;
};

export type ExpressionStatement = {
  readonly kind: "ExpressionStatement";
  readonly expression: Expression;
  readonly span: Span;
};

export type Expression =
  | LiteralExpression
  | ArrayLiteralExpression
  | NameExpression
  | UnaryExpression
  | BinaryExpression
  | IfExpression
  | WhileExpression
  | CallExpression
  | IndexExpression
  | MemberExpression;

export type LiteralExpression =
  | {
      readonly kind: "NumberLiteral";
      readonly value: number;
      readonly text: string;
      readonly span: Span;
    }
  | {
      readonly kind: "BigIntLiteral";
      readonly text: string;
      readonly span: Span;
    }
  | {
      readonly kind: "StringLiteral";
      readonly parts: readonly StringPart[];
      readonly span: Span;
    }
  | {
      readonly kind: "BooleanLiteral";
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
  readonly name: string;
  readonly span: Span;
};

export type ArrayLiteralExpression = {
  readonly kind: "ArrayLiteral";
  readonly elements: readonly Expression[];
  readonly span: Span;
};

export type UnaryOperator = "!" | "-";

export type UnaryExpression = {
  readonly kind: "UnaryExpression";
  readonly operator: UnaryOperator;
  readonly operand: Expression;
  readonly span: Span;
};

export type BinaryOperator =
  | "+"
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
  readonly operator: BinaryOperator;
  readonly left: Expression;
  readonly right: Expression;
  readonly span: Span;
};

export type IfExpression = {
  readonly kind: "IfExpression";
  readonly condition: Expression;
  readonly thenBlock: Block;
  readonly elseBlock?: Block;
  readonly span: Span;
};

export type LoopContinuation = Expression | AssignmentStatement;

export type WhileExpression = {
  readonly kind: "WhileExpression";
  readonly condition: Expression;
  readonly continuation?: LoopContinuation;
  readonly body: Block;
  readonly elseBlock?: Block;
  readonly span: Span;
};

export type CallExpression = {
  readonly kind: "CallExpression";
  readonly callee: Expression;
  readonly args: readonly Expression[];
  readonly span: Span;
};

export type IndexExpression = {
  readonly kind: "IndexExpression";
  readonly target: Expression;
  readonly index: Expression;
  readonly span: Span;
};

export type MemberExpression = {
  readonly kind: "MemberExpression";
  readonly target: Expression;
  readonly name: string;
  readonly nameSpan: Span;
  readonly span: Span;
};
