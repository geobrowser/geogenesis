import { describe, expect, it } from 'vitest';
import type * as S from 'zapatos/schema';

import { aggregateMergableOps, aggregateMergableVersions } from './aggregate-mergable-versions';
import type { Op } from '~/sink/types';

const versions: S.versions.Insertable[] = [
  {
    id: '0',
    created_at: 0,
    created_at_block: 0,
    created_by_id: '0',
    edit_id: '0',
    entity_id: 'same',
  },
  {
    id: '1',
    created_at: 0,
    created_at_block: 0,
    created_by_id: '0',
    edit_id: '0',
    entity_id: 'same',
  },
];

describe('aggregateMergableVersions', () => {
  it('should aggregate mergable versions', () => {
    const newVersions = aggregateMergableVersions(versions);
    expect(newVersions).toEqual(new Map([['same', versions]]));
  });
});

const opsByVersionId = new Map<string, Op[]>([
  [
    '0',
    [
      {
        type: 'SET_TRIPLE',
        triple: {
          attribute: 'attribute-id-1',
          entity: 'same',
          value: { type: 'TEXT', value: 'test value 1' },
        },
      },
    ],
  ],
  [
    '1',
    [
      {
        type: 'SET_TRIPLE',
        triple: {
          attribute: 'attribute-id-2',
          entity: 'same',
          value: { type: 'TEXT', value: 'test value 2' },
        },
      },
    ],
  ],
]);

describe('aggregateMergableOps', () => {
  it('should aggregate mergable ops', () => {
    const manyVersionsByEntityId = aggregateMergableVersions(versions);

    const { mergedOpsByVersionId } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
    });

    const expectedVersionOps = [...mergedOpsByVersionId.values()];
    const ops = [...opsByVersionId.values()].flat();

    expect(expectedVersionOps[0]).toEqual(ops);
  });

  it('should aggregate new versions from mergable versions', () => {
    const manyVersionsByEntityId = aggregateMergableVersions(versions);

    const { mergedVersions } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
    });

    expect(mergedVersions[0]?.id).to.not.equal(versions[0]?.id);
    expect(mergedVersions[0]).toHaveProperty('created_at', 0);
    expect(mergedVersions[0]).toHaveProperty('created_at_block', 0);
    expect(mergedVersions[0]).toHaveProperty('created_by_id', '0');
    expect(mergedVersions[0]).toHaveProperty('edit_id', '0');
    expect(mergedVersions[0]).toHaveProperty('entity_id', 'same');
    expect(mergedVersions[0]).toHaveProperty('id');
  });
});
