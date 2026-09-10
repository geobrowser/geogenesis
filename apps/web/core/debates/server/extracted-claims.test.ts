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
