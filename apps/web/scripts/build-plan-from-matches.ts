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
 * Usage:
 *   bun scripts/build-plan-from-matches.ts --tasks ./claim-matching-tasks --answers ./answers --out plan.json
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CLAIM_END_OFFSET_PROPERTY_ID, CLAIM_START_OFFSET_PROPERTY_ID } from '../core/debates/ontology';
import { API } from './lib/debate-claims';

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

const TASKS = arg('tasks') ?? './claim-matching-tasks';
const ANSWERS = arg('answers') ?? './claim-matching-answers';
const OUT = arg('out') ?? 'claim-timecode-plan.json';

const TYPES_PROPERTY = '8f151ba4de204e3c9cb499ddf96f48f1';
const SELECTOR_TYPE = '813ca865db9b486490dec6764febaab3';
const TARGET_PROPERTY = 'e1788cdf9bae42e987b0d9791de09b31';
const DEBATE_VIDEOS_PROPERTY = 'c48dc314fa7148aeb967139160456f1d';

type TaskSegment = { i: number; startMs: number; endMs: number; text: string };
type TaskClaim = { claimId: string; relationEntityId: string | null; text: string };
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
  writes: { entityId: string; claimId: string; claimText: string; startMs: number; endMs: number; source: string }[];
}[] = [];

let placed = 0;
let declined = 0;
let unanswered = 0;

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

  const byClaimId = new Map(answers.map(answer => [answer.claimId, answer]));
  const writes: (typeof plans)[number]['writes'] = [];

  for (const turn of task.turns) {
    for (const claim of turn.claims) {
      const answer = byClaimId.get(claim.claimId);
      if (!answer) {
        unanswered += 1;
        continue;
      }
      // The escape hatch, and the reason this is worth doing at all: the matcher cannot decline.
      // A claim whose specifics live in another turn has no right answer here, and saying so is
      // the right answer.
      if (answer.notInTurn) {
        declined += 1;
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
        rejected.push(`${claim.claimId}: answered more than once`);
        continue;
      }

      writes.push({
        entityId: claim.relationEntityId,
        claimId: claim.claimId,
        claimText: claim.text,
        startMs: start.startMs,
        endMs: end.endMs,
        source: 'llm-read',
      });
      placed += 1;
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
console.log(`declined as not in the turn: ${declined}`);
console.log(`left unanswered: ${unanswered}`);
console.log(`rejected: ${rejected.length}`);
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
      constants: { TYPES_PROPERTY, SELECTOR_TYPE, TARGET_PROPERTY, DEBATE_VIDEOS_PROPERTY },
      offsetProperties: { start: CLAIM_START_OFFSET_PROPERTY_ID, end: CLAIM_END_OFFSET_PROPERTY_ID },
      totals: { placed, declined, unanswered, rejected: rejected.length },
      debates: plans,
    },
    null,
    2
  )}\n`
);
console.log(`\nwrote ${OUT} — ${placed} writes across ${plans.length} debates`);
