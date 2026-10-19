import type { DebateTranscriptSegment } from './api';
import { type ClaimTiming, LIVE_TIMING_CONFIDENCE, MAX_CLAIM_WINDOW_SEGMENTS, contentWords } from './claim-timing';
import type { TranscriptClaim } from './transcript-claims';

// Negation changes the assertion even when it is shared by every claim in a paragraph.
const NEGATIONS = new Set(['not', 'no', 'never', 'neither', 'nothing', 'nobody', 'none', 'nowhere', 'without']);
function refinementWords(text: string): string[] {
  const words = contentWords(text);
  // The general matcher drops two-letter words. Keep "no" locally for this refinement.
  return /\bno\b/i.test(text) ? [...words, 'no'] : words;
}

// Coordinating/constrasting clauses can assert opposite things without starting a new sentence.
const CLAUSE_BOUNDARY = /([.!?,;:]+|\b(?:and|but|or|yet|whereas|although|however|while|because|since)\b)/i;

/** Project clause polarity onto timed segments; opposing assertions stay ambiguous. */
function segmentPolarities(
  lines: readonly DebateTranscriptSegment[],
  relevantWords: ReadonlySet<string>
): Array<boolean | null> {
  const polarities = lines.map(() => new Set<boolean>());
  const touched = new Set<number>();
  let clause = '';
  const finishClause = () => {
    if (!touched.size) return;
    const words = refinementWords(clause);
    const negated = words.some(word => NEGATIONS.has(word));
    // An attribution such as "according to the evidence" is not a new positive assertion.
    // Keep every negation, but give unrelated non-asserting fragments no polarity vote.
    if (negated || words.some(word => relevantWords.has(word))) {
      for (const index of touched) polarities[index].add(negated);
    }
    clause = '';
    touched.clear();
  };
  for (const [index, line] of lines.entries()) {
    // Context may surround a published interval, but cannot come from another speaker.
    if (index > 0 && lines[index - 1].participant_slot !== line.participant_slot) finishClause();
    for (const part of line.text.split(CLAUSE_BOUNDARY)) {
      if (CLAUSE_BOUNDARY.test(part)) {
        // A punctuation-only segment can finish a clause from the preceding segment.
        if (clause && /[.!?,;:]/.test(part)) touched.add(index);
        finishClause();
      } else if (/[a-z0-9]/i.test(part)) {
        clause += ` ${part}`;
        touched.add(index);
      }
    }
  }
  finishClause();
  return polarities.map(values => (values.size === 1 ? values.has(true) : null));
}

/** Extraction can give several statements the end of their shared paragraph. */
export function groupedPublishedClaims(claims: readonly TranscriptClaim[]): TranscriptClaim[][] {
  const groups = new Map<string, TranscriptClaim[]>();
  for (const claim of claims) {
    if (!claim.publishedTiming || claim.restated) continue;
    const key = `${claim.blockId}:${claim.publishedTiming.endMs}`;
    const group = groups.get(key) ?? [];
    group.push(claim);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

/**
 * Narrow grouped paragraph offsets to their supporting transcript clauses. Both inputs must be
 * on the recordings' clock. Published bounds remain hard limits; uncertain matches keep them.
 * This places real claims independently rather than animating a counter through an invented count.
 */
export function refineGroupedClaimTimings(
  groups: readonly TranscriptClaim[][],
  timings: Map<string, ClaimTiming>,
  segments: readonly DebateTranscriptSegment[]
): Map<string, ClaimTiming> {
  if (!groups.length || !segments.length) return timings;
  const refined = new Map(timings);
  const ordered = [...segments].sort((a, b) => a.start_ms - b.start_ms);
  for (const group of groups) {
    const frequency = new Map<string, number>();
    for (const claim of group) {
      for (const word of new Set(refinementWords(claim.text))) {
        frequency.set(word, (frequency.get(word) ?? 0) + 1);
      }
    }
    // Read surrounding clause context before clipping candidate timestamps to published bounds.
    const context = segmentPolarities(ordered, new Set(frequency.keys()));
    const polarityBySegment = new Map(ordered.map((line, index) => [line, context[index]]));
    // Shared context such as "immigration policies" must not pull every statement to the same
    // later clause. Distinctive words such as "farms", "food prices" and "truckers" carry more weight.
    const weight = (word: string) => Math.log((group.length + 1) / (frequency.get(word) ?? 1));
    const sum = (words: Iterable<string>) => [...words].reduce((total, word) => total + weight(word), 0);
    for (const claim of group) {
      const published = timings.get(claim.id);
      if (!published || published.source !== 'published') continue;
      const lines = ordered.filter(line => line.start_ms >= published.startMs && line.end_ms <= published.endMs);
      const words = new Set(refinementWords(claim.text));
      const lineWords = lines.map(line => refinementWords(line.text));
      const available = new Set(lineWords.flat());
      const anchors = [...words].filter(word => frequency.get(word) === 1 && available.has(word));
      const negations = [...words].filter(word => NEGATIONS.has(word));
      const negatedClaim = negations.length > 0;
      const matchesPolarity = (start: number, end: number) =>
        lines.slice(start, end + 1).every(line => polarityBySegment.get(line) === negatedClaim);
      const total = sum(words);
      if (!total || anchors.length < 2) continue;
      let best: { start: number; end: number; score: number } | null = null;
      for (let start = 0; start < lines.length; start++) {
        const windowWords = new Set<string>();
        // Use the same six-segment limit as the fallback matcher, keeping matches local to a clause.
        for (let end = start; end < Math.min(start + MAX_CLAIM_WINDOW_SEGMENTS, lines.length); end++) {
          for (const word of lineWords[end]) windowWords.add(word);
          const hits = [...words].filter(word => windowWords.has(word));
          // Cover every distinctive word the paragraph actually contains, including its predicate
          // and negation. A matching subject alone must not count a claim before the assertion.
          if (
            !anchors.every(word => windowWords.has(word)) ||
            !negations.every(word => windowWords.has(word)) ||
            !matchesPolarity(start, end)
          )
            continue;
          const matched = sum(hits);
          const recall = matched / total;
          const precision = matched / sum(windowWords);
          const score = (2 * recall * precision) / (recall + precision);
          if (score >= LIVE_TIMING_CONFIDENCE && (!best || score > best.score)) best = { start, end, score };
        }
      }
      if (!best) continue;
      // Do not count mid-sentence just because the last identifying noun has been heard. Finish
      // the current clause when its punctuation lands within the next three short transcript lines.
      let end = best.end;
      const clauseEnded = (text: string) => {
        let lastSignal = 0;
        for (const token of text.matchAll(/[a-z0-9’‘']+/gi)) {
          if (refinementWords(token[0]).some(word => words.has(word))) lastSignal = token.index + token[0].length;
        }
        return /[.!?,;:]/.test(text.slice(lastSignal));
      };
      while (end < Math.min(best.end + 3, lines.length - 1) && !clauseEnded(lines[end].text)) end++;
      if (!clauseEnded(lines[end].text) || lines[end].end_ms >= published.endMs || !matchesPolarity(best.start, end))
        continue;
      refined.set(claim.id, {
        startMs: lines[best.start].start_ms,
        endMs: lines[end].end_ms,
        confidence: best.score,
        source: 'segment',
      });
    }
  }
  return refined;
}
