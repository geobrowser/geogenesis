import { Graph, Ops } from '@geoprotocol/geo-sdk';

import { describe, expect, it } from 'vitest';

import { GRADE_PROPERTY_ID } from '~/core/ranking-block-ids';

import type { Grade } from './ranking-grades';
import { withVoteGrades } from './vote-grade-ops';

const id = (n: number) => n.toString(16).padStart(32, '0');
const SPACE = 'cccccccccccccccccccccccccccccccc';

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const gradeKey = GRADE_PROPERTY_ID;

type Op = { type: string; id?: Uint8Array; values?: Array<{ property: Uint8Array; value: { type: string; value: unknown } }> };

function gradesOnVotes(ops: readonly unknown[], voteIds: readonly string[]) {
  return voteIds.map(voteId => {
    const create = (ops as Op[]).find(op => op.type === 'createEntity' && op.id && hex(op.id) === voteId);
    return create?.values?.find(v => hex(v.property) === gradeKey)?.value.value ?? null;
  });
}

describe('withVoteGrades', () => {
  const votes = [1, 2, 3].map(n => ({ entityId: id(n), spaceId: SPACE }));
  const built = Ops.ranks.create({ name: 'Best debates', rankType: 'ORDINAL', blockId: id(99), votes });

  it('writes each vote’s grade into its own create op, by debate, without adding ops', () => {
    const grades = new Map<string, Grade>([
      [id(1), 'A'],
      [id(3), 'C'],
    ]);
    const ops = withVoteGrades(built.ops, built.voteIds, votes, grades);
    expect(ops).toHaveLength(built.ops.length);
    expect(gradesOnVotes(ops, built.voteIds)).toEqual(['A', null, 'C']);
  });

  it('keeps the ordinal value next to the grade', () => {
    const ops = withVoteGrades(built.ops, built.voteIds, votes, new Map([[id(2), 'B' as Grade]])) as unknown as Op[];
    const create = ops.find(op => op.type === 'createEntity' && op.id && hex(op.id) === built.voteIds[1]);
    expect(create?.values).toHaveLength(2);
  });

  it('leaves the SDK’s ops untouched', () => {
    const before = JSON.stringify(built.ops, (_k, v) => (v instanceof Uint8Array ? hex(v) : v));
    withVoteGrades(built.ops, built.voteIds, votes, new Map([[id(1), 'A' as Grade]]));
    expect(JSON.stringify(built.ops, (_k, v) => (v instanceof Uint8Array ? hex(v) : v))).toBe(before);
  });

  it('adds an update op when a vote’s create op isn’t there', () => {
    const ops = withVoteGrades([], [id(50)], [{ entityId: id(1) }], new Map([[id(1), 'A' as Grade]])) as unknown as Op[];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('updateEntity');
  });

  it('changes nothing without grades', () => {
    expect(withVoteGrades(built.ops, built.voteIds, votes, new Map())).toEqual(built.ops);
  });

  it('builds the same value an update would', () => {
    const update = Graph.updateEntity({
      id: built.voteIds[0],
      values: [{ property: GRADE_PROPERTY_ID, type: 'text', value: 'A' }],
    }).ops[0] as unknown as { set: Array<{ value: { type: string } }> };
    expect(update.set[0].value.type).toBe('text');
  });
});
