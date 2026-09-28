import type { DebateTranscriptSegment } from './api';
import type { TranscriptBlock, TranscriptClaim } from './transcript-claims';

/**
 * Where a claim's moment on the debate timeline came from, best first.
 *
 * - `published` — read off the block → claim relation entity. Exact, and free.
 * - `segment` — matched against the Whisper transcript. Right span, a second or two loose at the
 *   edges, and it carries a confidence.
 * - `block` — only the turn is known, so the claim is placed across the whole turn. Coarse but
 *   never wrong.
 *
 * The resolver tries them in that order, so a debate published before timecodes existed still gets
 * an answer and silently improves the day offsets land for it. Nothing above this module knows
 * which source answered; surfaces read `confidence` and decide how much to trust it.
 */
export type ClaimTimingSource = 'published' | 'segment' | 'block';

export type ClaimTiming = {
  /** Milliseconds from the start of the debate timeline. */
  startMs: number;
  endMs: number;
  /**
   * How much to trust it: 1 for published, the match score for `segment`, 0 for `block`.
   * See {@link LIVE_TIMING_CONFIDENCE}.
   */
  confidence: number;
  source: ClaimTimingSource;
};

export type TimedClaim = TranscriptClaim & { timing: ClaimTiming | null };

/**
 * The bar a timing has to clear before a surface may state it — see {@link isAssertableMoment}.
 *
 * 0.40, from reading 59 matched claims across five debates against their transcripts — printed by
 * `scripts/dump-match-windows.ts`, which puts each claim beside the window it matched and the whole
 * turn it came from — plus the 13 hand-checked claims `scripts/calibrate-match-score.ts` measures. Everything from 0.40 to 0.55 was right
 * 20 times out of 22 — nine of nine in the 0.40–0.44 band alone — so the 0.55 this started at was
 * discarding claims placed exactly correctly. Below 0.30 it degrades sharply: windows collapse to
 * one or two content words and land in an arbitrary part of the turn.
 *
 * Worth knowing what the number is actually measuring. The score is containment of the claim's
 * content words, so it tracks *how closely the extractor echoed the speech*, not how likely the
 * match is right — a faithful paraphrase of a long sentence scores low for using different words.
 * That is why it separates so weakly across its middle, and why the one error above this bar is one
 * no threshold catches: the claim's specifics were not in its turn at all.
 *
 * The matcher is the fallback. Where an LLM has read the turn and chosen the span, or the extractor
 * has published one, that answer is used instead — see GEO-2958.
 */
export const LIVE_TIMING_CONFIDENCE = 0.4;

/**
 * Whether a timing is firm enough to *state* — "Said at 2:29", a card over the video.
 *
 * One predicate for every surface that puts a moment in front of a reader, because they were
 * disagreeing. The live layer asked for {@link LIVE_TIMING_CONFIDENCE} while the panel's timecode
 * asked only that the claim was matched at all, so a 0.40 match — judged too loose to draw over
 * the video — still printed a time to the second, and read exactly as authoritative as a published
 * offset. The weaker evidence was making the more precise claim.
 *
 * Ordering deliberately does not go through here. A list has to put a claim *somewhere*, and a
 * rough position in a list asserts far less than a timestamp does, so
 * {@link sortClaimsBySpokenOrder} uses any usable match and leaves the rest grouped by their turn.
 */
export function isAssertableMoment(timing: ClaimTiming | null): timing is ClaimTiming {
  // `block` scores zero, so the whole-turn fallback is excluded by the threshold itself.
  return timing !== null && timing.confidence >= LIVE_TIMING_CONFIDENCE;
}

/**
 * Below this the match is not worth keeping at all and the claim falls back to its turn.
 *
 * Deliberately not zero: the best window always scores something, and a near-zero score means the
 * extractor's paraphrase shares almost no vocabulary with the turn — at which point the whole turn
 * is a more honest answer than a confidently wrong five seconds.
 */
const USABLE_TIMING_CONFIDENCE = 0.35;

/** How many consecutive segments a claim may span. Whisper segments here run 1–3 seconds. */
const MAX_WINDOW_SEGMENTS = 6;

/**
 * Words carrying no identifying signal, dropped before scoring.
 *
 * Skewed towards the vocabulary of argument rather than a general stopword list: "claim", "think"
 * and "point" appear in most turns of most debates and match everything, which is the same problem
 * "the" has.
 *
 * One rule governs what may *not* go in here: **a word whose opposite is scored must be scored
 * too.** Drop one half of a polarity pair and the matcher can no longer tell the halves apart, so
 * it will happily place a claim over the sentence that says the reverse — and this layer's whole
 * job is pointing at the moment a particular thing was said.
 *
 * Three pairs were broken that way. `not` was dropped while `never`, `no`, `cannot`, `nothing`,
 * `neither` and `without` were all kept, so "X is safe" and "X is not safe" scored identically.
 * `more` and `most` were dropped while `less`, `fewer` and `least` were kept. `many` was dropped
 * while `few` was kept. All four are now scored.
 *
 * Measured over the 852 matchable claims: 54 windows move, 35 of them on claims containing a
 * negator, and the scores barely shift in aggregate — 131 rise, 147 fall, 574 unchanged, 13 claims
 * newly clear the 0.40 bar and 7 newly fall below it. Cheap in score, and the 54 moves are the
 * point: those are the claims the matcher was free to place against their own opposite.
 *
 * Modals are the deliberate exception. `can`, `could`, `may`, `might`, `must`, `should`, `will`
 * and `would` are *all* dropped, so no pair is broken — a claim's modality is invisible to the
 * matcher, which is symmetric and merely lossy rather than wrong.
 */
const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'all',
  'also',
  'and',
  'any',
  'are',
  'because',
  'been',
  'being',
  'both',
  'but',
  'can',
  'claim',
  'could',
  'did',
  'does',
  'doing',
  'done',
  'down',
  'each',
  'even',
  'every',
  'for',
  'from',
  'get',
  'going',
  'had',
  'has',
  'have',
  'her',
  'here',
  'him',
  'his',
  'how',
  'into',
  'its',
  'just',
  'know',
  'like',
  'look',
  'made',
  'make',
  'may',
  'mean',
  'might',
  'much',
  'must',
  'now',
  'off',
  'one',
  'only',
  'other',
  'our',
  'out',
  'over',
  'own',
  'point',
  'really',
  'said',
  'same',
  'say',
  'see',
  'she',
  'should',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'thing',
  'things',
  'think',
  'this',
  'those',
  'through',
  'too',
  'two',
  'under',
  'use',
  'very',
  'want',
  'was',
  'way',
  'well',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'yeah',
  'yes',
  'you',
  'your',
]);

/**
 * The negators English hides inside a verb, pulled back out as their own word.
 *
 * `wasn't` tokenises as one opaque word, so it is neither `was` nor `not` — which breaks the rule
 * the {@link STOPWORDS} doc states: *a word whose opposite is scored must be scored*. The halves of
 * the pair stop being comparable, and the matcher is free to place a claim over its own opposite.
 *
 * It is worse than a tie, because the miss costs twice. Scoring "vaccination was not safe":
 *
 * ```
 * "vaccination was safe"     hits 2/3, precision 2/2 -> 0.6667
 * "vaccination wasn't safe"  hits 2/3, precision 2/3 -> 0.6111
 * ```
 *
 * The negated window not only fails to match the claim's `not`, it carries an extra content word
 * that dilutes its precision — so the *affirmative* wins, and the card would quote the speaker
 * saying the reverse of what they said.
 *
 * The corpus makes this one-directional rather than a coin toss. Measured over the 66 task files:
 * **no claim contracts** — the extractor writes "does not", "did not" — while **248 of 7,633
 * segments do**, because people speak in contractions. 90 claims say "not" in a turn that contracts
 * it. So the error only ever ran one way: towards the affirmative.
 *
 * Curly apostrophes are folded first for the same reason. `wasn’t` does not even survive
 * tokenisation — `[a-z0-9']` splits it into `wasn` and `t` — so it would miss this expansion and
 * contribute a junk content word instead. None appear in the corpus today; the two sources are a
 * Whisper transcript and an LLM, and neither is under our control.
 *
 * `can't` and `won't` leave `ca` and `wo` behind, which are under the length floor and dropped.
 *
 * `cannot` is the same fault with no apostrophe to find it by, and it runs in both directions:
 * a claim saying "cannot" scored 0.667 against "can be safe" and 0.611 against "can't be safe",
 * while a claim saying "can't" scored 0.667 against "can be safe" and 0.611 against "cannot be
 * safe". Whichever spelling each side picked, the affirmative won. It is folded to "can not".
 *
 * The apostrophe suffixes go for a related reason, one door further along. STOPWORDS holds `it`,
 * `that`, `we`, `there`, `i` — but not `it's`, `that's`, `we're`, `there's`, `i'm`, because the
 * apostrophe makes them a different token. They therefore survived as *content words*, and only on
 * the speech side, since the extractor does not contract: `it's` 281 times in the corpus, `that's`
 * 143, `i'm` 82, `there's` 76, `we're` 66. Each one is a distinct word in the window that no claim
 * can ever match, so it cut that window's precision — the same one-directional penalty on speech
 * that sounds like speech. Possessives fold the same way and want to: `person's` is `person`.
 */
function normalizeWordForms(text: string): string {
  return (
    text
      // Curly to straight, first, or nothing below matches.
      .replace(/[’‘]/g, "'")
      // The one negator with no apostrophe to find it by.
      .replace(/\bcannot\b/g, 'can not')
      .replace(/n't\b/g, ' not')
      // Apostrophe suffixes carry no content: the stem is either the word that matters
      // (`person's` -> `person`) or a stopword that should have been dropped (`it's` -> `it`).
      .replace(/'(s|re|ve|ll|d|m)\b/g, '')
  );
}

function words(text: string): string[] {
  return normalizeWordForms(text.toLowerCase()).match(/[a-z0-9']+/g) ?? [];
}

/** The words worth matching on: not stopwords, and long enough to mean something. */
export function contentWords(text: string): string[] {
  return words(text).filter(word => word.length > 2 && !STOPWORDS.has(word));
}

/** Whitespace- and punctuation-insensitive form, for comparing a block against its segments. */
function normalize(text: string): string {
  return words(text).join(' ');
}

/** Segments on the debate timeline, earliest first. */
function inTimeOrder(segments: DebateTranscriptSegment[]): DebateTranscriptSegment[] {
  return [...segments].sort((a, b) =>
    a.start_ms === b.start_ms ? a.sequence_index - b.sequence_index : a.start_ms - b.start_ms
  );
}

export type SegmentWindow = { startIndex: number; endIndex: number };

/**
 * The run of consecutive segments whose text is this transcript block.
 *
 * Not a fuzzy match, and it does not need to be: publishing builds a block by joining consecutive
 * same-speaker Whisper segments, so the block's text *is* that run, modulo the whitespace and
 * punctuation `normalize` removes. On the test debate all six blocks matched exactly.
 *
 * The prefix fallback covers a block whose tail was edited or truncated after publishing — better
 * to place the turn slightly short than to drop every claim in it. A block that matches nothing
 * returns null and its claims end up untimed, which surfaces as "no moment known" rather than a
 * guess.
 */
export function findBlockWindow(blockText: string, segments: DebateTranscriptSegment[]): SegmentWindow | null {
  const target = normalize(blockText);
  if (target.length === 0) return null;

  let bestPrefix: (SegmentWindow & { length: number }) | null = null;

  for (let start = 0; start < segments.length; start += 1) {
    let joined = '';

    for (let end = start; end < segments.length; end += 1) {
      const next = normalize(segments[end].text);
      joined = joined.length === 0 ? next : `${joined} ${next}`;

      // Past the target's length this run can only get further away.
      if (joined.length > target.length) break;
      if (joined === target) return { startIndex: start, endIndex: end };

      if (target.startsWith(joined) && (bestPrefix === null || joined.length > bestPrefix.length)) {
        bestPrefix = { startIndex: start, endIndex: end, length: joined.length };
      }
    }
  }

  // Only trust a partial block match once it accounts for most of the turn.
  if (bestPrefix && bestPrefix.length >= target.length * 0.6) {
    return { startIndex: bestPrefix.startIndex, endIndex: bestPrefix.endIndex };
  }

  return null;
}

/**
 * How well a window of transcript text accounts for a claim, in [0, 1].
 *
 * Containment, not similarity: the claim is an extractor paraphrase, so it will not share a
 * sentence shape with what was said, but its content words will nearly all appear in the seconds
 * where it was said. Precision is mixed in at a quarter weight purely to break ties towards the
 * tightest window — without it a six-segment window contains everything a one-segment window does
 * and always wins, and the claim gets placed across the whole turn.
 */
export function scoreWindow(claimWords: string[], windowText: string): number {
  if (claimWords.length === 0) return 0;

  const windowWords = new Set(contentWords(windowText));
  if (windowWords.size === 0) return 0;

  // Distinct words on both sides. Counting a repeated claim word once per occurrence let `hits`
  // exceed the number of distinct words in the window, which pushed `precision` — a ratio of one
  // set's size to another's — above 1 and the whole score past the [0, 1] this documents. A claim
  // that says "AI" three times was scoring 1.05 and outranking a claim that said it once.
  const distinct = new Set(claimWords);
  const hits = [...distinct].reduce((count, word) => (windowWords.has(word) ? count + 1 : count), 0);
  const containment = hits / distinct.size;
  const precision = hits / windowWords.size;

  return containment * (0.75 + 0.25 * precision);
}

/** The best-scoring window of consecutive segments within `[lo, hi]`, or null if there is none. */
export function matchClaimWindow(
  claimText: string,
  segments: DebateTranscriptSegment[],
  window: SegmentWindow
): (ClaimTiming & { source: 'segment' }) | null {
  const claimWords = contentWords(claimText);
  if (claimWords.length === 0) return null;

  let best: (ClaimTiming & { source: 'segment' }) | null = null;

  for (let start = window.startIndex; start <= window.endIndex; start += 1) {
    let text = '';

    for (let end = start; end <= Math.min(start + MAX_WINDOW_SEGMENTS - 1, window.endIndex); end += 1) {
      text = text.length === 0 ? segments[end].text : `${text} ${segments[end].text}`;
      const confidence = scoreWindow(claimWords, text);

      if (best === null || confidence > best.confidence) {
        best = {
          startMs: segments[start].start_ms,
          endMs: segments[end].end_ms,
          confidence,
          source: 'segment',
        };
      }
    }
  }

  return best;
}

export type ResolveClaimTimingsInput = {
  claims: TranscriptClaim[];
  blocks: TranscriptBlock[];
  /** The debate's Whisper transcript. Empty until it loads, or for a debate that has none. */
  segments: DebateTranscriptSegment[];
};

/**
 * Every claim's moment on the debate timeline, keyed by claim id.
 *
 * A claim with no published timecodes and no locatable block is absent from the map rather than
 * given a zero, so callers can tell "at the start" from "unknown".
 */
export function resolveClaimTimings({ claims, blocks, segments }: ResolveClaimTimingsInput): Map<string, ClaimTiming> {
  const timings = new Map<string, ClaimTiming>();
  const ordered = inTimeOrder(segments);

  // One block window per block, not per claim: locating a block is the expensive half, and a turn
  // with five claims would otherwise pay for it five times.
  const windows = new Map<string, SegmentWindow | null>();
  const blocksById = new Map(blocks.map(block => [block.id, block]));

  const windowFor = (blockId: string): SegmentWindow | null => {
    if (windows.has(blockId)) return windows.get(blockId) ?? null;
    const block = blocksById.get(blockId);
    const window = block && ordered.length > 0 ? findBlockWindow(block.text, ordered) : null;
    windows.set(blockId, window);
    return window;
  };

  for (const claim of claims) {
    // Two turns, one deduped row: the block, the offsets and the relation entity on it all belong
    // to whichever turn was read first, so any moment resolved here would be one of two and there
    // is no way to tell which. Declining leaves the claim in the panel and out of the live layer,
    // which is where a claim whose speaker cannot be established already goes. See `restated`.
    if (claim.restated) continue;

    if (claim.publishedTiming) {
      timings.set(claim.id, { ...claim.publishedTiming, confidence: 1, source: 'published' });
      continue;
    }

    const window = windowFor(claim.blockId);
    if (!window) continue;

    const matched = matchClaimWindow(claim.text, ordered, window);
    if (matched && matched.confidence >= USABLE_TIMING_CONFIDENCE) {
      timings.set(claim.id, matched);
      continue;
    }

    timings.set(claim.id, {
      startMs: ordered[window.startIndex].start_ms,
      endMs: ordered[window.endIndex].end_ms,
      confidence: 0,
      source: 'block',
    });
  }

  return timings;
}

/**
 * Claims in the order they were actually said, which is not the order the graph returns them in.
 *
 * Relations are published with random positions (see `transcript-claims.ts`), so this is the only
 * way to get chronological order. Claims with no known moment keep their incoming order and sit at
 * the end, where a list that is mostly chronological is still useful.
 */
export function claimsInSpokenOrder(claims: TranscriptClaim[], timings: Map<string, ClaimTiming>): TimedClaim[] {
  return sortClaimsBySpokenOrder(claims, timings).map(claim => ({ ...claim, timing: timings.get(claim.id) ?? null }));
}

/** A claim with no moment at all sorts after every claim that has one. */
const momentOf = (timing: ClaimTiming | null) => timing?.startMs ?? Number.MAX_SAFE_INTEGER;

/**
 * Claims in the order they were said.
 *
 * Any usable match counts here, not only the firm ones {@link isAssertableMoment} admits: a list
 * has to put every claim somewhere, and where it lands says far less than a printed timecode does.
 * A match too loose even for that was already discarded by the resolver, which falls back to the
 * claim's own turn — so a claim nothing could be recovered for still sorts into the turn it was
 * made in, which is the answer the transcript block gives.
 *
 * All the claims of one turn therefore share a moment and tie. `tiebreak` decides those, since
 * nothing about *when* can: the order they arrive in is relation `position`, which
 * `debate-publish-draft.ts` fills with `Position.generate()` — random, not monotonic — so leaving
 * ties to arrival order is leaving them to a shuffle.
 */
export function sortClaimsBySpokenOrder<T extends { id: string }>(
  claims: T[],
  timings: Map<string, ClaimTiming>,
  tiebreak: (a: T, b: T) => number = () => 0
): T[] {
  return claims
    .map((claim, index) => ({ claim, index, moment: momentOf(timings.get(claim.id) ?? null) }))
    .sort((a, b) => a.moment - b.moment || tiebreak(a.claim, b.claim) || a.index - b.index)
    .map(entry => entry.claim);
}

/**
 * `2:05`, for a timecode chip.
 *
 * Hours only when there are hours: `12:04` rather than `00:12:04`, and `1:02:04` once a debate runs
 * past the hour — which the first version of this did not do, printing a claim an hour in as
 * `62:04`. Minutes keep their leading zero inside an hour-long stamp so the columns line up.
 *
 * Rounds to the nearest second rather than flooring, because this is a label rather than a seek
 * target; `debateSeekSeconds` is what decides where the video actually lands.
 */
export function formatTimecode(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';

  const total = Math.round(ms / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours === 0) return `${minutes}:${paddedSeconds}`;

  return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
}
