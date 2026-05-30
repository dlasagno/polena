import { expect } from "bun:test";
import type { CompileResult } from "../compiler";
import { compile } from "../compiler";

export const coreTypes = `
type Option<T> = enum {
  Some(T),
  None,
};

type Result<T, E> = enum {
  Ok(T),
  Err(E),
};
`;

export function expectCompileOk(source: string): Extract<CompileResult, { ok: true }> {
  const result = compile(source);

  if (!result.ok) {
    throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  return result;
}

export function executeValue(js: string): unknown {
  const execute = new Function(`${js}\nreturn value;`) as () => unknown;
  return execute();
}

export function expectPanic(js: string, message: string): void {
  let thrown: unknown;
  try {
    executeValue(js);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).name).toBe("PolenaPanic");
  expect((thrown as Error).message).toBe(message);
}
