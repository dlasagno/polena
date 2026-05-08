import { describe, expect, test } from "bun:test";
import { isSupportedSourceFile } from "../index";

describe("CLI source files", () => {
  test("accepts the standard .plna extension", () => {
    expect(isSupportedSourceFile("example.plna")).toBe(true);
  });

  test("keeps accepting the longer .polena extension", () => {
    expect(isSupportedSourceFile("example.polena")).toBe(true);
  });

  test("rejects unrelated extensions", () => {
    expect(isSupportedSourceFile("example.ts")).toBe(false);
  });
});
