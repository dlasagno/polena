export type SourceLocation = {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
};

export type Span = {
  readonly start: SourceLocation;
  readonly end: SourceLocation;
};

export function makeLocation(offset: number, line: number, column: number): SourceLocation {
  return { offset, line, column };
}

export function spanFrom(start: SourceLocation, end: SourceLocation): Span {
  return { start, end };
}

export function mergeSpans(start: Span, end: Span): Span {
  return { start: start.start, end: end.end };
}
