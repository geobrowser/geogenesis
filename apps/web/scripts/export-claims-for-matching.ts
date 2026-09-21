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
 * Each file carries a `taskVersion` fingerprint of what the reader reads. The answers file has to
 * echo it, so answers written against an earlier cut of a transcript cannot be planned from — see
 * {@link taskVersion}.
 *
 * Usage:
 *   bun scripts/export-claims-for-matching.ts --out ./claim-matching-tasks [--limit N]
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DebateTranscriptSegment } from '../core/debates/api';
import { findBlockWindow, matchClaimWindow } from '../core/debates/claim-timing';
import {
  arg,
  fetchAllDebates,
  fetchDebateClaims,
  fetchTranscriptSegments,
  numberArg,
  taskVersion,
} from './lib/debate-claims';

const OUT = arg('out') ?? './claim-matching-tasks';
const LIMIT = numberArg('limit', { fallback: Infinity, min: 1 });
/**
 * Claims that already carry offsets come out too, to be confirmed rather than placed.
 *
 * Most of what is published was written by `plan-claim-timecodes.ts` from the matcher alone, at a
 * 0.7 score, with nothing human or otherwise reading the transcript behind it — and a published
 * offset is the app's definition of certainty, scored 1.0, so an error in one is invisible from
 * then on. Reading them back is the only chance to catch one, and the run prints how many there
 * are rather than this comment guessing at a number that changes with every backfill.
 */
const SKIP_PUBLISHED = process.argv.includes('--skip-published');

await mkdir(OUT, { recursive: true });

/**
 * Task files from an earlier run, cleared before this one writes.
 *
 * `build-plan-from-matches.ts` reads *every* JSON file in this directory, so anything left behind
 * is still planning writes. A second run with a lower `--limit`, or one after some of the corpus
 * was published, leaves files for debates this run deliberately did not export — and the plan then
 * quietly contains them, built from whatever the graph looked like the first time.
 *
 * Only files this script recognises as its own output go: read, parsed, and required to carry a
 * `debateEntityId` and `turns`. Anything else in the directory is somebody's, and an `--out` that
 * happens to point at a directory holding the reader's answers must not eat them.
 */
const stale: string[] = [];
for (const name of (await readdir(OUT)).filter(name => name.endsWith('.json'))) {
  try {
    const parsed = JSON.parse(await readFile(join(OUT, name), 'utf8'));
    if (typeof parsed?.debateEntityId === 'string' && Array.isArray(parsed?.turns)) stale.push(name);
  } catch {
    // Unreadable, so not recognisably ours. Left alone rather than guessed at.
  }
}
for (const name of stale) await rm(join(OUT, name));
if (stale.length > 0) console.log(`cleared ${stale.length} task files from an earlier run`);

const inTimeOrder = (segments: DebateTranscriptSegment[]) =>
  [...segments].sort((a, b) =>
    a.start_ms === b.start_ms ? a.sequence_index - b.sequence_index : a.start_ms - b.start_ms
  );

const debates = await fetchAllDebates();
let written = 0;
let claimsExported = 0;
let alreadyPublished = 0;
let noTranscript = 0;
/**
 * Spaces whose claims could not be read at all.
 *
 * Distinct from a space with no claims in it, which is the ordinary case this loop walks past. A
 * failed request used to be swallowed into that same `continue`, so a GraphQL error or an outage
 * dropped the debate from the task files and the run still announced how many it had written — the
 * export's contract is "every unplaced claim is in here", and a partial set that looks whole is how
 * a claim silently never gets placed. Mirrors `plan-claim-timecodes.ts`, which counts the same
 * thing on the same call, and `fetchTranscriptSegments`, which stopped reporting failures as
 * absence for the same reason.
 */
const failedSpaces: string[] = [];

for (const debate of debates) {
  if (written >= LIMIT) break;

  for (const spaceId of debate.spaceIds ?? []) {
    let claims;
    try {
      claims = await fetchDebateClaims(debate.id, spaceId);
    } catch (error) {
      console.error(`  ! ${debate.id} in ${spaceId}: ${String(error).slice(0, 120)}`);
      failedSpaces.push(`${debate.id} in ${spaceId}`);
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
      // `restated` claims are left out: the row carries one turn's relation entity out of two, so
      // an answer for it could only ever be published against one of the statements. See `restated`.
      const inTurn = claims.all.filter(claim => claim.blockId === block.id && !claim.restated);
      const pending = inTurn.filter(claim => claim.publishedTiming === null || !SKIP_PUBLISHED);
      alreadyPublished += inTurn.filter(claim => claim.publishedTiming !== null).length;
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
          // A published span, shown in the same units the answer is given in so it can be agreed
          // with or corrected rather than re-derived. Offsets that do not sit on segment boundaries
          // are reported as milliseconds and flagged, which is itself worth knowing.
          const publishedStart = claim.publishedTiming
            ? slice.findIndex(s => s.start_ms === claim.publishedTiming!.startMs)
            : -1;
          const publishedEnd = claim.publishedTiming
            ? slice.findIndex(s => s.end_ms === claim.publishedTiming!.endMs)
            : -1;

          return {
            claimId: claim.id,
            relationEntityId: claim.relationEntityId,
            text: claim.text,
            /** Present means confirm or correct it, not place it. */
            published: claim.publishedTiming
              ? {
                  startMs: claim.publishedTiming.startMs,
                  endMs: claim.publishedTiming.endMs,
                  startSegment: publishedStart === -1 ? null : publishedStart,
                  endSegment: publishedEnd === -1 ? null : publishedEnd,
                  onSegmentBoundaries: publishedStart !== -1 && publishedEnd !== -1,
                }
              : null,
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
    // Stamped so the reader can echo it — see {@link taskVersion}. Written first in the file so it
    // is the first thing read, by a person or by a model, rather than buried under the transcript.
    const task = { debateEntityId: debate.id, debateName: debate.name, spaceId, turns };
    await writeFile(
      join(OUT, `${debate.id}.json`),
      `${JSON.stringify({ taskVersion: taskVersion(task), ...task }, null, 2)}\n`
    );
    break;
  }
}

console.log(`wrote ${written} task files to ${OUT}`);
console.log(`  claims in the task files: ${claimsExported}`);
console.log(
  `  of which already carry offsets: ${SKIP_PUBLISHED ? `0 (${alreadyPublished} skipped)` : alreadyPublished} — confirm or correct these`
);
if (noTranscript > 0) console.log(`  debates with no transcript to read: ${noTranscript}`);
if (failedSpaces.length > 0) {
  console.error(`  spaces that failed to load: ${failedSpaces.length} — these task files are missing`);
  for (const where of failedSpaces.slice(0, 10)) console.error(`    ! ${where}`);
  process.exitCode = 1;
}
