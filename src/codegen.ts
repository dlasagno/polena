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

  public emitProgram(program: Program): string {
    const lines: string[] = [];

    for (const declaration of program.declarations) {
      lines.push(...this.emitTopLevelDeclaration(declaration));
    }

    return `${lines.join("\n")}\n`;
  }

  private emitTopLevelDeclaration(declaration: TopLevelDeclaration): string[] {
    switch (declaration.kind) {
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
    return `${indent}${statement.name} ${statement.operator} ${this.emitExpression(
      statement.value,
      indent,
      loopContext,
    )};`;
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
      case "StringLiteral":
        return JSON.stringify(expression.value);
      case "BooleanLiteral":
        return expression.value ? "true" : "false";
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
        return `${this.emitExpression(expression.callee, indent, loopContext)}(${expression.args
          .map((arg) => this.emitExpression(arg, indent, loopContext))
          .join(", ")})`;
    }
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
