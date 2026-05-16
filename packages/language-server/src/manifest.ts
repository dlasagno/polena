export function isManifestUri(uri: string): boolean {
  return uri.endsWith("/polena.toml") || uri.endsWith("\\polena.toml");
}
