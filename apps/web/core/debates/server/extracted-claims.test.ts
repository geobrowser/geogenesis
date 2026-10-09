import { afterEach, describe, expect, it, vi } from 'vitest';

import { decodeDedupPendingUntil, decodeExtractedClaims, isDedupSettled } from './extracted-claims';

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

describe('decodeExtractedClaims highlight score', () => {
  const claim = (extra: Record<string, unknown>) => ({ text: 'A claim', is_factual: false, turn_index: 0, ...extra });

  it("carries geo-chat's highlight_score onto the claim", () => {
    const { claims } = decodeExtractedClaims({ turns: [turn], claims: [claim({ highlight_score: 0.62 })] });
    expect(claims[0].highlightScore).toBe(0.62);
  });

  it.each([0, 1])('keeps a score at the boundary, %d', score => {
    const { claims } = decodeExtractedClaims({ turns: [turn], claims: [claim({ highlight_score: score })] });
    expect(claims[0].highlightScore).toBe(score);
  });

  it.each([
    ['absent (a payload from before scoring)', {}, false],
    ['null (geo-chat did not score it)', { highlight_score: null }, false],
    ['a string', { highlight_score: '0.62' }, true],
    ['over 1', { highlight_score: 1.5 }, true],
    ['negative', { highlight_score: -0.2 }, true],
    ['not finite', { highlight_score: Number.POSITIVE_INFINITY }, true],
  ])('decodes no score when it is %s', (_label, extra, drift) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [claim(extra) as Parameters<typeof decodeExtractedClaims>[0]['claims'][number]],
    });
    expect(claims[0].highlightScore).toBeNull();
    // Absent and null are ordinary; a present value that is not a score is drift and is said.
    const said = warn.mock.calls.some(([message]) => String(message).includes('highlight scores'));
    expect(said).toBe(drift);
    warn.mockRestore();
  });

  it('logs how many claims were scored and by what, so an unscored debate is visible', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    decodeExtractedClaims({
      turns: [turn],
      claims: [
        claim({ highlight_score: 0.62, relevance_score: 0.8, quality_score: 0.9, controversy_score: 0.7 }),
        claim({ highlight_score: 0.4 }),
        claim({ highlight_score: null }),
      ],
      highlight_model: 'perplexity/pplx-decider-v1.1-27b',
    });
    expect(log).toHaveBeenCalledWith('[debate-acceptor] highlight scores decoded', {
      claims: 3,
      scored: 2,
      // One scored claim without axes — an older task, or values geo-chat refused — shows per axis.
      axes: { relevance: 1, quality: 1, controversy: 1 },
      model: 'perplexity/pplx-decider-v1.1-27b',
    });
    log.mockRestore();
  });
});

describe('decodeExtractedClaims axis scores', () => {
  const claim = (extra: Record<string, unknown>) =>
    ({ text: 'A claim', is_factual: false, turn_index: 0, ...extra }) as Parameters<
      typeof decodeExtractedClaims
    >[0]['claims'][number];

  it("carries geo-chat's three axis scores onto the claim beside the highlight score", () => {
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [claim({ highlight_score: 0.62, relevance_score: 0.8, quality_score: 0.9, controversy_score: 0.7 })],
    });
    expect(claims[0]).toMatchObject({
      highlightScore: 0.62,
      relevanceScore: 0.8,
      qualityScore: 0.9,
      controversyScore: 0.7,
    });
  });

  it('decodes an absent, null or malformed axis as null without touching the others, and says so for drift', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [
        claim({ highlight_score: 0.62, relevance_score: 0.8 }),
        claim({ relevance_score: null, quality_score: 1.5, controversy_score: '0.7' }),
      ],
    });
    expect(claims[0]).toMatchObject({
      highlightScore: 0.62,
      relevanceScore: 0.8,
      qualityScore: null,
      controversyScore: null,
    });
    expect(claims[1]).toMatchObject({
      highlightScore: null,
      relevanceScore: null,
      qualityScore: null,
      controversyScore: null,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('axis scores'), {
      count: 2,
      sample: [
        { field: 'quality_score', value: 1.5 },
        { field: 'controversy_score', value: '0.7' },
      ],
    });
    warn.mockRestore();
  });
});

describe('decodeExtractedClaims stable ids (GEO-2870 D1)', () => {
  it("carries geo-chat's entity_id as a dashless id, and null when absent or blank", () => {
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [
        { text: 'Minted', is_factual: true, turn_index: 0, entity_id: '5E1F0C3A-9B2D-4E6F-8A7B-6C5D4E3F2A1B' },
        {
          text: 'Matched',
          is_factual: true,
          turn_index: 0,
          existing_entity_id: '4f12f5ea073442cbaa0fb10f70a9a876',
          entity_id: null,
        },
        { text: 'Older payload', is_factual: null, turn_index: 0 },
        { text: 'Blank', is_factual: null, turn_index: 0, entity_id: '  ' },
      ],
    });
    expect(claims.map(c => c.stableEntityId)).toEqual(['5e1f0c3a9b2d4e6f8a7b6c5d4e3f2a1b', null, null, null]);
    expect(claims[1].existingClaimEntityId).toBe('4f12f5ea073442cbaa0fb10f70a9a876');
  });

  it('drops an entity_id the publish path would throw on, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [{ text: 'Bad id', is_factual: null, turn_index: 0, entity_id: 'not-an-entity-id' }],
    });
    expect(claims[0].stableEntityId).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[debate-acceptor] dropping extracted-claim entity ids that are not entity ids',
      expect.objectContaining({ count: 1 })
    );
  });
});

describe('decodeExtractedClaims stance (GEO-3142)', () => {
  it('carries the three verdicts and reads anything else as no verdict', () => {
    const { claims } = decodeExtractedClaims({
      turns: [turn],
      claims: [
        { text: 'a', is_factual: false, turn_index: 0, stance: 'supports' },
        { text: 'b', is_factual: false, turn_index: 0, stance: ' Opposes ' },
        { text: 'c', is_factual: true, turn_index: 0, stance: 'addresses' },
        { text: 'd', is_factual: false, turn_index: 0, stance: 'neutral' },
        { text: 'e', is_factual: false, turn_index: 0, stance: null },
        // A payload from before the classification shipped.
        { text: 'f', is_factual: false, turn_index: 0 },
      ],
    });
    expect(claims.map(c => c.stance)).toEqual(['supports', 'opposes', 'addresses', null, null, null]);
  });
});

describe('decodeExtractedClaims dedup marker', () => {
  it('reads geo-chat’s instant, and no marker as settled', () => {
    expect(
      decodeExtractedClaims({ turns: [turn], claims: [], dedup_pending_until: '2026-10-06T12:02:30.000Z' })
        .dedupPendingUntil
    ).toBe(Date.parse('2026-10-06T12:02:30.000Z'));
    expect(decodeExtractedClaims({ turns: [turn], claims: [] }).dedupPendingUntil).toBeNull();
    expect(
      decodeExtractedClaims({ turns: [turn], claims: [], dedup_pending_until: null }).dedupPendingUntil
    ).toBeNull();
  });

  it('never settles an unreadable marker, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(decodeDedupPendingUntil('soon')).toBe(Number.POSITIVE_INFINITY);
    expect(decodeDedupPendingUntil(17)).toBe(Number.POSITIVE_INFINITY);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(isDedupSettled(Number.POSITIVE_INFINITY, Date.now())).toBe(false);
  });

  it('settles at the instant', () => {
    expect(isDedupSettled(100, 99)).toBe(false);
    expect(isDedupSettled(100, 100)).toBe(true);
    expect(isDedupSettled(null, 0)).toBe(true);
  });
});
