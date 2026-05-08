import type {
  BinaryOperator,
  Block,
  Expression,
  FunctionDeclaration,
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
      return [`${emitExpression(declaration.expression)};`];
  }
}

function emitFunctionDeclaration(declaration: FunctionDeclaration): string[] {
  const params = declaration.params.map((param) => param.name).join(", ");
  return [`function ${declaration.name}(${params}) {`, ...emitBlock(declaration.body), "}"];
}

function emitBlock(block: Block): string[] {
  const lines: string[] = [];

  for (const statement of block.statements) {
    lines.push(emitStatement(statement, "  "));
  }

  if (block.finalExpression !== undefined) {
    lines.push(`  return ${emitExpression(block.finalExpression)};`);
  }

  return lines;
}

function emitStatement(statement: Statement, indent: string): string {
  switch (statement.kind) {
    case "VariableDeclaration":
      return emitVariableDeclaration(statement, indent);
    case "ReturnStatement":
      return `${indent}return ${emitExpression(statement.expression)};`;
    case "ExpressionStatement":
      return `${indent}${emitExpression(statement.expression)};`;
  }
}

function emitVariableDeclaration(declaration: VariableDeclaration, indent: string): string {
  return `${indent}${declaration.mutability} ${declaration.name} = ${emitExpression(
    declaration.initializer,
  )};`;
}

function emitExpression(expression: Expression): string {
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
      return `(${expression.operator}${emitExpression(expression.operand)})`;
    case "BinaryExpression":
      return `(${emitExpression(expression.left)} ${emitBinaryOperator(expression.operator)} ${emitExpression(
        expression.right,
      )})`;
    case "CallExpression":
      return `${emitExpression(expression.callee)}(${expression.args.map(emitExpression).join(", ")})`;
  }
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
