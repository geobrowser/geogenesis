/**
 * End-to-end check of the claim timing resolver against a live testnet debate.
 *
 * Runs the real grouping, the real resolver and the real ticker selection over the real published
 * data, so the answer is what the UI will draw rather than what a fixture says.
 *
 * Usage: bun scripts/verify-claim-timing.ts [debateEntityId] [spaceId]
 */
import { claimMarkers, tickerStack, tickerWindows } from '../core/debates/claim-ticker';
import {
  claimsInSpokenOrder,
  formatTimecode,
  isAssertableMoment,
  resolveClaimTimings,
} from '../core/debates/claim-timing';
import { fetchDebateClaims, fetchTranscriptSegments } from './lib/debate-claims';

// Any debate, so the resolver can be checked where offsets were *not* published as well as where
// they were — the fallback path is the one that runs on every debate but the test one.
const DEBATE_ENTITY = (process.argv[2] ?? '01a0a60772dc7cb09bf6ebba15e97b67').replaceAll('-', '');
const SPACE = process.argv[3] ?? '4582fbbee28a16589154f7e36f1ee3c5';

const claims = await fetchDebateClaims(DEBATE_ENTITY, SPACE);
console.log(`claims: ${claims.totalCount}   blocks: ${claims.blocks.length}`);
console.log(`with published timecodes: ${claims.all.filter(claim => claim.publishedTiming !== null).length}`);

const segments = await fetchTranscriptSegments(DEBATE_ENTITY);
console.log(`transcript segments: ${segments.length}`);

const timings = resolveClaimTimings({ claims: claims.all, blocks: claims.blocks, segments });
const ordered = claimsInSpokenOrder(claims.all, timings);

console.log('\nAs the UI will order and label them:');
for (const claim of ordered) {
  const timing = claim.timing;
  const at = timing ? formatTimecode(timing.startMs) : ' — ';
  const source = timing ? timing.source : 'none';
  const score = timing ? timing.confidence.toFixed(2) : ' -- ';
  console.log(`  ${at.padStart(5)}  [${source.padEnd(9)} ${score}]  ${claim.text.slice(0, 60)}`);
}

// The two gates, spelled out. A claim with no published offsets can still clear both on the
// strength of its transcript match alone — which is the fallback working, and also the thing worth
// knowing about, since neither surface distinguishes an inferred moment from a published one.
const bySource = new Map<string, number>();
for (const claim of ordered)
  bySource.set(claim.timing?.source ?? 'none', (bySource.get(claim.timing?.source ?? 'none') ?? 0) + 1);
console.log(`\nby source: ${[...bySource].map(([key, count]) => `${key}=${count}`).join('  ')}`);
const assertable = ordered.filter(claim => isAssertableMoment(claim.timing)).length;
console.log(`firm enough to state — timecode, live card: ${assertable} of ${ordered.length}`);
// Counted directly, not as `segments - assertable`: `assertable` spans every source, and a
// published timing scores 1, so on a fully published debate that subtraction printed 0 − 13.
const belowBar = ordered.filter(
  claim => claim.timing?.source === 'segment' && !isAssertableMoment(claim.timing)
).length;
console.log(`used for ordering only (matched, below the bar): ${belowBar}`);

const windows = tickerWindows(ordered);
console.log(`\nticker-eligible claims: ${windows.length} of ${ordered.length}`);

/**
 * The debate's own length, taken from the transcript.
 *
 * This was hard-coded to 270s while the script accepts any debate id, so every marker's `fraction`
 * was scaled against the wrong timeline and the playback sample stopped at 4:30 — on a longer
 * debate it silently checked the first four and a half minutes and called that the UI.
 */
const timelineMs = segments.reduce((end, segment) => Math.max(end, segment.end_ms), 0);
if (timelineMs === 0) {
  console.log('\nno transcript, so no timeline to place markers on — stopping here.');
  process.exit(0);
}
console.log(`timeline: ${(timelineMs / 1000).toFixed(0)}s`);

const markers = claimMarkers(ordered, timelineMs);
console.log(`scrubber markers: ${markers.length}`);

console.log('\nWhat the viewer sees, sampled every 10s:');
for (let ms = 0; ms <= timelineMs; ms += 10_000) {
  const stack = tickerStack(windows, ms);
  for (const card of stack) {
    console.log(
      `  ${formatTimecode(ms).padStart(5)}  [${card.opacity.toFixed(2)}]  ${card.window.claim.text.slice(0, 56)}`
    );
  }
}

const missing = ordered.filter(claim => claim.timing === null);
console.log(`\nclaims with no moment at all: ${missing.length}`);
