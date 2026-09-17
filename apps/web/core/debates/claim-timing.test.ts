import { describe, expect, it } from 'vitest';

import type { DebateTranscriptSegment } from './api';
import {
  type ClaimTiming,
  LIVE_TIMING_CONFIDENCE,
  claimsInSpokenOrder,
  findBlockWindow,
  formatTimecode,
  isAssertableMoment,
  matchClaimWindow,
  resolveClaimTimings,
  sortClaimsBySpokenOrder,
} from './claim-timing';
import type { TranscriptBlock, TranscriptClaim } from './transcript-claims';

/**
 * One turn of a real published debate, verbatim.
 *
 * Preston's third turn of "Trump's second term is making America more authoritarian"
 * (`01a0a607-72dc-7cb0-9bf6-ebba15e97b67`), 2:00–2:45, with the three claims the extractor pulled
 * out of it. Real data rather than invented sentences, because the thing under test is whether an
 * extractor's *paraphrase* can be matched back to speech — and a hand-written fixture would quietly
 * be written to match.
 */
function segment(index: number, startMs: number, endMs: number, text: string): DebateTranscriptSegment {
  return {
    id: `segment-${index}`,
    participant_slot: 1,
    position: false,
    position_label: 'Disagree',
    sequence_index: index,
    start_ms: startMs,
    end_ms: endMs,
    text,
    metadata: {},
    created_at: '2026-09-15T17:35:12.722937Z',
  };
}

const SEGMENTS: DebateTranscriptSegment[] = [
  segment(0, 120000, 120530, 'Yeah, I totally agree with the'),
  segment(1, 120530, 124030, 'intention of the founding'),
  segment(2, 124030, 126080, 'fathers and the checks and'),
  segment(3, 126080, 127720, 'balances comment.'),
  segment(4, 127720, 129670, 'I still stand by that this'),
  segment(5, 129670, 131520, 'trend has been continuing.'),
  segment(6, 131520, 134600, 'It really comes down to the'),
  segment(7, 134600, 138450, 'Supreme Court not providing'),
  segment(8, 138450, 140960, 'those checks anymore.'),
  segment(9, 140960, 143140, 'And you also have executive'),
  segment(10, 143140, 145230, 'branches or governmental'),
  segment(11, 145230, 147890, 'branches sidestepping the'),
  segment(12, 147890, 149000, 'powers of Congress'),
  segment(13, 149000, 150520, 'and suing companies.'),
  segment(14, 150520, 154020, 'You look at the SEC under Gensler'),
  segment(15, 154020, 157450, 'and his attacks on the crypto'),
  segment(16, 157450, 159080, 'industry and then the'),
  segment(17, 159080, 160640, 'ensuing legal battles that came'),
  segment(18, 160640, 160960, 'up.'),
  segment(19, 160960, 162210, "I'm not necessarily saying that"),
  segment(20, 162210, 163080, "this isn't happening now."),
  segment(21, 163080, 164140, "I'm saying that it's more of a"),
  segment(22, 164140, 165000, "trend that's been happening."),
];

const BLOCK_TEXT =
  'Yeah, I totally agree with the intention of the founding fathers and the checks and balances comment. ' +
  'I still stand by that this trend has been continuing. It really comes down to the Supreme Court not ' +
  'providing those checks anymore. And you also have executive branches or governmental branches ' +
  'sidestepping the powers of Congress and suing companies. You look at the SEC under Gensler and his ' +
  "attacks on the crypto industry and then the ensuing legal battles that came up. I'm not necessarily " +
  "saying that this isn't happening now. I'm saying that it's more of a trend that's been happening.";

const BLOCK: TranscriptBlock = { id: 'block-1', authorSpaceId: 'author-1', text: BLOCK_TEXT };

function claim(id: string, text: string, overrides: Partial<TranscriptClaim> = {}): TranscriptClaim {
  return { id, text, spaceId: 'space-1', blockId: 'block-1', publishedTiming: null, ...overrides };
}

const SUPREME_COURT = claim(
  'claim-supreme-court',
  'The Supreme Court is no longer providing sufficient checks on executive power'
);
const SIDESTEPPING = claim(
  'claim-sidestepping',
  'Executive branches of the government are sidestepping the powers of Congress by suing companies directly'
);
const SEC = claim(
  'claim-sec',
  'The SEC under Gary Gensler has taken action against the crypto industry, resulting in legal battles'
);

describe('findBlockWindow', () => {
  it('locates the turn exactly, because a block is its segments joined', () => {
    expect(findBlockWindow(BLOCK_TEXT, SEGMENTS)).toEqual({ startIndex: 0, endIndex: 22 });
  });

  it('ignores punctuation and whitespace differences', () => {
    const reflowed = BLOCK_TEXT.replace(/\s+/g, '  ').replace(/,/g, '');
    expect(findBlockWindow(reflowed, SEGMENTS)).toEqual({ startIndex: 0, endIndex: 22 });
  });

  it('still places a turn whose tail was truncated after publishing', () => {
    const truncated = SEGMENTS.slice(0, 16)
      .map(value => value.text)
      .join(' ');
    expect(findBlockWindow(truncated, SEGMENTS)).toEqual({ startIndex: 0, endIndex: 15 });
  });

  it('returns null rather than guessing when the text is from another debate', () => {
    expect(findBlockWindow('Housing policy is downstream of interest rates.', SEGMENTS)).toBeNull();
    expect(findBlockWindow('', SEGMENTS)).toBeNull();
  });
});

describe('matchClaimWindow', () => {
  const window = { startIndex: 0, endIndex: 22 };

  it('places each claim on the sentence that says it', () => {
    const supremeCourt = matchClaimWindow(SUPREME_COURT.text, SEGMENTS, window);
    expect(supremeCourt?.startMs).toBe(134600);
    expect(supremeCourt?.endMs).toBe(143140);

    const sidestepping = matchClaimWindow(SIDESTEPPING.text, SEGMENTS, window);
    expect(sidestepping?.startMs).toBe(140960);
    expect(sidestepping?.endMs).toBe(150520);

    const sec = matchClaimWindow(SEC.text, SEGMENTS, window);
    expect(sec?.startMs).toBe(150520);
    expect(sec?.endMs).toBe(160640);
  });

  it('is confident enough about a well-matched claim to surface it live', () => {
    const supremeCourt = matchClaimWindow(SUPREME_COURT.text, SEGMENTS, window);
    expect(supremeCourt?.confidence).toBeGreaterThanOrEqual(LIVE_TIMING_CONFIDENCE);
  });

  it('prefers the tightest window that accounts for the claim, not the widest', () => {
    const matched = matchClaimWindow(SUPREME_COURT.text, SEGMENTS, window);
    // The whole turn contains these words too; a window that wide would be useless.
    expect((matched?.endMs ?? 0) - (matched?.startMs ?? 0)).toBeLessThan(15_000);
  });

  it('scores a claim from a different debate far below the live bar', () => {
    const unrelated = matchClaimWindow('Remote work made the housing squeeze worse.', SEGMENTS, window);
    expect(unrelated?.confidence ?? 0).toBeLessThan(LIVE_TIMING_CONFIDENCE);
  });
});

describe('resolveClaimTimings', () => {
  const claims = [SUPREME_COURT, SIDESTEPPING, SEC];

  it('prefers published timecodes over matching, and says so', () => {
    const published = claim('claim-published', SEC.text, { publishedTiming: { startMs: 1000, endMs: 2000 } });

    const timings = resolveClaimTimings({ claims: [published], blocks: [BLOCK], segments: SEGMENTS });

    expect(timings.get('claim-published')).toEqual({
      startMs: 1000,
      endMs: 2000,
      confidence: 1,
      source: 'published',
    });
  });

  it('matches against the transcript when nothing is published', () => {
    const timings = resolveClaimTimings({ claims, blocks: [BLOCK], segments: SEGMENTS });

    expect(timings.size).toBe(3);
    for (const [, timing] of timings) {
      expect(timing.source).toBe('segment');
      expect(timing.startMs).toBeGreaterThanOrEqual(120000);
      expect(timing.endMs).toBeLessThanOrEqual(165000);
    }
  });

  it('falls back to the whole turn when the claim shares no vocabulary with it', () => {
    const offTopic = claim('claim-off-topic', 'Interest rates drove the housing squeeze in coastal cities.');

    const timings = resolveClaimTimings({ claims: [offTopic], blocks: [BLOCK], segments: SEGMENTS });

    expect(timings.get('claim-off-topic')).toEqual({
      startMs: 120000,
      endMs: 165000,
      confidence: 0,
      source: 'block',
    });
  });

  it('leaves a claim untimed when its turn cannot be located, rather than guessing', () => {
    const orphan = claim('claim-orphan', SEC.text, { blockId: 'block-missing' });

    const timings = resolveClaimTimings({ claims: [orphan], blocks: [BLOCK], segments: SEGMENTS });

    expect(timings.has('claim-orphan')).toBe(false);
  });

  it('times nothing before the transcript has loaded', () => {
    expect(resolveClaimTimings({ claims, blocks: [BLOCK], segments: [] }).size).toBe(0);
  });

  it('reads segments in time order even when the API returns them shuffled', () => {
    const shuffled = [...SEGMENTS].reverse();

    const timings = resolveClaimTimings({ claims, blocks: [BLOCK], segments: shuffled });

    expect(timings.get(SUPREME_COURT.id)?.startMs).toBe(134600);
  });
});

describe('claimsInSpokenOrder', () => {
  it('reorders claims the graph returned arbitrarily into the order they were said', () => {
    // The order below is the order the API actually returns these three, which is not chronological
    // — relations are published with random positions.
    const asReturned = [SIDESTEPPING, SUPREME_COURT, SEC];
    const timings = resolveClaimTimings({ claims: asReturned, blocks: [BLOCK], segments: SEGMENTS });

    expect(claimsInSpokenOrder(asReturned, timings).map(value => value.id)).toEqual([
      SUPREME_COURT.id,
      SIDESTEPPING.id,
      SEC.id,
    ]);
  });

  it('keeps untimed claims at the end in their incoming order', () => {
    const orphanA = claim('orphan-a', 'one', { blockId: 'missing' });
    const orphanB = claim('orphan-b', 'two', { blockId: 'missing' });
    const claims = [orphanA, SEC, orphanB];
    const timings = resolveClaimTimings({ claims, blocks: [BLOCK], segments: SEGMENTS });

    expect(claimsInSpokenOrder(claims, timings).map(value => value.id)).toEqual([SEC.id, 'orphan-a', 'orphan-b']);
  });
});

describe('sortClaimsBySpokenOrder', () => {
  const timing = (startMs: number, confidence: number, source: ClaimTiming['source']): ClaimTiming => ({
    startMs,
    endMs: startMs + 4_000,
    confidence,
    source,
  });

  it('orders by when each claim was said', () => {
    const timings = new Map([
      ['late', timing(30_000, 1, 'published')],
      ['early', timing(10_000, 1, 'published')],
    ]);

    expect(sortClaimsBySpokenOrder([{ id: 'late' }, { id: 'early' }], timings).map(c => c.id)).toEqual([
      'early',
      'late',
    ]);
  });

  // A loose match is not firm enough to print a timecode, but a list still has to put the claim
  // somewhere, and roughly-when beats the turn it happens to sit in.
  it('uses a match too loose to state as a timecode', () => {
    const timings = new Map([
      ['loose', timing(10_000, 0.4, 'segment')],
      ['firm', timing(30_000, 1, 'published')],
    ]);

    expect(isAssertableMoment(timings.get('loose')!)).toBe(false);
    expect(sortClaimsBySpokenOrder([{ id: 'firm' }, { id: 'loose' }], timings).map(c => c.id)).toEqual([
      'loose',
      'firm',
    ]);
  });

  // Every claim of one turn carries that turn's window, so they tie. Relation `position` is random,
  // so without a tiebreak the order inside a turn is a shuffle.
  it('breaks a shared turn with the tiebreak rather than arrival order', () => {
    const turn = timing(60_000, 0, 'block');
    const timings = new Map([
      ['a', turn],
      ['b', turn],
      ['c', turn],
    ]);
    const rank = new Map([
      ['a', 2],
      ['b', 0],
      ['c', 1],
    ]);
    const byRank = (x: { id: string }, y: { id: string }) => rank.get(x.id)! - rank.get(y.id)!;

    expect(
      sortClaimsBySpokenOrder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], timings, byRank).map(c => c.id)
    ).toEqual(['b', 'c', 'a']);
  });

  it('puts a claim with no moment at all last', () => {
    const timings = new Map([['timed', timing(90_000, 1, 'published')]]);

    expect(sortClaimsBySpokenOrder([{ id: 'untimed' }, { id: 'timed' }], timings).map(c => c.id)).toEqual([
      'timed',
      'untimed',
    ]);
  });
});

describe('isAssertableMoment', () => {
  const at = (confidence: number, source: ClaimTiming['source']): ClaimTiming => ({
    startMs: 1_000,
    endMs: 5_000,
    confidence,
    source,
  });

  it('admits a published offset and a confident match', () => {
    expect(isAssertableMoment(at(1, 'published'))).toBe(true);
    expect(isAssertableMoment(at(0.62, 'segment'))).toBe(true);
  });

  // The bug it exists for: the panel's timecode admitted any match, so a claim the live layer
  // refused to draw still printed a time to the second, indistinguishable from a published one.
  it('refuses a match too loose for the live layer', () => {
    expect(isAssertableMoment(at(0.47, 'segment'))).toBe(false);
    expect(isAssertableMoment(at(0.4, 'segment'))).toBe(false);
  });

  it('refuses a whole-turn fallback and a claim with no moment', () => {
    expect(isAssertableMoment(at(0, 'block'))).toBe(false);
    expect(isAssertableMoment(null)).toBe(false);
  });
});

describe('formatTimecode', () => {
  it('formats a timecode the way a player does', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(9_400)).toBe('0:09');
    expect(formatTimecode(134_600)).toBe('2:15');
    expect(formatTimecode(270_000)).toBe('4:30');
  });
});
