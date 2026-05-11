import type { Span } from "./span";
import type { Type } from "./types";

export type SymbolInfo = {
  readonly name: string;
  readonly type: Type;
  readonly span: Span;
  readonly assignability: "mutable-variable" | "immutable-binding";
};

export class Scope {
  private readonly symbols = new Map<string, SymbolInfo>();

  public constructor(private readonly parent?: Scope) {}

  public declare(symbol: SymbolInfo): boolean {
    if (this.symbols.has(symbol.name)) {
      return false;
    }

    this.symbols.set(symbol.name, symbol);
    return true;
  }

  public lookup(name: string): SymbolInfo | undefined {
    return this.symbols.get(name) ?? this.parent?.lookup(name);
  }
}
