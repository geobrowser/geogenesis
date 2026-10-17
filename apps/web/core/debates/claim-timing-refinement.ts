import type { DebateTranscriptSegment } from './api';
import { type ClaimTiming, LIVE_TIMING_CONFIDENCE, contentWords } from './claim-timing';
import type { TranscriptClaim } from './transcript-claims';

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
      for (const word of new Set(contentWords(claim.text))) {
        frequency.set(word, (frequency.get(word) ?? 0) + 1);
      }
    }
    // Shared context such as "immigration policies" must not pull every statement to the same
    // later clause. Distinctive words such as "farms", "food prices" and "truckers" carry more weight.
    const weight = (word: string) => Math.log((group.length + 1) / (frequency.get(word) ?? 1));
    const sum = (words: Iterable<string>) => [...words].reduce((total, word) => total + weight(word), 0);
    for (const claim of group) {
      const published = timings.get(claim.id);
      if (!published || published.source !== 'published') continue;
      const lines = ordered.filter(line => line.start_ms >= published.startMs && line.end_ms <= published.endMs);
      const words = new Set(contentWords(claim.text));
      const available = new Set(lines.flatMap(line => contentWords(line.text)));
      const anchors = [...words].filter(word => frequency.get(word) === 1 && available.has(word));
      const total = sum(words);
      if (!total || anchors.length < 2) continue;
      let best: { start: number; end: number; score: number } | null = null;
      for (let start = 0; start < lines.length; start++) {
        const windowWords = new Set<string>();
        // Use the same six-segment limit as the fallback matcher, keeping matches local to a clause.
        for (let end = start; end < Math.min(start + 6, lines.length); end++) {
          for (const word of contentWords(lines[end].text)) windowWords.add(word);
          const hits = [...words].filter(word => windowWords.has(word));
          // Cover every distinctive word the paragraph actually contains, including its predicate
          // and negation. A matching subject alone must not count a claim before the assertion.
          if (!anchors.every(word => windowWords.has(word))) continue;
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
          if (contentWords(token[0]).some(word => words.has(word))) lastSignal = token.index + token[0].length;
        }
        return /[.!?,;:]/.test(text.slice(lastSignal));
      };
      while (end < Math.min(best.end + 3, lines.length - 1) && !clauseEnded(lines[end].text)) end++;
      if (!clauseEnded(lines[end].text) || lines[end].end_ms >= published.endMs) continue;
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
