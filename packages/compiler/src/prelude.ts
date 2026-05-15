import type { PrimitiveType } from "./ast";

export type PreludeFunction = {
  readonly name: string;
  readonly params: readonly PrimitiveType[];
  readonly returnType: PrimitiveType;
  readonly jsEmitName: string;
};

export type PreludeEnumType = {
  readonly name: string;
  readonly typeParameters: readonly string[];
  readonly variants: readonly PreludeEnumVariant[];
};

export type PreludeEnumVariant = {
  readonly name: string;
  readonly payload: readonly string[];
};

export const preludeFunctions: readonly PreludeFunction[] = [
  {
    name: "println",
    params: ["string"],
    returnType: "void",
    jsEmitName: "console.log",
  },
];

export const preludeEnumTypes: readonly PreludeEnumType[] = [
  {
    name: "Option",
    typeParameters: ["T"],
    variants: [
      { name: "Some", payload: ["T"] },
      { name: "None", payload: [] },
    ],
  },
  {
    name: "Result",
    typeParameters: ["T", "E"],
    variants: [
      { name: "Ok", payload: ["T"] },
      { name: "Err", payload: ["E"] },
    ],
  },
];

export function getPreludeFunction(name: string): PreludeFunction | undefined {
  return preludeFunctions.find((fn) => fn.name === name);
}
