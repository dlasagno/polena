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

export type StdlibSourceFile = {
  readonly path: string;
  readonly source: string;
};

export const stdlibSources: readonly StdlibSourceFile[] = [
  { path: "<std>/core.plna", source: coreSource },
  { path: "<std>/io.plna", source: ioSource },
  { path: "<std>/option.plna", source: optionSource },
  { path: "<std>/result.plna", source: resultSource },
  { path: "<std>/parse.plna", source: parseSource },
  { path: "<std>/math.plna", source: mathSource },
  { path: "<std>/string.plna", source: stringSource },
  { path: "<std>/array.plna", source: arraySource },
  { path: "<std>/collections/map.plna", source: mapSource },
  { path: "<std>/collections/set.plna", source: setSource },
];
