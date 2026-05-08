import type { Span } from "./span";

export type PrimitiveType = "number" | "string" | "boolean" | "void";

export type TypeNode = {
  readonly kind: "PrimitiveType";
  readonly name: PrimitiveType;
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
};

export type Statement =
  | VariableDeclaration
  | AssignmentStatement
  | ReturnStatement
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

export type AssignmentStatement = {
  readonly kind: "AssignmentStatement";
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
  | NameExpression
  | UnaryExpression
  | BinaryExpression
  | IfExpression
  | CallExpression;

export type LiteralExpression =
  | {
      readonly kind: "NumberLiteral";
      readonly value: number;
      readonly text: string;
      readonly span: Span;
    }
  | {
      readonly kind: "StringLiteral";
      readonly value: string;
      readonly text: string;
      readonly span: Span;
    }
  | {
      readonly kind: "BooleanLiteral";
      readonly value: boolean;
      readonly span: Span;
    };

export type NameExpression = {
  readonly kind: "NameExpression";
  readonly name: string;
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

export type CallExpression = {
  readonly kind: "CallExpression";
  readonly callee: Expression;
  readonly args: readonly Expression[];
  readonly span: Span;
};
