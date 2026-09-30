import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeExtractedClaims } from './extracted-claims';

const turn = { turn_index: 0, participant_slot: 0, attributed_space_id: 'space-a', speaker_name: 'A', text: 'hello' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('decodeExtractedClaims topics', () => {
  it('maps topic rows to {id, name}, dropping blank ids and defaulting absent topics', () => {
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [
        {
          text: 'With topics',
          is_factual: true,
          turn_index: 0,
          topics: [
            { entity_id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' },
            // Drift guard: a row without a usable id must not become an empty entity reference.
            { entity_id: '   ', name: 'Blank id' },
          ],
        },
        // A payload from before topic assignment shipped has no `topics` key at all.
        { text: 'Without topics', is_factual: null, turn_index: 0 },
      ],
    });
    expect(claims[0].topics).toEqual([{ id: '27b73193ecea48fdaa46fdee40c0b717', name: 'AI and mental health' }]);
    expect(claims[1].topics).toEqual([]);
  });

  it('maps is_contestable, defaulting a missing flag to not-a-motion', () => {
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [
        { text: 'Broad position', is_factual: false, turn_index: 0, is_contestable: true },
        { text: 'Narrow fact', is_factual: true, turn_index: 0, is_contestable: false },
        // Payload from before the classification shipped.
        { text: 'Unclassified', is_factual: null, turn_index: 0 },
      ],
    });
    expect(claims.map(c => c.isContestable)).toEqual([true, false, false]);
  });

  it('drops topic ids the publish path would throw on, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [
        {
          text: 'Bad topic ids',
          is_factual: true,
          turn_index: 0,
          topics: [
            // A slug, and a half-dashed id: `Graph.createRelation` asserts every id and throws,
            // which would fail the whole edit — so neither may reach the draft.
            { entity_id: 'ai-and-mental-health', name: 'AI and mental health' },
            { entity_id: '4f12-f5ea073442cbaa0fb10f70a9a876', name: 'Half dashed' },
            { entity_id: '27b73193-ecea-48fd-aa46-fdee40c0b717', name: 'Canonically dashed' },
          ],
        },
      ],
    });
    expect(claims[0].topics).toEqual([{ id: '27b73193-ecea-48fd-aa46-fdee40c0b717', name: 'Canonically dashed' }]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('treats a mis-shaped topics or claims field as no data rather than throwing', () => {
    expect(() =>
      decodeExtractedClaims({
        turns: [turn],
        // A map instead of a list, from a hypothetical geo-chat shape change.
        claims: [{ text: 'x', is_factual: null, turn_index: 0, topics: { a: 'b' } as never }],
      })
    ).not.toThrow();
    // `decodeExtractedClaims` runs outside the caller's try/catch, so a throw here would abort
    // the publish instead of falling back to the raw transcript.
    expect(decodeExtractedClaims({ turns: [turn], claims: 'nope' as never }).claims).toEqual([]);
  });
});

describe('decodeExtractedClaims timing (GEO-2958)', () => {
  const claim = (extra: Record<string, unknown>) => ({ text: 'A claim', is_factual: false, turn_index: 0, ...extra });

  it('carries geo-chat start_ms/end_ms onto the claim', () => {
    const { claims } = decodeExtractedClaims({ turns: [turn], claims: [claim({ start_ms: 16_680, end_ms: 21_900 })] });
    expect(claims[0].timing).toEqual({ startMs: 16_680, endMs: 21_900 });
  });

  it.each([
    ['absent (a payload from before timing)', {}],
    ['null (geo-chat could not measure it)', { start_ms: null, end_ms: null }],
    ['only a start', { start_ms: 1_000, end_ms: null }],
    ['strings', { start_ms: '1000', end_ms: '2000' }],
    ['an end at the start', { start_ms: 2_000, end_ms: 2_000 }],
    ['an end before the start', { start_ms: 4_000, end_ms: 2_000 }],
    ['a negative start', { start_ms: -500, end_ms: 2_000 }],
    ['a fractional value', { start_ms: 1_000.5, end_ms: 2_000 }],
  ])('decodes no timing when it is %s', (_label, extra) => {
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [claim(extra) as Parameters<typeof decodeExtractedClaims>[0]['claims'][number]],
    });
    expect(claims[0].timing).toBeNull();
  });
});
