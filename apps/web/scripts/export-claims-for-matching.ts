/**
 * Exports every unplaced claim with the transcript of the turn it was made in, as one task file per
 * debate, for an LLM to read and place.
 *
 * The matcher scores word overlap, which tracks how closely the extractor echoed the speech rather
 * than whether the match is right — measured over 59 claims, it is wrong about 1 in 22 even above
 * its bar, and it cannot tell "the window is misplaced" from "this turn does not contain the claim".
 * Reading the turn answers both. This produces the reading material.
 *
 * Claims are offered as *segment indices*, never as milliseconds: the reader picks a first and last
 * segment and this side turns those into offsets, so a timecode can only ever land on a real
 * boundary of the recording and cannot be invented.
 *
 * Read-only. Writes task files; publishes nothing.
 *
 * Usage:
 *   bun scripts/export-claims-for-matching.ts --out ./claim-matching-tasks [--limit N]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DebateTranscriptSegment } from '../core/debates/api';
import { findBlockWindow, matchClaimWindow } from '../core/debates/claim-timing';
import { fetchAllDebates, fetchDebateClaims, fetchTranscriptSegments } from './lib/debate-claims';

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const OUT = arg('out') ?? './claim-matching-tasks';
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;

await mkdir(OUT, { recursive: true });

const inTimeOrder = (segments: DebateTranscriptSegment[]) =>
  [...segments].sort((a, b) =>
    a.start_ms === b.start_ms ? a.sequence_index - b.sequence_index : a.start_ms - b.start_ms
  );

const debates = await fetchAllDebates();
let written = 0;
let claimsExported = 0;
let alreadyPublished = 0;
let noTranscript = 0;

for (const debate of debates) {
  if (written >= LIMIT) break;

  for (const spaceId of debate.spaceIds ?? []) {
    let claims;
    try {
      claims = await fetchDebateClaims(debate.id, spaceId);
    } catch {
      continue;
    }
    if (claims.all.length === 0) continue;

    const segments = inTimeOrder(await fetchTranscriptSegments(debate.id));
    if (segments.length === 0) {
      noTranscript += 1;
      break;
    }

    const turns = [];
    for (const block of claims.blocks) {
      // Claims that already carry offsets are left alone: a published timecode is either the
      // extractor's or a reader's, and either beats re-deciding it.
      const pending = claims.all.filter(claim => claim.blockId === block.id && claim.publishedTiming === null);
      alreadyPublished += claims.all.filter(
        claim => claim.blockId === block.id && claim.publishedTiming !== null
      ).length;
      if (pending.length === 0) continue;

      // Where the turn sits on the recording. A turn that cannot be located is offered whole —
      // the reader can still find the claim, which is more than the matcher can do there.
      const window = findBlockWindow(block.text, segments);
      const slice = window ? segments.slice(window.startIndex, window.endIndex + 1) : segments;

      turns.push({
        blockId: block.id,
        turnLocated: window !== null,
        segments: slice.map((segment, index) => ({
          i: index,
          startMs: segment.start_ms,
          endMs: segment.end_ms,
          text: segment.text,
        })),
        claims: pending.map(claim => {
          const guess = window ? matchClaimWindow(claim.text, segments, window) : null;
          const guessStart = guess ? slice.findIndex(s => s.start_ms === guess.startMs) : -1;
          const guessEnd = guess ? slice.findIndex(s => s.end_ms === guess.endMs) : -1;
          return {
            claimId: claim.id,
            relationEntityId: claim.relationEntityId,
            text: claim.text,
            // The matcher's answer, to check rather than to trust. It is right far more often than
            // not, so confirming is quick — but it is the thing being audited, so a low score is a
            // reason to look harder, never a reason to accept.
            matcherGuess:
              guess && guessStart !== -1 && guessEnd !== -1
                ? { startSegment: guessStart, endSegment: guessEnd, score: Number(guess.confidence.toFixed(2)) }
                : null,
          };
        }),
      });
      claimsExported += pending.length;
    }

    if (turns.length === 0) break;

    written += 1;
    await writeFile(
      join(OUT, `${debate.id}.json`),
      `${JSON.stringify({ debateEntityId: debate.id, debateName: debate.name, spaceId, turns }, null, 2)}\n`
    );
    break;
  }
}

console.log(`wrote ${written} task files to ${OUT}`);
console.log(`  claims to place: ${claimsExported}`);
console.log(`  claims already carrying offsets (skipped): ${alreadyPublished}`);
if (noTranscript > 0) console.log(`  debates with no transcript to read: ${noTranscript}`);
