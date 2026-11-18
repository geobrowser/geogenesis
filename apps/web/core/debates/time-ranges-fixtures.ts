/**
 * jsdom's media elements report an empty `buffered`. One stand-in for every suite that needs a
 * recording to hold something, rather than a copy per file: a single range, as a browser reports a
 * contiguous buffer.
 */
export function timeRanges(start: number, end: number): TimeRanges {
  return { length: 1, start: () => start, end: () => end };
}
