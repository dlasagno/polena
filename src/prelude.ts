import type { PrimitiveType } from "./ast";

export type PreludeFunction = {
  readonly name: string;
  readonly params: readonly PrimitiveType[];
  readonly returnType: PrimitiveType;
  readonly jsEmitName: string;
};

export const preludeFunctions: readonly PreludeFunction[] = [
  {
    name: "println",
    params: ["string"],
    returnType: "void",
    jsEmitName: "console.log",
  },
];

export function getPreludeFunction(name: string): PreludeFunction | undefined {
  return preludeFunctions.find((fn) => fn.name === name);
}
