import arraySource from "./array.plna" with { type: "text" };
import mapSource from "./collections/map.plna" with { type: "text" };
import setSource from "./collections/set.plna" with { type: "text" };
import coreSource from "./core.plna" with { type: "text" };
import ioSource from "./io.plna" with { type: "text" };
import mathSource from "./math.plna" with { type: "text" };
import optionSource from "./option.plna" with { type: "text" };
import parseSource from "./parse.plna" with { type: "text" };
import resultSource from "./result.plna" with { type: "text" };
import stringSource from "./string.plna" with { type: "text" };
import {
  stdlibModuleSourcePaths,
  stdlibVirtualPath,
  type StdlibModuleSourcePath,
} from "./manifest";

export type StdlibSourceFile = {
  readonly path: string;
  readonly source: string;
};

const sourcesByPath: Record<StdlibModuleSourcePath, string> = {
  "array.plna": arraySource,
  "collections/map.plna": mapSource,
  "collections/set.plna": setSource,
  "core.plna": coreSource,
  "io.plna": ioSource,
  "math.plna": mathSource,
  "option.plna": optionSource,
  "parse.plna": parseSource,
  "result.plna": resultSource,
  "string.plna": stringSource,
};

export const stdlibSources: readonly StdlibSourceFile[] = stdlibModuleSourcePaths.map((path) => ({
  path: stdlibVirtualPath(path),
  source: sourcesByPath[path],
}));
