import { describe, expect, it } from 'vitest';

import type { DebateTranscriptSegment } from './api';
import { backlogWindows, claimHistory, claimMarkers } from './claim-ticker';
import { type ClaimTiming, claimsInSpokenOrder } from './claim-timing';
import { groupedPublishedClaims, refineGroupedClaimTimings } from './claim-timing-refinement';
import type { TranscriptClaim } from './transcript-claims';

function claim(id: string, text: string, startMs = 259_080, endMs = 274_160): TranscriptClaim {
  return {
    id,
    text,
    blockId: 'turn-4',
    spaceId: 'space-1',
    publishedTiming: { startMs, endMs },
    restated: false,
    relationEntityId: null,
    highlightScore: null,
    relevanceScore: null,
    qualityScore: null,
    controversyScore: null,
  };
}
function line(start_ms: number, end_ms: number, text: string): DebateTranscriptSegment {
  return { start_ms, end_ms, text } as DebateTranscriptSegment;
}
function published(claims: TranscriptClaim[]) {
  return new Map(
    claims.map(claim => [claim.id, { ...claim.publishedTiming!, source: 'published', confidence: 1 } as ClaimTiming])
  );
}

// Public round-three excerpt from 01a13b2c93b4702384da0926a56c265a. The extractor assigned all
// four statements 274160 as their end, even though they are said separately across the turn.
const claims = [
  claim(
    'consumers',
    'Harming American consumers through mass deportation also harms American workers, as workers are also consumers',
    229_267
  ),
  claim('farms', 'Immigration policies have led to labor shortages on farms'),
  claim('food', 'Food prices have increased as a result of certain immigration policies'),
  claim('truckers', 'Truckers have refused to drive through certain states because of their immigration policies'),
];
const transcript = [
  line(229267, 233240, 'So, once again, I think that'),
  line(233240, 233920, 'American workers are all'),
  line(233920, 235640, 'so American consumers.'),
  line(235640, 237740, 'So making the point that mass'),
  line(237740, 238760, 'deportation would hurt American'),
  line(238760, 240040, 'consumers does also make'),
  line(240040, 241100, 'the point that it hurts'),
  line(241100, 242160, 'American workers.'),
  line(242160, 244310, "So I think that's pretty clear"),
  line(244310, 244840, 'cut.'),
  line(244840, 246990, 'Now, on your point that'),
  line(246990, 248520, 'American workers could take on'),
  line(248520, 250560, 'the jobs that were left, they'),
  line(250560, 253380, 'could, but in large part they'),
  line(253380, 256310, "don't and haven't in the during"),
  line(256310, 259080, "this recent tenure, we've seen,"),
  line(259080, 260840, 'you know, the effects of mass'),
  line(260840, 261980, 'importations and seeing labor'),
  line(261980, 263360, "shortages on farms, you've"),
  line(263360, 265460, 'seen cases in prices of food,'),
  line(265460, 267150, 'seen truckers refusing to drive'),
  line(267150, 268720, 'through certain states'),
  line(268720, 270530, 'because of their policies, all'),
  line(270530, 272000, 'these things hurt the American'),
  line(272000, 273320, 'consumer and therefore'),
  line(273320, 274160, 'hurt the American worker.'),
];

describe('grouped paragraph claim timing', () => {
  it('reproduces the round-three batch and places each statement at its supporting clause instead', () => {
    const original = published(claims);
    const before = backlogWindows(claimsInSpokenOrder(claims, original));
    expect(claimHistory(before, 274_159)).toHaveLength(0);
    expect(claimHistory(before, 274_160)).toHaveLength(4);
    const refined = refineGroupedClaimTimings(groupedPublishedClaims(claims), original, transcript);
    const windows = backlogWindows(claimsInSpokenOrder(claims, refined));
    const expected = [242_160, 263_360, 265_460, 270_530];
    expect(windows.map(window => window.startMs)).toEqual(expected);
    for (const [index, at] of expected.entries()) {
      expect(claimHistory(windows, at - 1)).toHaveLength(index);
      expect(claimHistory(windows, at)).toHaveLength(index + 1);
    }
    // Marker, backlog and counter share the same actual timing; no separate display-count queue.
    expect(claimMarkers(claimsInSpokenOrder(claims, refined), 300_000).map(marker => marker.atMs)).toEqual(expected);
    expect([...original.values()].every(timing => timing.endMs === 274_160)).toBe(true);
  });

  it('does not count at an identifying noun before the supporting clause has finished', () => {
    const refined = refineGroupedClaimTimings(groupedPublishedClaims(claims), published(claims), transcript);
    expect(refined.get('consumers')?.endMs).toBe(242_160);
    expect(refined.get('consumers')?.endMs).not.toBe(238_760);
  });

  it('leaves independent precise timestamps and different speakers/turns alone', () => {
    const separate = [
      claims[0],
      { ...claims[1], blockId: 'another-turn' },
      { ...claims[2], publishedTiming: { startMs: 250_000, endMs: 265_460 } },
    ];
    expect(groupedPublishedClaims(separate)).toEqual([]);
    const original = published(separate);
    expect(refineGroupedClaimTimings([], original, transcript)).toBe(original);
  });

  it('retains published bounds when the transcript is absent, unrelated, or has too few distinctive anchors', () => {
    const original = published(claims);
    expect(refineGroupedClaimTimings(groupedPublishedClaims(claims), original, [])).toBe(original);
    for (const text of ['The weather forecast is sunny.', 'These immigration policies are significant.']) {
      const result = refineGroupedClaimTimings(groupedPublishedClaims(claims), original, [
        line(260_000, 262_000, text),
      ]);
      expect(result).toEqual(original);
    }
  });

  it('never searches another turn or outside the published interval', () => {
    const original = published(claims);
    const outside = transcript.map(segment => ({
      ...segment,
      start_ms: segment.start_ms + 100_000,
      end_ms: segment.end_ms + 100_000,
    }));
    expect(refineGroupedClaimTimings(groupedPublishedClaims(claims), original, outside)).toEqual(original);
  });

  it('keeps negation when choosing between otherwise similar supporting clauses', () => {
    const statements = [
      claim('safety', 'Vaccination was not safe.', 0, 10_000),
      claim('coffee', 'Coffee improves memory.', 0, 10_000),
    ];
    const lines = [
      line(0, 1_000, 'Vaccination was safe.'),
      line(1_000, 2_000, 'Vaccination was not safe.'),
      line(2_000, 3_000, 'Coffee improves memory.'),
    ];
    const refined = refineGroupedClaimTimings(groupedPublishedClaims(statements), published(statements), lines);
    expect(refined.get('safety')?.endMs).toBe(2_000);
    expect(refined.get('coffee')?.endMs).toBe(3_000);
  });

  it.each([
    [
      'not',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      'Vaccination was safe.',
      'Coffee improves memory.',
      'Vaccination was not safe, according to the detailed research evidence.',
      'Coffee does not improve memory, according to the detailed research evidence.',
    ],
    [
      'never',
      'Vaccination was never safe.',
      'Coffee never improves memory.',
      'Vaccination was safe.',
      'Coffee improves memory.',
      'Vaccination was never safe, according to the detailed research evidence.',
      'Coffee never improves memory, according to the detailed research evidence.',
    ],
    [
      'without',
      'Wheat farms operate without subsidies.',
      'Steel factories operate without permits.',
      'Wheat farms operate with subsidies.',
      'Steel factories operate with permits.',
      'Wheat farms operate without subsidies, according to the detailed research evidence.',
      'Steel factories operate without permits, according to the detailed research evidence.',
    ],
    [
      'no',
      'Vaccination has no safety benefits.',
      'Coffee has no memory benefits.',
      'Vaccination has safety benefits.',
      'Coffee has memory benefits.',
      'Vaccination has no safety benefits, according to the detailed research evidence.',
      'Coffee has no memory benefits, according to the detailed research evidence.',
    ],
    [
      'contractions',
      "Vaccination wasn't safe.",
      "Coffee doesn't improve memory.",
      'Vaccination was safe.',
      'Coffee improves memory.',
      'Vaccination was not safe, according to the detailed research evidence.',
      'Coffee does not improve memory, according to the detailed research evidence.',
    ],
  ])(
    'preserves shared negation (%s) in counter, backlog and marker timing',
    (_negation, first, second, affirmative1, affirmative2, negative1, negative2) => {
      const statements = [claim('first', first, 0, 10_000), claim('second', second, 0, 10_000)];
      const lines = [
        line(0, 1000, affirmative1),
        line(1000, 2000, negative1),
        line(2000, 3000, affirmative2),
        line(3000, 4000, negative2),
      ];
      const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), published(statements), lines);
      const ordered = claimsInSpokenOrder(statements, result);
      const windows = backlogWindows(ordered);
      expect(windows.map(window => window.startMs)).toEqual([2000, 4000]);
      expect(claimHistory(windows, 1999)).toHaveLength(0);
      expect(claimHistory(windows, 2000)).toHaveLength(1);
      expect(claimHistory(windows, 3999)).toHaveLength(1);
      expect(claimHistory(windows, 4000)).toHaveLength(2);
      expect(claimMarkers(ordered, 10_000).map(marker => marker.atMs)).toEqual([2000, 4000]);
      const original = published(statements);
      expect(
        refineGroupedClaimTimings(groupedPublishedClaims(statements), original, [
          line(0, 1000, affirmative1),
          line(2000, 3000, affirmative2),
        ])
      ).toEqual(original);
    }
  );

  it.each([
    ['not', ['Vaccination was not safe.']],
    ['contraction', ["Vaccination wasn't safe."]],
    ['never', ['Vaccination was never safe.']],
    ['no', ['Vaccination has no safety benefits.']],
    ['without', ['Vaccination is without safety benefits.']],
    ['split negation', ['It was not', 'safe for vaccination.']],
    ['clause ending', ['Vaccination was safe', 'was not what the study found.']],
  ])('does not refine an affirmative claim to a negated assertion (%s)', (_label, assertion) => {
    const statements = [
      claim(
        'safety',
        ['no', 'without'].includes(_label) ? 'Vaccination has safety benefits.' : 'Vaccination was safe.',
        0,
        10_000
      ),
      claim('coffee', 'Coffee improves memory.', 0, 10_000),
    ];
    const lines = [
      ...assertion.map((text, index) => line(index * 1000, (index + 1) * 1000, text)),
      line(3000, 4000, 'Coffee improves memory.'),
    ];
    const original = published(statements);
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), original, lines);
    expect(result.get('safety')).toEqual(original.get('safety'));
    const ordered = claimsInSpokenOrder(statements, result);
    const windows = backlogWindows(ordered);
    expect(windows.map(window => window.startMs)).toEqual([4000, 10_000]);
    expect(claimHistory(windows, 3999)).toHaveLength(0);
    expect(claimHistory(windows, 4000)).toHaveLength(1);
    expect(claimHistory(windows, 9999)).toHaveLength(1);
    expect(claimMarkers(ordered, 12_000).map(marker => marker.atMs)).toEqual([4000, 10_000]);
  });

  it('does not borrow negation from another sentence to support a negative claim', () => {
    const statements = [
      claim('safety', 'Vaccination was not safe.', 0, 10_000),
      claim('coffee', 'Coffee does not improve memory.', 0, 10_000),
    ];
    const original = published(statements);
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), original, [
      line(0, 1000, 'Vaccination was safe.'),
      line(1000, 2000, 'Coffee does not improve memory.'),
    ]);
    expect(result.get('safety')).toEqual(original.get('safety'));
    expect(result.get('coffee')?.endMs).toBe(2000);
  });

  it('keeps published bounds if clause completion crosses into an opposite assertion', () => {
    const statements = [
      claim('safety', 'Vaccination was not safe.', 0, 10_000),
      claim('coffee', 'Coffee does not improve memory.', 0, 10_000),
    ];
    const original = published(statements);
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), original, [
      line(0, 1000, 'Vaccination was not safe. Then vaccination'),
      line(1000, 2000, 'was safe.'),
      line(2000, 3000, 'Coffee does not improve memory.'),
    ]);
    expect(result.get('safety')).toEqual(original.get('safety'));
    expect(result.get('coffee')?.endMs).toBe(3000);
  });

  it.each([
    [
      'period',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      ['Vaccination was safe. Coffee does not improve memory.'],
    ],
    [
      'reverse order',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      ['Coffee does not improve memory. Vaccination was safe.'],
    ],
    [
      'exclamation',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      ['Vaccination was safe! Coffee does not improve memory.'],
    ],
    [
      'question',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      ['Vaccination was safe? Coffee does not improve memory.'],
    ],
    [
      'semicolon',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      ['Vaccination was safe; Coffee does not improve memory.'],
    ],
    [
      'colon',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      ['Vaccination was safe: Coffee does not improve memory.'],
    ],
    [
      'contraction',
      'Vaccination was not safe.',
      'Coffee does not improve memory.',
      ["Vaccination was safe. Coffee doesn't improve memory."],
    ],
    [
      'no',
      'Vaccination has no safety benefits.',
      'Coffee has no memory benefits.',
      ['Vaccination has safety benefits. Coffee has no memory benefits.'],
    ],
    [
      'without',
      'Wheat farms operate without subsidies.',
      'Steel factories operate without permits.',
      ['Wheat farms operate with subsidies. Steel factories operate without permits.'],
    ],
    [
      'continued sentence',
      'Vaccination was not safe.',
      'Coffee improves memory.',
      ['It was not', 'safe for vaccination. Coffee improves memory.'],
    ],
  ] as const)('keeps published timing when a segment mixes sentence polarities (%s)', (_label, first, second, text) => {
    const statements = [claim('first', first, 0, 10_000), claim('second', second, 0, 10_000)];
    const original = published(statements);
    const lines = text.map((text, index) => line(index * 1000, (index + 1) * 1000, text));
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), original, lines);
    expect(result).toEqual(original);
    const ordered = claimsInSpokenOrder(statements, result);
    const windows = backlogWindows(ordered);
    expect(claimHistory(windows, 9999)).toHaveLength(0);
    expect(claimHistory(windows, 10_000)).toHaveLength(2);
    expect(claimMarkers(ordered, 12_000).map(marker => [marker.atMs, marker.count])).toEqual([[10_000, 2]]);
  });

  it('carries the final sentence polarity past an earlier sentence boundary within a segment', () => {
    const statements = [
      claim('safety', 'Vaccination was safe.', 0, 10_000),
      claim('coffee', 'Coffee improves memory.', 0, 10_000),
    ];
    const original = published(statements);
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), original, [
      line(0, 1000, 'The coffee comment was a distraction. It was not'),
      line(1000, 2000, 'safe for vaccination.'),
      line(2000, 3000, 'Coffee improves memory.'),
    ]);
    expect(result.get('safety')).toEqual(original.get('safety'));
    expect(result.get('coffee')?.endMs).toBe(3000);
  });

  it.each([false, true])('still refines multiple sentences of one polarity (negated: %s)', negative => {
    const statements = [
      claim('safety', negative ? 'Vaccination was not safe.' : 'Vaccination was safe.', 0, 10_000),
      claim('coffee', negative ? 'Coffee does not improve memory.' : 'Coffee improves memory.', 0, 10_000),
    ];
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), published(statements), [
      line(0, 1000, `“${statements.map(claim => claim.text).join(' ')}”`),
    ]);
    expect([...result.values()].map(timing => [timing.endMs, timing.source])).toEqual([
      [1000, 'segment'],
      [1000, 'segment'],
    ]);
  });

  it('rejects a mixed segment added while completing an otherwise consistent negative match', () => {
    const statements = [
      claim('safety', 'Vaccination was not safe.', 0, 10_000),
      claim('coffee', 'Coffee does not improve memory.', 0, 10_000),
    ];
    const original = published(statements);
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), original, [
      line(0, 1000, 'Vaccination was not safe. Then vaccination was not'),
      line(1000, 2000, 'safe. Coffee improves memory.'),
      line(2000, 3000, 'Coffee does not improve memory.'),
    ]);
    expect(result.get('safety')).toEqual(original.get('safety'));
    expect(result.get('coffee')?.endMs).toBe(3000);
  });

  it('keeps polarity when punctuation finishes a sentence in its own segment', () => {
    const statements = [
      claim('safety', 'Vaccination was not safe.', 0, 10_000),
      claim('coffee', 'Coffee improves memory.', 0, 10_000),
    ];
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), published(statements), [
      line(0, 1000, 'Vaccination was not'),
      line(1000, 2000, 'safe'),
      line(2000, 3000, '.'),
      line(3000, 4000, 'Coffee improves memory.'),
    ]);
    expect(result.get('safety')?.endMs).toBe(3000);
    expect(result.get('coffee')?.endMs).toBe(4000);
  });

  it('can refine an affirmative assertion in a separate sentence after a negated one', () => {
    const statements = [
      claim('safety', 'Vaccination was safe.', 0, 10_000),
      claim('coffee', 'Coffee improves memory.', 0, 10_000),
    ];
    const lines = [
      line(0, 1000, 'Vaccination was not safe.'),
      line(1000, 2000, 'Coffee improves memory.'),
      line(2000, 3000, 'Vaccination was safe.'),
    ];
    const result = refineGroupedClaimTimings(groupedPublishedClaims(statements), published(statements), lines);
    expect(result.get('safety')?.endMs).toBe(3000);
    expect(result.get('coffee')?.endMs).toBe(2000);
  });

  it('keeps a compound assertion until its predicate is spoken after the matching subject', () => {
    const statements = [
      claim(
        'deportation',
        'Mass deporting people who are not committing crimes and are just living in the U.S. does not help the American worker',
        157_200,
        170_960
      ),
      claim('taxes', 'A large portion of undocumented immigrants living in the U.S. pay taxes', 157_200, 170_960),
    ];
    const lines = [
      line(157200, 159010, "I'm not saying that, you know,"),
      line(159010, 160520, 'any of that thing is true.'),
      line(160520, 162260, 'But what I am saying is that'),
      line(162260, 163610, 'going after and mass deporting'),
      line(163610, 165320, "people who aren't committing"),
      line(165320, 167000, 'crimes, who are just living'),
      line(167000, 168380, 'here, they are actually paying'),
      line(168380, 169840, "taxes in large part doesn't"),
      line(169840, 170960, 'help the American worker at all.'),
    ];
    const refined = refineGroupedClaimTimings(groupedPublishedClaims(statements), published(statements), lines);
    expect(refined.get('deportation')?.endMs).toBe(170_960);
  });

  it('does not move restated claims, existing fallback matches, or a match without a clause ending', () => {
    expect(groupedPublishedClaims(claims.map(claim => ({ ...claim, restated: true })))).toEqual([]);
    const original = new Map(
      [...published(claims)].map(([id, timing]) => [id, { ...timing, source: 'segment' as const }])
    );
    expect(refineGroupedClaimTimings(groupedPublishedClaims(claims), original, transcript)).toEqual(original);
    const noPunctuation = transcript.map(segment => ({ ...segment, text: segment.text.replace(/[.!?,;:]/g, '') }));
    expect(refineGroupedClaimTimings(groupedPublishedClaims(claims), published(claims), noPunctuation)).toEqual(
      published(claims)
    );
  });
});
