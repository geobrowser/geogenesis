/**
 * How wrong is the matcher, at each confidence?
 *
 * The one debate with hand-checked published offsets is a ground-truth set: run the matcher on its
 * claims while *ignoring* what was published, and the difference between the two is the matcher's
 * real error. That is the only honest basis for choosing `LIVE_TIMING_CONFIDENCE` — the current
 * 0.55 was eyeballed against the same debate without measuring the error either side of it.
 *
 * The card now appears at the claim's end, so the end offset is the number that matters.
 *
 * Usage: bun scripts/calibrate-match-score.ts [debateEntityId] [spaceId]
 */
import { findBlockWindow, matchClaimWindow } from '../core/debates/claim-timing';
import { fetchDebateClaims, fetchTranscriptSegments } from './lib/debate-claims';

const DEBATE = (process.argv[2] ?? '01a0a60772dc7cb09bf6ebba15e97b67').replaceAll('-', '');
const SPACE = process.argv[3] ?? '4582fbbee28a16589154f7e36f1ee3c5';

const claims = await fetchDebateClaims(DEBATE, SPACE);
const segments = await fetchTranscriptSegments(DEBATE);
const ordered = [...segments].sort((a, b) =>
  a.start_ms === b.start_ms ? a.sequence_index - b.sequence_index : a.start_ms - b.start_ms
);
const blocksById = new Map(claims.blocks.map(block => [block.id, block]));

type Row = { confidence: number; endErrorMs: number; startErrorMs: number; text: string };
const rows: Row[] = [];

for (const claim of claims.all) {
  if (!claim.publishedTiming) continue;
  const block = blocksById.get(claim.blockId);
  if (!block) continue;
  const window = findBlockWindow(block.text, ordered);
  if (!window) continue;
  const matched = matchClaimWindow(claim.text, ordered, window);
  if (!matched) continue;

  rows.push({
    confidence: matched.confidence,
    endErrorMs: Math.abs(matched.endMs - claim.publishedTiming.endMs),
    startErrorMs: Math.abs(matched.startMs - claim.publishedTiming.startMs),
    text: claim.text,
  });
}

rows.sort((a, b) => b.confidence - a.confidence);

console.log(`ground-truth claims: ${rows.length}\n`);
console.log(' score   end err   start err   claim');
for (const row of rows) {
  console.log(
    `  ${row.confidence.toFixed(2)}   ${(row.endErrorMs / 1000).toFixed(1).padStart(6)}s   ` +
      `${(row.startErrorMs / 1000).toFixed(1).padStart(6)}s   ${row.text.slice(0, 50)}`
  );
}

console.log('\nif the bar were set here, what would surface and how wrong would it be:');
console.log('  bar   claims   worst end err   median end err');
for (const bar of [0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7]) {
  const kept = rows.filter(row => row.confidence >= bar);
  if (kept.length === 0) {
    console.log(`  ${bar.toFixed(2)}        0             —               —`);
    continue;
  }
  const errors = kept.map(row => row.endErrorMs).sort((a, b) => a - b);
  const median = errors[Math.floor(errors.length / 2)];
  console.log(
    `  ${bar.toFixed(2)}   ${String(kept.length).padStart(6)}   ${(errors.at(-1)! / 1000).toFixed(1).padStart(11)}s   ${(median / 1000).toFixed(1).padStart(12)}s`
  );
}
