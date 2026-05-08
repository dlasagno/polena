import type {
  BinaryOperator,
  Block,
  Expression,
  FunctionDeclaration,
  IfExpression,
  Program,
  Statement,
  TopLevelDeclaration,
  VariableDeclaration,
} from "./ast";

export function generateJavaScript(program: Program): string {
  const lines: string[] = [];

  for (const declaration of program.declarations) {
    lines.push(...emitTopLevelDeclaration(declaration));
  }

  return `${lines.join("\n")}\n`;
}

function emitTopLevelDeclaration(declaration: TopLevelDeclaration): string[] {
  switch (declaration.kind) {
    case "FunctionDeclaration":
      return emitFunctionDeclaration(declaration);
    case "VariableDeclaration":
      return [emitVariableDeclaration(declaration, "")];
    case "ExpressionStatement":
      return emitExpressionStatement(declaration.expression, "");
  }
}

function emitFunctionDeclaration(declaration: FunctionDeclaration): string[] {
  const params = declaration.params.map((param) => param.name).join(", ");
  return [`function ${declaration.name}(${params}) {`, ...emitBlock(declaration.body, "  "), "}"];
}

function emitBlock(block: Block, indent: string): string[] {
  const lines: string[] = [];

  for (const statement of block.statements) {
    lines.push(...emitStatement(statement, indent));
  }

  if (block.finalExpression !== undefined) {
    lines.push(`${indent}return ${emitExpression(block.finalExpression, indent)};`);
  }

  return lines;
}

function emitStatement(statement: Statement, indent: string): string[] {
  switch (statement.kind) {
    case "VariableDeclaration":
      return [emitVariableDeclaration(statement, indent)];
    case "ReturnStatement":
      return [`${indent}return ${emitExpression(statement.expression, indent)};`];
    case "ExpressionStatement":
      return emitExpressionStatement(statement.expression, indent);
  }
}

function emitExpressionStatement(expression: Expression, indent: string): string[] {
  if (expression.kind === "IfExpression") {
    return emitIfStatement(expression, indent);
  }

  return [`${indent}${emitExpression(expression, indent)};`];
}

function emitVariableDeclaration(declaration: VariableDeclaration, indent: string): string {
  return `${indent}${declaration.mutability} ${declaration.name} = ${emitExpression(
    declaration.initializer,
    indent,
  )};`;
}

function emitExpression(expression: Expression, indent = ""): string {
  switch (expression.kind) {
    case "NumberLiteral":
      return expression.text;
    case "StringLiteral":
      return JSON.stringify(expression.value);
    case "BooleanLiteral":
      return expression.value ? "true" : "false";
    case "NameExpression":
      return expression.name;
    case "UnaryExpression":
      return `(${expression.operator}${emitExpression(expression.operand, indent)})`;
    case "BinaryExpression":
      return `(${emitExpression(expression.left, indent)} ${emitBinaryOperator(expression.operator)} ${emitExpression(
        expression.right,
        indent,
      )})`;
    case "IfExpression":
      return emitIfExpression(expression, indent);
    case "CallExpression":
      return `${emitExpression(expression.callee, indent)}(${expression.args
        .map((arg) => emitExpression(arg, indent))
        .join(", ")})`;
  }
}

function emitIfStatement(expression: IfExpression, indent: string): string[] {
  const lines = [
    `${indent}if (${emitExpression(expression.condition, indent)}) {`,
    ...emitBlock(expression.thenBlock, `${indent}  `),
  ];

  if (expression.elseBlock === undefined) {
    lines.push(`${indent}}`);
    return lines;
  }

  lines.push(`${indent}} else {`, ...emitBlock(expression.elseBlock, `${indent}  `), `${indent}}`);
  return lines;
}

function emitIfExpression(expression: IfExpression, indent: string): string {
  const lines = [
    "(() => {",
    `${indent}  if (${emitExpression(expression.condition, indent)}) {`,
    ...emitBlock(expression.thenBlock, `${indent}    `),
  ];

  if (expression.elseBlock !== undefined) {
    lines.push(`${indent}  } else {`, ...emitBlock(expression.elseBlock, `${indent}    `));
  }

  lines.push(`${indent}  }`, `${indent}})()`);
  return lines.join("\n");
}

function emitBinaryOperator(operator: BinaryOperator): string {
  switch (operator) {
    case "and":
      return "&&";
    case "or":
      return "||";
    case "==":
      return "===";
    case "!=":
      return "!==";
    default:
      return operator;
  }
}
