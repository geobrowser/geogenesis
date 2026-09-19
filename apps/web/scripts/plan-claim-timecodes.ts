/**
 * Builds the publish plan for claim timecodes across every debate that has claims.
 *
 * `2026-09-15-debate-claim-timecodes-publish-instructions.md` did this for one debate by hand, with
 * four of thirteen offsets hand-corrected after reading the transcript. That does not scale to 80
 * debates, and it does not need to: the matcher that produced those numbers is now
 * `core/debates/claim-timing.ts`, so this runs it over everything and writes out the ops.
 *
 * Read-only. It resolves nothing about wallets and publishes nothing — it produces a JSON file for
 * the publishing agent to execute. See `docs/plans/2026-09-17-debate-claim-timecodes-backfill.md`.
 *
 * Usage:
 *   bun scripts/plan-claim-timecodes.ts [--floor 0.7] [--out plan.json] [--limit N]
 */
import { writeFile } from 'node:fs/promises';

import { resolveClaimTimings } from '../core/debates/claim-timing';
import {
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  DEBATE_VIDEOS_PROPERTY_ID,
  SELECTOR_TYPE_ID,
  TARGET_PROPERTY_ID,
  TYPES_PROPERTY_ID,
} from '../core/debates/ontology';
import { API, arg, fetchAllDebates, fetchDebateClaims, fetchTranscriptSegments } from './lib/debate-claims';

/**
 * The confidence a match must reach before it is written to the graph.
 *
 * Higher than the 0.55 the live layer draws at, and deliberately so. A card is transient and a
 * published offset is permanent — and worse, `published` is the resolver's *most* trusted source,
 * scored 1.0, so writing a weak match does not preserve its weakness. It launders a guess into an
 * exact answer that no later gate can catch, on a surface that quotes a real person saying
 * something at a specific second. Leaving a claim alone costs nothing: the matcher still runs for
 * it at read time, at its true confidence.
 */
const FLOOR = Number(arg('floor') ?? 0.7);
const OUT = arg('out') ?? 'claim-timecode-plan.json';
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity;

type PlannedWrite = {
  entityId: string;
  claimId: string;
  claimText: string;
  startMs: number;
  endMs: number;
  confidence: number;
  source: string;
};

type DebatePlan = {
  debateEntityId: string;
  debateName: string | null;
  spaceId: string;
  claimCount: number;
  writes: PlannedWrite[];
  skipped: { alreadyPublished: number; belowFloor: number; noMatch: number };
};

const debates = await fetchAllDebates();
console.log(`debate entities: ${debates.length}`);

const plans: DebatePlan[] = [];
const histogram = new Map<string, number>();
/** Every matched claim's score, for the floor comparison printed at the end. */
const scores: number[] = [];
const bucket = (confidence: number) => `${(Math.floor(confidence * 10) / 10).toFixed(1)}`;
let failures = 0;

let index = 0;
for (const debate of debates) {
  if (index >= LIMIT) break;
  index += 1;

  // A debate entity can be listed in several spaces; its transcript and claims live in the space it
  // was published to, so try each and keep the one that actually answers.
  for (const spaceId of debate.spaceIds ?? []) {
    let claims;
    try {
      claims = await fetchDebateClaims(debate.id, spaceId);
    } catch (error) {
      console.error(`  ! ${debate.id} in ${spaceId}: ${String(error).slice(0, 120)}`);
      failures += 1;
      continue;
    }
    if (claims.all.length === 0) continue;

    const segments = await fetchTranscriptSegments(debate.id);
    const timings = resolveClaimTimings({ claims: claims.all, blocks: claims.blocks, segments });

    const writes: PlannedWrite[] = [];
    const skipped = { alreadyPublished: 0, belowFloor: 0, noMatch: 0 };

    for (const claim of claims.all) {
      // Idempotent: a claim that already carries offsets is never rewritten, so the plan can be
      // regenerated and republished after a partial run without duplicating anything.
      if (claim.publishedTiming !== null) {
        skipped.alreadyPublished += 1;
        continue;
      }
      const timing = timings.get(claim.id);
      // `block` is the whole-turn fallback — an absence of a timecode, not a loose one. Publishing
      // a 30-second window as an exact offset would be the worst of both.
      if (!timing || timing.source !== 'segment') {
        skipped.noMatch += 1;
        continue;
      }
      histogram.set(bucket(timing.confidence), (histogram.get(bucket(timing.confidence)) ?? 0) + 1);
      scores.push(timing.confidence);
      if (timing.confidence < FLOOR) {
        skipped.belowFloor += 1;
        continue;
      }
      // Where the offsets go. It rides the same traversal the app reads, so a claim the app can
      // show is a claim this can write to.
      if (!claim.relationEntityId) {
        skipped.noMatch += 1;
        continue;
      }
      writes.push({
        entityId: claim.relationEntityId,
        claimId: claim.id,
        claimText: claim.text,
        startMs: timing.startMs,
        endMs: timing.endMs,
        confidence: Number(timing.confidence.toFixed(3)),
        source: timing.source,
      });
    }

    plans.push({
      debateEntityId: debate.id,
      debateName: debate.name,
      spaceId,
      claimCount: claims.all.length,
      writes,
      skipped,
    });
    break;
  }
}

const totals = plans.reduce(
  (sum, plan) => ({
    claims: sum.claims + plan.claimCount,
    writes: sum.writes + plan.writes.length,
    alreadyPublished: sum.alreadyPublished + plan.skipped.alreadyPublished,
    belowFloor: sum.belowFloor + plan.skipped.belowFloor,
    noMatch: sum.noMatch + plan.skipped.noMatch,
  }),
  { claims: 0, writes: 0, alreadyPublished: 0, belowFloor: 0, noMatch: 0 }
);

const withWrites = plans.filter(plan => plan.writes.length > 0);

console.log(`\ndebates with claims: ${plans.length}   with something to publish: ${withWrites.length}`);
console.log(`claims: ${totals.claims}`);
console.log(`  to publish (segment match >= ${FLOOR}): ${totals.writes}`);
console.log(`  already carry offsets:                  ${totals.alreadyPublished}`);
console.log(`  matched but below the floor:            ${totals.belowFloor}`);
console.log(`  no usable match (turn fallback or none):${totals.noMatch}`);
if (failures > 0) console.log(`  debates that failed to load:            ${failures}`);

console.log('\nmatch confidence, all matched claims:');
for (const key of [...histogram.keys()].sort()) {
  console.log(
    `  ${key}–${(Number(key) + 0.1).toFixed(1)}  ${'#'.repeat(histogram.get(key) ?? 0)} ${histogram.get(key)}`
  );
}

// What a different floor would have published, so the choice is made with the consequence in view
// rather than by picking a round number.
const matched = [...scores].sort((a, b) => a - b);
console.log('\nwhat each floor would publish:');
for (const floor of [0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.4, 0.35]) {
  const count = matched.filter(score => score >= floor).length;
  const share = matched.length === 0 ? 0 : Math.round((100 * count) / matched.length);
  console.log(
    `  >= ${floor.toFixed(2)}  ${String(count).padStart(4)}  ${String(share).padStart(3)}% of matched${floor === FLOOR ? '   <- this plan' : ''}`
  );
}

const bySpace = new Map<string, number>();
for (const plan of withWrites) bySpace.set(plan.spaceId, (bySpace.get(plan.spaceId) ?? 0) + plan.writes.length);
console.log('\nwrites per space (one proposal each):');
for (const [spaceId, count] of [...bySpace].sort((a, b) => b[1] - a[1])) console.log(`  ${spaceId}  ${count}`);

await writeFile(
  OUT,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      api: API,
      floor: FLOOR,
      constants: {
        TYPES_PROPERTY: TYPES_PROPERTY_ID,
        SELECTOR_TYPE: SELECTOR_TYPE_ID,
        TARGET_PROPERTY: TARGET_PROPERTY_ID,
        DEBATE_VIDEOS_PROPERTY: DEBATE_VIDEOS_PROPERTY_ID,
      },
      offsetProperties: { start: CLAIM_START_OFFSET_PROPERTY_ID, end: CLAIM_END_OFFSET_PROPERTY_ID },
      totals,
      debates: withWrites,
    },
    null,
    2
  )}\n`
);
console.log(`\nwrote ${OUT} — ${totals.writes} writes across ${withWrites.length} debates`);
