import { describe, expect, it } from 'vitest';

import { TEASER_LEAD_IN_SECONDS, TEASER_WINDOW_SECONDS, roundCount, stakesLine, teaserWindows } from './debate-stage';
import type { TurnSpan } from './playback-utils';

const spans: TurnSpan[] = [
  { index: 0, slot: 1, startSeconds: 0, endSeconds: 60 },
  { index: 1, slot: 2, startSeconds: 60, endSeconds: 118 },
  { index: 2, slot: 1, startSeconds: 118, endSeconds: 150 },
  { index: 3, slot: 2, startSeconds: 150, endSeconds: 180 },
];

describe('teaserWindows', () => {
  it('loops each debater talking: the opening of their own first turn, in their recording’s time', () => {
    const windows = teaserWindows(spans, { slot1: 0, slot2: 0 });
    expect(windows[1]).toEqual({
      startSeconds: TEASER_LEAD_IN_SECONDS,
      endSeconds: TEASER_LEAD_IN_SECONDS + TEASER_WINDOW_SECONDS,
    });
    expect(windows[2]).toEqual({
      startSeconds: 60 + TEASER_LEAD_IN_SECONDS,
      endSeconds: 60 + TEASER_LEAD_IN_SECONDS + TEASER_WINDOW_SECONDS,
    });
  });

  it('maps debate time into each recording by its offset', () => {
    const windows = teaserWindows(spans, { slot1: -3, slot2: -4.5 });
    // A recording that started 3s before the debate is 3s further along at the same debate moment.
    expect(windows[1].startSeconds).toBe(TEASER_LEAD_IN_SECONDS + 3);
    expect(windows[2].startSeconds).toBe(60 + TEASER_LEAD_IN_SECONDS + 4.5);
  });

  it('keeps a short turn whole rather than leading into it past its end', () => {
    const windows = teaserWindows([{ index: 0, slot: 1, startSeconds: 10, endSeconds: 14 }], { slot1: 0, slot2: 0 });
    expect(windows[1]).toEqual({ startSeconds: 10, endSeconds: 14 });
  });

  it('falls back to the top of a recording for a debater with no turn on the timeline', () => {
    const windows = teaserWindows([], { slot1: -2, slot2: 0 });
    expect(windows[1]).toEqual({ startSeconds: 2, endSeconds: 2 + TEASER_WINDOW_SECONDS });
    expect(windows[2]).toEqual({ startSeconds: 0, endSeconds: TEASER_WINDOW_SECONDS });
  });
});

describe('stakesLine', () => {
  it('reads runtime, rounds and how many people took a side', () => {
    expect(stakesLine({ timelineSeconds: 241, turnCount: 4, sideCount: 1240 })).toBe(
      '4 min · 2 rounds · 1,240 took a side'
    );
  });

  it('drops a part it cannot state yet rather than printing zero', () => {
    expect(stakesLine({ timelineSeconds: 0, turnCount: 4, sideCount: null })).toBe('2 rounds');
    expect(stakesLine({ timelineSeconds: 30, turnCount: 0, sideCount: 0 })).toBe('1 min');
  });

  it('counts a single round in the singular', () => {
    expect(roundCount(2)).toBe(1);
    expect(stakesLine({ timelineSeconds: 120, turnCount: 1, sideCount: 3 })).toBe('2 min · 1 round · 3 took a side');
  });
});
