export const stdlibModuleSourcePaths = [
  "core.plna",
  "io.plna",
  "option.plna",
  "result.plna",
  "parse.plna",
  "math.plna",
  "string.plna",
  "array.plna",
  "collections/map.plna",
  "collections/set.plna",
] as const;

// Package documentation entry point, not an importable @std module.
export const stdlibNonModuleSourcePaths = ["index.plna"] as const;

export type StdlibModuleSourcePath = (typeof stdlibModuleSourcePaths)[number];

export function stdlibVirtualPath(path: StdlibModuleSourcePath): string {
  return `<std>/${path}`;
}
