import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import { dedupeRelationsByToEntityId } from './dedupe-relations';

function relation(id: string, targetId: string) {
  return { id, toEntity: { id: targetId } } as Pick<Relation, 'id' | 'toEntity'>;
}

describe('dedupeRelationsByToEntityId', () => {
  it('keeps the first target when UUID spellings differ only by formatting', () => {
    const first = relation('relation-1', 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA');
    const duplicate = relation('relation-2', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const other = relation('relation-3', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

    expect(dedupeRelationsByToEntityId([first, duplicate, other])).toEqual([first, other]);
  });
});
