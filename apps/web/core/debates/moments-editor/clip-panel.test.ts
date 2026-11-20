import { describe, expect, it } from 'vitest';

import { edgeListenSpan } from './clip-panel';

describe('edgeListenSpan', () => {
  const span = { start_ms: 10_000, end_ms: 18_000 };

  it('plays the first 3 s for the start, and the last 3 s up to the clip’s end for the end', () => {
    expect(edgeListenSpan(span, 'start')).toEqual({ start_ms: 10_000, end_ms: 13_000 });
    expect(edgeListenSpan(span, 'end')).toEqual({ start_ms: 15_000, end_ms: 18_000 });
  });

  it('plays all of a clip shorter than 3 s, never outside it', () => {
    const short = { start_ms: 10_000, end_ms: 11_500 };
    expect(edgeListenSpan(short, 'start')).toEqual(short);
    expect(edgeListenSpan(short, 'end')).toEqual(short);
  });
});
