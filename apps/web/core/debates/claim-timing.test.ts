import { describe, expect, it } from 'vitest';

import type { DebateTranscriptSegment } from './api';
import {
  type ClaimTiming,
  LIVE_TIMING_CONFIDENCE,
  claimsInSpokenOrder,
  contentWords,
  findBlockWindow,
  formatTimecode,
  isAssertableMoment,
  matchClaimWindow,
  resolveClaimTimings,
  scoreWindow,
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
  return {
    id,
    text,
    spaceId: 'space-1',
    blockId: 'block-1',
    publishedTiming: null,
    relationEntityId: null,
    restated: false,
    ...overrides,
  };
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

  /**
   * A claim stated in two turns is one deduped row carrying one turn's block and offsets, so any
   * moment resolved for it would be one of two with no way to tell which. Declining keeps it in the
   * panel and out of the live layer, where a card would otherwise be drawn over the wrong face.
   */
  it('gives no timing to a claim stated in two turns, published offsets included', () => {
    const timings = resolveClaimTimings({
      claims: [
        claim('restated', 'Said in two turns', { publishedTiming: { startMs: 1_000, endMs: 2_000 }, restated: true }),
        claim('ordinary', 'Said once', { publishedTiming: { startMs: 3_000, endMs: 4_000 } }),
      ],
      blocks: [],
      segments: [],
    });

    expect(timings.has('restated')).toBe(false);
    expect(timings.get('ordinary')).toMatchObject({ startMs: 3_000, source: 'published' });
  });

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
      ['loose', timing(10_000, 0.28, 'segment')],
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

    expect(sortClaimsBySpokenOrder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], timings, byRank).map(c => c.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('puts a claim with no moment at all last', () => {
    const timings = new Map([['timed', timing(90_000, 1, 'published')]]);

    expect(sortClaimsBySpokenOrder([{ id: 'untimed' }, { id: 'timed' }], timings).map(c => c.id)).toEqual([
      'timed',
      'untimed',
    ]);
  });
});

describe('scoreWindow', () => {
  // Found while planning the backfill: two claims scored 1.05 and 1.03, which a function
  // documented as returning [0, 1] cannot do. A repeated claim word was counted once per
  // occurrence against a *set* of window words, so `hits` could exceed the window's distinct-word
  // count and push the precision term above 1 — inflating a repetitive claim over a tighter match.
  it('never scores above 1, however often a claim repeats a word', () => {
    const repetitive = ['ai', 'ai', 'ai', 'therapist'];

    expect(scoreWindow(repetitive, 'ai therapist')).toBeLessThanOrEqual(1);
  });

  it('scores a perfect, tight match at 1', () => {
    expect(scoreWindow(['executive', 'orders'], 'executive orders')).toBe(1);
  });

  it('scores nothing for a window sharing no content words', () => {
    expect(scoreWindow(['executive', 'orders'], 'the weather today')).toBe(0);
  });

  /**
   * The polarity rule, through the other door.
   *
   * `wasn't` used to tokenise as one opaque word — neither `was` nor `not` — so a claim's `not` had
   * nothing to match and the negated window carried a spare content word that cut its precision.
   * The affirmative therefore *outscored* the negation, 0.6667 to 0.6111, and the matcher would
   * place the claim over the speaker saying the reverse.
   */
  it('scores a negation above its own opposite, however the speaker contracted it', () => {
    const claim = contentWords('vaccination was not safe');

    for (const spoken of ["vaccination wasn't safe", 'vaccination was not safe', 'vaccination wasn\u2019t safe']) {
      expect(scoreWindow(claim, spoken)).toBeGreaterThan(scoreWindow(claim, 'vaccination was safe'));
    }
  });

  // `can't` and `won't` leave a two-letter stem, which the length floor drops — the negator is what
  // has to survive.
  it('recovers the negator from contractions that do not split cleanly', () => {
    expect(contentWords("we can't regulate it")).toContain('not');
    expect(contentWords("we won't regulate it")).toContain('not');
  });

  /**
   * `cannot` is the same fault with no apostrophe to find it by, and it ran in both directions:
   * whichever of the three spellings each side used, the affirmative outscored the negation.
   */
  it('reads every spelling of a negated "can" the same way', () => {
    const spellings = ['vaccination cannot be safe', "vaccination can't be safe", 'vaccination can not be safe'];

    for (const claimText of spellings) {
      const claim = contentWords(claimText);
      for (const spoken of spellings) {
        expect(scoreWindow(claim, spoken)).toBe(1);
      }
      expect(scoreWindow(claim, 'vaccination can be safe')).toBeLessThan(1);
    }
  });

  /**
   * STOPWORDS holds `it` and `that` but not `it's` and `that's`, so the apostrophe smuggled them
   * past as content words — and only on the speech side, since the extractor does not contract.
   * Each one was a distinct window word no claim could match, cutting that window's precision.
   */
  it('does not let a contracted stopword count as content', () => {
    expect(contentWords("it's true")).toEqual(['true']);
    expect(contentWords("that's true")).toEqual(['true']);
    expect(contentWords("we're right")).toEqual(['right']);
    expect(contentWords("there's a problem")).toEqual(['problem']);
    expect(contentWords("i'm certain")).toEqual(['certain']);
  });

  // Possessives fold to the thing possessed, which is the word that carries the meaning.
  it('reads a possessive as the word it is built from', () => {
    // Order follows the sentence, so compare the sets rather than the sequences.
    expect(contentWords("a person's health").sort()).toEqual(contentWords('the health of a person').sort());
  });

  // The quarter-weight precision term exists to break ties towards the tightest window: a wide
  // window contains everything a narrow one does, so without it the widest always wins.
  it('prefers the tighter of two windows that both contain the claim', () => {
    const claim = ['executive', 'orders'];
    const tight = scoreWindow(claim, 'executive orders');
    const wide = scoreWindow(claim, 'executive orders and a great many other unrelated matters besides');

    expect(tight).toBeGreaterThan(wide);
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

  // The bar is 0.40, from reading 59 matched claims against their transcripts — the 0.40–0.44 band
  // was right nine times out of nine, so a claim scoring 0.42 is a claim the old 0.55 threw away.
  it('admits the band the calibration cleared', () => {
    expect(isAssertableMoment(at(0.42, 'segment'))).toBe(true);
    expect(isAssertableMoment(at(0.4, 'segment'))).toBe(true);
  });

  // Below the bar the windows collapse to a word or two in an arbitrary part of the turn. The
  // panel's timecode used to admit these, printing a time to the second on evidence the live layer
  // would not draw at all.
  it('refuses a match too loose for the live layer', () => {
    expect(isAssertableMoment(at(0.34, 'segment'))).toBe(false);
    expect(isAssertableMoment(at(0.17, 'segment'))).toBe(false);
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

  // The hour cases are why there is one of these rather than two: the first version printed a claim
  // an hour into a debate as `62:04`.
  it('grows an hours field only once there are hours', () => {
    expect(formatTimecode(724_000)).toBe('12:04');
    expect(formatTimecode(4_000)).toBe('0:04');
    expect(formatTimecode(3_724_000)).toBe('1:02:04');
    expect(formatTimecode(3_600_000)).toBe('1:00:00');
  });

  it('degrades to zero rather than printing NaN for a corrupt offset', () => {
    expect(formatTimecode(Number.NaN)).toBe('0:00');
    expect(formatTimecode(-1)).toBe('0:00');
  });
});

/**
 * The rule the stopword list has to keep: a word whose opposite is scored must be scored too.
 * Drop one half of a pair and the matcher cannot tell "X is safe" from "X is not safe", and will
 * place the claim over whichever window it meets first.
 */
describe('contentWords keeps both halves of a polarity pair', () => {
  const pairs: [string, string][] = [
    ['not', 'never'],
    ['more', 'less'],
    ['most', 'least'],
    ['many', 'few'],
  ];

  for (const [word, opposite] of pairs) {
    it(`scores "${word}" as well as "${opposite}"`, () => {
      expect(contentWords(`funding is ${word} available`)).toContain(word);
      expect(contentWords(`funding is ${opposite} available`)).toContain(opposite);
    });
  }

  // The claim and its reverse must not reduce to the same set, which is what let the matcher
  // choose between them arbitrarily.
  it('tells a claim apart from its negation', () => {
    expect(contentWords('vaccination was safe')).not.toEqual(contentWords('vaccination was not safe'));
  });

  // Modality is dropped on purpose, and symmetrically, so no pair is broken.
  it('drops every modal, so none outranks another', () => {
    for (const modal of ['can', 'could', 'may', 'might', 'must', 'should', 'will', 'would']) {
      expect(contentWords(`funding ${modal} arrive`)).not.toContain(modal);
    }
  });
});
