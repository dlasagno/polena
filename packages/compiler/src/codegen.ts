import type {
  AssignmentStatement,
  BinaryOperator,
  Block,
  Expression,
  FunctionDeclaration,
  IfExpression,
  LoopContinuation,
  Program,
  Statement,
  TopLevelDeclaration,
  VariableDeclaration,
  WhileExpression,
} from "./ast";
import { getPreludeFunction } from "./prelude";

export function generateJavaScript(program: Program): string {
  return new JavaScriptEmitter().emitProgram(program);
}

type LoopEmitContext = {
  readonly label: string;
  readonly continuation?: LoopContinuation;
  readonly breakFlagVar?: string;
  readonly resultVar?: string;
};

class JavaScriptEmitter {
  private tempCounter = 0;
  private usesIndexHelper = false;
  private usesIndexSetHelper = false;
  private usesIndexUpdateHelper = false;

  public emitProgram(program: Program): string {
    const lines: string[] = [];

    for (const declaration of program.declarations) {
      lines.push(...this.emitTopLevelDeclaration(declaration));
    }

    if (this.usesIndexHelper) {
      lines.unshift(...emitIndexHelper(), "");
    }

    if (this.usesIndexSetHelper) {
      lines.unshift(...emitIndexSetHelper(), "");
    }

    if (this.usesIndexUpdateHelper) {
      lines.unshift(...emitIndexUpdateHelper(), "");
    }

    return `${lines.join("\n")}\n`;
  }

  private emitTopLevelDeclaration(declaration: TopLevelDeclaration): string[] {
    switch (declaration.kind) {
      case "TypeDeclaration":
        return [];
      case "FunctionDeclaration":
        return this.emitFunctionDeclaration(declaration);
      case "VariableDeclaration":
        return [this.emitVariableDeclaration(declaration, "")];
      case "AssignmentStatement":
        return [this.emitAssignmentStatement(declaration, "")];
      case "BreakStatement":
      case "ContinueStatement":
        return this.emitStatement(declaration, "");
      case "ExpressionStatement":
        return this.emitExpressionStatement(declaration.expression, "");
    }
  }

  private emitFunctionDeclaration(declaration: FunctionDeclaration): string[] {
    const params = declaration.params.map((param) => param.name).join(", ");
    return [
      `function ${declaration.name}(${params}) {`,
      ...this.emitValueBlock(declaration.body, "  "),
      "}",
    ];
  }

  private emitValueBlock(block: Block, indent: string, loopContext?: LoopEmitContext): string[] {
    const lines: string[] = [];

    for (const statement of block.statements) {
      lines.push(...this.emitStatement(statement, indent, loopContext));
    }

    if (block.finalExpression !== undefined) {
      lines.push(
        `${indent}return ${this.emitExpression(block.finalExpression, indent, loopContext)};`,
      );
    }

    return lines;
  }

  private emitStatementBlock(
    block: Block,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string[] {
    const lines: string[] = [];

    for (const statement of block.statements) {
      lines.push(...this.emitStatement(statement, indent, loopContext));
    }

    if (block.finalExpression !== undefined) {
      lines.push(...this.emitExpressionStatement(block.finalExpression, indent, loopContext));
    }

    return lines;
  }

  private emitStatement(
    statement: Statement,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string[] {
    switch (statement.kind) {
      case "VariableDeclaration":
        return [this.emitVariableDeclaration(statement, indent, loopContext)];
      case "AssignmentStatement":
        return [this.emitAssignmentStatement(statement, indent, loopContext)];
      case "ReturnStatement":
        return [
          `${indent}return ${this.emitExpression(statement.expression, indent, loopContext)};`,
        ];
      case "BreakStatement":
        return this.emitBreakStatement(statement, indent, loopContext);
      case "ContinueStatement":
        return this.emitContinueStatement(indent, loopContext);
      case "ExpressionStatement":
        return this.emitExpressionStatement(statement.expression, indent, loopContext);
    }
  }

  private emitBreakStatement(
    statement: Extract<Statement, { kind: "BreakStatement" }>,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string[] {
    const lines: string[] = [];

    if (loopContext?.breakFlagVar !== undefined) {
      lines.push(`${indent}${loopContext.breakFlagVar} = true;`);
    }

    if (statement.expression !== undefined && loopContext?.resultVar !== undefined) {
      lines.unshift(
        `${indent}${loopContext.resultVar} = ${this.emitExpression(statement.expression, indent, loopContext)};`,
      );
    }

    if (loopContext !== undefined) {
      lines.push(`${indent}break ${loopContext.label};`);
      return lines;
    }

    lines.push(`${indent}break;`);
    return lines;
  }

  private emitContinueStatement(indent: string, loopContext?: LoopEmitContext): string[] {
    if (loopContext === undefined) {
      return [`${indent}continue;`];
    }

    const lines: string[] = [];
    if (loopContext.continuation !== undefined) {
      lines.push(...this.emitLoopContinuation(loopContext.continuation, indent, loopContext));
    }
    lines.push(`${indent}continue ${loopContext.label};`);
    return lines;
  }

  private emitExpressionStatement(
    expression: Expression,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string[] {
    if (expression.kind === "IfExpression") {
      return this.emitIfStatement(expression, indent, loopContext);
    }

    if (expression.kind === "WhileExpression") {
      return this.emitWhileStatement(expression, indent, loopContext);
    }

    return [`${indent}${this.emitExpression(expression, indent, loopContext)};`];
  }

  private emitVariableDeclaration(
    declaration: VariableDeclaration,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string {
    return `${indent}${declaration.mutability} ${declaration.name} = ${this.emitExpression(
      declaration.initializer,
      indent,
      loopContext,
    )};`;
  }

  private emitAssignmentStatement(
    statement: AssignmentStatement,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string {
    if (statement.target.kind === "IndexExpression" && statement.operator === "=") {
      this.usesIndexSetHelper = true;
      return `${indent}__polenaIndexSet(${this.emitExpression(
        statement.target.target,
        indent,
        loopContext,
      )}, ${this.emitExpression(statement.target.index, indent, loopContext)}, ${this.emitExpression(
        statement.value,
        indent,
        loopContext,
      )});`;
    }

    if (statement.target.kind === "IndexExpression") {
      this.usesIndexUpdateHelper = true;
      return `${indent}__polenaIndexUpdate(${this.emitExpression(
        statement.target.target,
        indent,
        loopContext,
      )}, ${this.emitExpression(statement.target.index, indent, loopContext)}, ${JSON.stringify(
        statement.operator,
      )}, ${this.emitExpression(statement.value, indent, loopContext)});`;
    }

    return `${indent}${this.emitAssignmentTarget(
      statement.target,
      indent,
      loopContext,
    )} ${statement.operator} ${this.emitExpression(statement.value, indent, loopContext)};`;
  }

  private emitAssignmentTarget(
    target: AssignmentStatement["target"],
    indent: string,
    loopContext: LoopEmitContext | undefined,
  ): string {
    switch (target.kind) {
      case "NameExpression":
        return target.name;
      case "MemberExpression":
        return `${this.emitExpression(target.target, indent, loopContext)}.${target.name}`;
      case "IndexExpression":
        this.usesIndexHelper = true;
        return `__polenaIndex(${this.emitExpression(
          target.target,
          indent,
          loopContext,
        )}, ${this.emitExpression(target.index, indent, loopContext)})`;
    }
  }

  private emitLoopContinuation(
    continuation: LoopContinuation,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string[] {
    if (continuation.kind === "AssignmentStatement") {
      return [this.emitAssignmentStatement(continuation, indent, loopContext)];
    }

    return this.emitExpressionStatement(continuation, indent, loopContext);
  }

  private emitExpression(
    expression: Expression,
    indent = "",
    loopContext?: LoopEmitContext,
  ): string {
    switch (expression.kind) {
      case "NumberLiteral":
        return expression.text;
      case "BigIntLiteral":
        return expression.text;
      case "StringLiteral":
        return this.emitStringLiteral(expression, indent, loopContext);
      case "BooleanLiteral":
        return expression.value ? "true" : "false";
      case "ArrayLiteral":
        return `[${expression.elements
          .map((element) => this.emitExpression(element, indent, loopContext))
          .join(", ")}]`;
      case "ObjectLiteral":
        return `{ ${expression.fields
          .map((field) => `${field.name}: ${this.emitExpression(field.value, indent, loopContext)}`)
          .join(", ")} }`;
      case "NameExpression":
        return expression.name;
      case "UnaryExpression":
        return `(${expression.operator}${this.emitExpression(expression.operand, indent, loopContext)})`;
      case "BinaryExpression":
        return `(${this.emitExpression(expression.left, indent, loopContext)} ${emitBinaryOperator(expression.operator)} ${this.emitExpression(expression.right, indent, loopContext)})`;
      case "IfExpression":
        return this.emitIfExpression(expression, indent, loopContext);
      case "WhileExpression":
        return this.emitWhileExpression(expression, indent, loopContext);
      case "CallExpression":
        return `${this.emitCallCallee(expression.callee, indent, loopContext)}(${expression.args
          .map((arg) => this.emitExpression(arg, indent, loopContext))
          .join(", ")})`;
      case "IndexExpression":
        this.usesIndexHelper = true;
        return `__polenaIndex(${this.emitExpression(
          expression.target,
          indent,
          loopContext,
        )}, ${this.emitExpression(expression.index, indent, loopContext)})`;
      case "MemberExpression":
        return `${this.emitExpression(expression.target, indent, loopContext)}.${expression.name}`;
    }
  }

  private emitCallCallee(
    callee: Expression,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string {
    if (callee.kind === "NameExpression") {
      return getPreludeFunction(callee.name)?.jsEmitName ?? callee.name;
    }

    return this.emitExpression(callee, indent, loopContext);
  }

  private emitIfStatement(
    expression: IfExpression,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string[] {
    const lines = [
      `${indent}if (${this.emitExpression(expression.condition, indent, loopContext)}) {`,
      ...this.emitStatementBlock(expression.thenBlock, `${indent}  `, loopContext),
    ];

    if (expression.elseBlock === undefined) {
      lines.push(`${indent}}`);
      return lines;
    }

    lines.push(
      `${indent}} else {`,
      ...this.emitStatementBlock(expression.elseBlock, `${indent}  `, loopContext),
      `${indent}}`,
    );
    return lines;
  }

  private emitIfExpression(
    expression: IfExpression,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string {
    const lines = [
      "(() => {",
      `${indent}  if (${this.emitExpression(expression.condition, indent, loopContext)}) {`,
      ...this.emitValueBlock(expression.thenBlock, `${indent}    `, loopContext),
    ];

    if (expression.elseBlock !== undefined) {
      lines.push(
        `${indent}  } else {`,
        ...this.emitValueBlock(expression.elseBlock, `${indent}    `, loopContext),
      );
    }

    lines.push(`${indent}  }`, `${indent}})()`);
    return lines.join("\n");
  }

  private emitWhileStatement(
    expression: WhileExpression,
    indent: string,
    outerLoopContext?: LoopEmitContext,
  ): string[] {
    const loopLabel = this.nextTemp("whileLoop");
    const breakFlagVar =
      expression.elseBlock === undefined ? undefined : this.nextTemp("whileDidBreak");
    const loopContext: LoopEmitContext = {
      label: loopLabel,
      ...(expression.continuation === undefined ? {} : { continuation: expression.continuation }),
      ...(breakFlagVar === undefined ? {} : { breakFlagVar }),
    };
    const lines: string[] = [];

    if (breakFlagVar !== undefined) {
      lines.push(`${indent}let ${breakFlagVar} = false;`);
    }

    lines.push(
      `${indent}${loopLabel}: while (${this.emitExpression(expression.condition, indent, outerLoopContext)}) {`,
      ...this.emitStatementBlock(expression.body, `${indent}  `, loopContext),
    );

    if (expression.continuation !== undefined) {
      lines.push(...this.emitLoopContinuation(expression.continuation, `${indent}  `, loopContext));
    }

    lines.push(`${indent}}`);

    if (expression.elseBlock !== undefined && breakFlagVar !== undefined) {
      lines.push(
        `${indent}if (!${breakFlagVar}) {`,
        ...this.emitStatementBlock(expression.elseBlock, `${indent}  `, outerLoopContext),
        `${indent}}`,
      );
    }

    return lines;
  }

  private emitWhileExpression(
    expression: WhileExpression,
    indent: string,
    outerLoopContext?: LoopEmitContext,
  ): string {
    const loopLabel = this.nextTemp("whileLoop");
    const resultVar = this.nextTemp("whileResult");
    const breakFlagVar = this.nextTemp("whileDidBreak");
    const loopContext: LoopEmitContext = {
      label: loopLabel,
      resultVar,
      breakFlagVar,
      ...(expression.continuation === undefined ? {} : { continuation: expression.continuation }),
    };
    const lines = [
      "(() => {",
      `${indent}  let ${resultVar};`,
      `${indent}  let ${breakFlagVar} = false;`,
      `${indent}  ${loopLabel}: while (${this.emitExpression(expression.condition, `${indent}  `, outerLoopContext)}) {`,
      ...this.emitStatementBlock(expression.body, `${indent}    `, loopContext),
    ];

    if (expression.continuation !== undefined) {
      lines.push(
        ...this.emitLoopContinuation(expression.continuation, `${indent}    `, loopContext),
      );
    }

    lines.push(`${indent}  }`);

    if (expression.elseBlock !== undefined) {
      lines.push(
        `${indent}  if (!${breakFlagVar}) {`,
        ...this.emitValueBlock(expression.elseBlock, `${indent}    `, outerLoopContext),
        `${indent}  }`,
      );
    }

    lines.push(`${indent}  return ${resultVar};`, `${indent}})()`);
    return lines.join("\n");
  }

  private nextTemp(prefix: string): string {
    const id = this.tempCounter;
    this.tempCounter += 1;
    return `__${prefix}${id}`;
  }

  private emitStringLiteral(
    expression: Extract<Expression, { kind: "StringLiteral" }>,
    indent: string,
    loopContext?: LoopEmitContext,
  ): string {
    if (expression.parts.every((part) => part.kind === "StringText")) {
      return JSON.stringify(expression.parts.map((part) => part.value).join(""));
    }

    return `\`${expression.parts
      .map((part) =>
        part.kind === "StringText"
          ? escapeTemplateText(part.value)
          : `\${${this.emitExpression(part.expression, indent, loopContext)}}`,
      )
      .join("")}\``;
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

function emitIndexHelper(): string[] {
  return [
    "function __polenaIndex(array, index) {",
    "  if (!Number.isInteger(index) || index < 0 || index >= array.length) {",
    '    throw new RangeError("array index out of bounds");',
    "  }",
    "",
    "  return array[index];",
    "}",
  ];
}

function emitIndexSetHelper(): string[] {
  return [
    "function __polenaIndexSet(array, index, value) {",
    "  if (!Number.isInteger(index) || index < 0 || index >= array.length) {",
    '    throw new RangeError("array index out of bounds");',
    "  }",
    "",
    "  array[index] = value;",
    "}",
  ];
}

function emitIndexUpdateHelper(): string[] {
  return [
    "function __polenaIndexUpdate(array, index, operator, value) {",
    "  if (!Number.isInteger(index) || index < 0 || index >= array.length) {",
    '    throw new RangeError("array index out of bounds");',
    "  }",
    "",
    "  switch (operator) {",
    '    case "+=":',
    "      array[index] += value;",
    "      return;",
    '    case "-=":',
    "      array[index] -= value;",
    "      return;",
    '    case "*=":',
    "      array[index] *= value;",
    "      return;",
    '    case "/=":',
    "      array[index] /= value;",
    "      return;",
    '    case "%=":',
    "      array[index] %= value;",
    "      return;",
    "  }",
    "}",
  ];
}

function escapeTemplateText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}
