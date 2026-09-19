/**
 * Turns an LLM's segment choices into a publish plan, rejecting anything it cannot verify.
 *
 * The reader picks segments; this side owns the milliseconds. Every offset is read back out of the
 * task file the reader was given, so a timecode is always a real boundary of the recording — a
 * hallucinated time cannot get through, because times are never accepted as input.
 *
 * Everything else it checks is a way that has actually gone wrong somewhere: an index outside the
 * turn, a range that ends before it starts, a claim answered twice, a claim invented, or a
 * relation entity missing. A rejected claim is not a failure — it falls back to the matcher, which
 * is the same place it would have been without any of this.
 *
 * One answers file per task file, same filename, holding the reader's choices. `startSegment` and
 * `endSegment` are `i` values from that claim's own turn, inclusive; `notInTurn` is the escape
 * hatch for a claim whose specifics are not in the turn it was filed under, which is the case the
 * matcher cannot express and the main reason for reading at all:
 *
 *   { "matches": [
 *       { "claimId": "ad46e41f…", "startSegment": 12, "endSegment": 15 },
 *       { "claimId": "8401b74c…", "notInTurn": true }
 *   ] }
 *
 * Usage:
 *   bun scripts/build-plan-from-matches.ts --tasks ./claim-matching-tasks --answers ./answers --out plan.json
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  CLAIM_END_OFFSET_PROPERTY_ID,
  CLAIM_START_OFFSET_PROPERTY_ID,
  DEBATE_VIDEOS_PROPERTY_ID,
  SELECTOR_TYPE_ID,
  TARGET_PROPERTY_ID,
  TYPES_PROPERTY_ID,
} from '../core/debates/ontology';
import { API, arg } from './lib/debate-claims';

const TASKS = arg('tasks') ?? './claim-matching-tasks';
const ANSWERS = arg('answers') ?? './claim-matching-answers';
const OUT = arg('out') ?? 'claim-timecode-plan.json';

type TaskSegment = { i: number; startMs: number; endMs: number; text: string };
type TaskClaim = {
  claimId: string;
  relationEntityId: string | null;
  text: string;
  published: { startMs: number; endMs: number; onSegmentBoundaries: boolean } | null;
};
type Task = {
  debateEntityId: string;
  debateName: string | null;
  spaceId: string;
  turns: { blockId: string; segments: TaskSegment[]; claims: TaskClaim[] }[];
};
type Answer = { claimId: string; startSegment?: number; endSegment?: number; notInTurn?: boolean };

const rejected: string[] = [];
const plans: {
  debateEntityId: string;
  debateName: string | null;
  spaceId: string;
  writes: {
    entityId: string;
    claimId: string;
    claimText: string;
    startMs: number;
    endMs: number;
    source: string;
    /** Present when this replaces an offset already published — see the doc on overwriting. */
    corrects?: { startMs: number; endMs: number };
  }[];
}[] = [];

let placed = 0;
let declined = 0;
let unanswered = 0;
let confirmed = 0;
let corrected = 0;
/** A published claim the reader says is not in its turn — a wrong offset already live. */
const disputed: string[] = [];
/** A hand-set span the reader cannot agree with in segments, only widen. Held back for a person. */
const handSet: string[] = [];

for (const file of (await readdir(TASKS)).filter(name => name.endsWith('.json'))) {
  const task: Task = JSON.parse(await readFile(join(TASKS, file), 'utf8'));

  let answers: Answer[];
  try {
    const parsed = JSON.parse(await readFile(join(ANSWERS, file), 'utf8'));
    answers = Array.isArray(parsed) ? parsed : (parsed.matches ?? []);
  } catch {
    rejected.push(`${task.debateName}: no answers file`);
    continue;
  }

  /**
   * Built by hand rather than with `new Map(answers.map(…))`, which keeps the last entry for a
   * repeated key and throws the rest away. A claim answered twice with two different spans would
   * have been silently resolved to whichever came last — the opposite of what this script is for,
   * and invisible in its own "rejected" count.
   */
  const byClaimId = new Map<string, Answer>();
  const answeredTwice = new Set<string>();
  for (const answer of answers) {
    if (byClaimId.has(answer.claimId)) answeredTwice.add(answer.claimId);
    byClaimId.set(answer.claimId, answer);
  }

  const writes: (typeof plans)[number]['writes'] = [];

  for (const turn of task.turns) {
    for (const claim of turn.claims) {
      if (answeredTwice.has(claim.claimId)) {
        rejected.push(`${claim.claimId}: answered more than once`);
        continue;
      }

      const answer = byClaimId.get(claim.claimId);
      if (!answer) {
        unanswered += 1;
        continue;
      }
      // The escape hatch, and the reason this is worth doing at all: the matcher cannot decline.
      // A claim whose specifics live in another turn has no right answer here, and saying so is
      // the right answer.
      if (answer.notInTurn) {
        // On an unpublished claim this is just a decline. On a published one it says a live offset
        // is wrong, which needs removing rather than rewriting — a different op and a judgement
        // call, so it is reported rather than acted on.
        if (claim.published)
          disputed.push(`${claim.claimId}: published offset disputed — "${claim.text.slice(0, 60)}"`);
        else declined += 1;
        continue;
      }

      const start = turn.segments.find(segment => segment.i === answer.startSegment);
      const end = turn.segments.find(segment => segment.i === answer.endSegment);
      if (!start || !end) {
        rejected.push(`${claim.claimId}: segment ${answer.startSegment}–${answer.endSegment} is not in this turn`);
        continue;
      }
      if (end.endMs <= start.startMs) {
        rejected.push(`${claim.claimId}: range ends before it starts`);
        continue;
      }
      if (!claim.relationEntityId) {
        rejected.push(`${claim.claimId}: no relation entity to write to`);
        continue;
      }
      if (writes.some(write => write.claimId === claim.claimId)) {
        rejected.push(`${claim.claimId}: appears in more than one turn of this task file`);
        continue;
      }

      // A published claim the reader agrees with needs no write. Republishing the same numbers
      // would spend a transaction to change nothing.
      if (claim.published && claim.published.startMs === start.startMs && claim.published.endMs === end.endMs) {
        confirmed += 1;
        continue;
      }

      // A span someone set by hand to a boundary inside a segment cannot be agreed with in segments,
      // only widened outward to the segment edges — so a differing answer here does not distinguish
      // "the reader disagrees" from "the reader agrees and lost precision". Both would overwrite a
      // human's work, so neither is done automatically.
      if (claim.published && !claim.published.onSegmentBoundaries) {
        handSet.push(
          `${claim.claimId}: hand-set ${claim.published.startMs}–${claim.published.endMs}ms, read as ` +
            `${start.startMs}–${end.endMs}ms`
        );
        continue;
      }

      writes.push({
        entityId: claim.relationEntityId,
        claimId: claim.claimId,
        claimText: claim.text,
        startMs: start.startMs,
        endMs: end.endMs,
        source: 'llm-read',
        ...(claim.published ? { corrects: claim.published } : null),
      });
      if (claim.published) corrected += 1;
      else placed += 1;
    }
  }

  const known = new Set(task.turns.flatMap(turn => turn.claims.map(claim => claim.claimId)));
  for (const answer of answers) {
    if (!known.has(answer.claimId)) rejected.push(`${answer.claimId}: not a claim in this debate`);
  }

  if (writes.length > 0) {
    plans.push({
      debateEntityId: task.debateEntityId,
      debateName: task.debateName,
      spaceId: task.spaceId,
      writes,
    });
  }
}

console.log(`placed by reading: ${placed}`);
console.log(`published offsets confirmed as correct: ${confirmed}`);
console.log(`published offsets corrected: ${corrected}`);
console.log(`declined as not in the turn: ${declined}`);
console.log(`left unanswered: ${unanswered}`);
console.log(`rejected: ${rejected.length}`);
if (handSet.length > 0) {
  console.log(`\nhand-set offsets the reader answered differently — decide these by hand: ${handSet.length}`);
  for (const line of handSet) console.log(`  ? ${line}`);
}
if (disputed.length > 0) {
  console.log(`\npublished offsets the reader says are wrong — decide these by hand: ${disputed.length}`);
  for (const line of disputed) console.log(`  ? ${line}`);
}
for (const reason of rejected.slice(0, 20)) console.log(`  ! ${reason}`);

const bySpace = new Map<string, number>();
for (const plan of plans) bySpace.set(plan.spaceId, (bySpace.get(plan.spaceId) ?? 0) + plan.writes.length);
console.log('\nwrites per space (one proposal each):');
for (const [spaceId, count] of [...bySpace].sort((a, b) => b[1] - a[1])) console.log(`  ${spaceId}  ${count}`);

await writeFile(
  OUT,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      api: API,
      source: 'llm-read',
      constants: {
        TYPES_PROPERTY: TYPES_PROPERTY_ID,
        SELECTOR_TYPE: SELECTOR_TYPE_ID,
        TARGET_PROPERTY: TARGET_PROPERTY_ID,
        DEBATE_VIDEOS_PROPERTY: DEBATE_VIDEOS_PROPERTY_ID,
      },
      offsetProperties: { start: CLAIM_START_OFFSET_PROPERTY_ID, end: CLAIM_END_OFFSET_PROPERTY_ID },
      totals: {
        placed,
        confirmed,
        corrected,
        declined,
        unanswered,
        rejected: rejected.length,
        disputed: disputed.length,
        handSet: handSet.length,
      },
      debates: plans,
    },
    null,
    2
  )}\n`
);
const writeCount = plans.reduce((total, plan) => total + plan.writes.length, 0);
console.log(`\nwrote ${OUT} — ${writeCount} writes across ${plans.length} debates`);
