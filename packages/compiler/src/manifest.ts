export type PackageManifest = {
  readonly name: string;
  readonly version: string;
  readonly target: "executable" | "library";
};
