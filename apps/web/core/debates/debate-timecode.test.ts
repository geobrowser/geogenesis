import { describe, expect, it } from 'vitest';

import {
  DEBATE_TIME_PARAM,
  TIMECODE_PREROLL_SECONDS,
  debateSeekSeconds,
  parseDebateTimeParam,
  withDebateTimecode,
} from './debate-timecode';

describe('debateSeekSeconds', () => {
  it('backs off by the pre-roll so the sentence is not clipped', () => {
    expect(debateSeekSeconds(724_000)).toBe(724 - TIMECODE_PREROLL_SECONDS);
  });

  it('clamps at zero for a claim inside the pre-roll window', () => {
    expect(debateSeekSeconds(0)).toBe(0);
    expect(debateSeekSeconds(1_000)).toBe(0);
  });

  it('answers zero rather than NaN for a timing that is not a number', () => {
    expect(debateSeekSeconds(Number.NaN)).toBe(0);
    expect(debateSeekSeconds(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('parseDebateTimeParam', () => {
  it('reads a position', () => {
    expect(parseDebateTimeParam('722')).toBe(722);
  });

  it('takes the first value of a repeated param', () => {
    expect(parseDebateTimeParam(['722', '900'])).toBe(722);
  });

  it('accepts zero as a deliberate position', () => {
    expect(parseDebateTimeParam('0')).toBe(0);
  });

  it('floors a fractional position', () => {
    expect(parseDebateTimeParam('722.9')).toBe(722);
  });

  it('is null when no position is asked for', () => {
    expect(parseDebateTimeParam(null)).toBeNull();
    expect(parseDebateTimeParam(undefined)).toBeNull();
    expect(parseDebateTimeParam('')).toBeNull();
  });

  // A corrupt param must stay distinguishable from `t=0`: clamping would make a broken link look
  // like a request to start from the top, which is what happens with no param at all anyway.
  it('is null rather than clamped for a value that is not a position', () => {
    expect(parseDebateTimeParam('abc')).toBeNull();
    expect(parseDebateTimeParam('-5')).toBeNull();
    expect(parseDebateTimeParam(String(13 * 60 * 60))).toBeNull();
  });
});

describe('withDebateTimecode', () => {
  it('adds the position to a bare path', () => {
    expect(withDebateTimecode('/space/abc/def', 722)).toBe(`/space/abc/def?${DEBATE_TIME_PARAM}=722`);
  });

  it('keeps params already on the link', () => {
    const href = withDebateTimecode('/space/abc/def?modal=debates', 722);
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(params.get('modal')).toBe('debates');
    expect(params.get(DEBATE_TIME_PARAM)).toBe('722');
  });

  it('replaces a position already there rather than appending a second one', () => {
    const href = withDebateTimecode(`/space/abc/def?${DEBATE_TIME_PARAM}=10`, 722);
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(params.getAll(DEBATE_TIME_PARAM)).toEqual(['722']);
  });

  // A fragment placed before the query is the one order a browser will not read.
  it('keeps the hash last', () => {
    expect(withDebateTimecode('/space/abc/def#claims', 722)).toBe(`/space/abc/def?${DEBATE_TIME_PARAM}=722#claims`);
  });

  it('never writes a negative or fractional position', () => {
    expect(withDebateTimecode('/x', -5)).toBe(`/x?${DEBATE_TIME_PARAM}=0`);
    expect(withDebateTimecode('/x', 12.7)).toBe(`/x?${DEBATE_TIME_PARAM}=12`);
  });
});
