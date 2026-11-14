import { Graph } from '@geoprotocol/geo-sdk';

import { GRADE_PROPERTY_ID } from '~/core/ranking-block-ids';
import { normId } from '~/core/utils/norm-id';

import type { BallotGrades } from './ranking-grades';

type AnyOp = { type: string; id?: unknown; values?: unknown[] };

function sameBytes(a: unknown, b: unknown): boolean {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  return a.every((byte, index) => byte === b[index]);
}

/**
 * Writes each graded vote's `Grade` onto its vote entity (GEO-3729), in the ops `ranks.update` /
 * `ranks.create` built. Every publish re-creates every vote, so every grade is written again.
 *
 * `voteIds[i]` is the entity of `votes[i]` (the SDK builds them in order); the grade is looked up
 * by the vote's debate, never by slot index, since `buildRankingVotes` can leave slots out. The
 * value goes into the vote entity's own create op, so the edit doesn't grow by an op per vote; if
 * that op isn't there, an update op for the entity is added instead.
 */
export function withVoteGrades<TOp>(
  ops: readonly TOp[],
  voteIds: readonly string[],
  votes: ReadonlyArray<{ entityId: string }>,
  grades: BallotGrades
): TOp[] {
  if (grades.size === 0) return [...ops];
  const next = [...ops] as unknown as AnyOp[];
  votes.forEach((vote, index) => {
    const grade = grades.get(normId(vote.entityId));
    const voteId = voteIds[index];
    if (!grade || !voteId) return;
    const [update] = Graph.updateEntity({
      id: voteId,
      values: [{ property: GRADE_PROPERTY_ID, type: 'text', value: grade }],
    }).ops as unknown as Array<AnyOp & { set: unknown[] }>;
    const create = next.find(op => op.type === 'createEntity' && sameBytes(op.id, update.id));
    if (create && Array.isArray(create.values)) {
      const at = next.indexOf(create);
      next[at] = { ...create, values: [...create.values, ...update.set] };
    } else {
      next.push(update);
    }
  });
  return next as unknown as TOp[];
}
