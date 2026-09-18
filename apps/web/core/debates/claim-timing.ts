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
 * Measured against the test debate, where every claim above this was placed on the right sentence.
 * Below it the match is usually still in the right region but can start several seconds early, and
 * a card that pops early tells a viewer a debater said something they had not yet said.
 */
export const LIVE_TIMING_CONFIDENCE = 0.55;

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
 */
const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'all', 'also', 'and', 'any', 'are', 'because', 'been',
  'being', 'both', 'but', 'can', 'claim', 'could', 'did', 'does', 'doing', 'done', 'down', 'each',
  'even', 'every', 'for', 'from', 'get', 'going', 'had', 'has', 'have', 'her', 'here', 'him', 'his',
  'how', 'into', 'its', 'just', 'know', 'like', 'look', 'made', 'make', 'many', 'may', 'mean',
  'might', 'more', 'most', 'much', 'must', 'not', 'now', 'off', 'one', 'only', 'other', 'our',
  'out', 'over', 'own', 'point', 'really', 'said', 'same', 'say', 'see', 'she', 'should', 'some',
  'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'thing',
  'things', 'think', 'this', 'those', 'through', 'too', 'two', 'under', 'use', 'very', 'want',
  'was', 'way', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will',
  'with', 'would', 'yeah', 'yes', 'you', 'your',
]);

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
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

/** `2:05`, for a timecode chip. */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
