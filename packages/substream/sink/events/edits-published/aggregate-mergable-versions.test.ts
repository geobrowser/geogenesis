import { describe, expect, it } from 'vitest';
import type * as S from 'zapatos/schema';

import { aggregateMergableOps, aggregateMergableVersions } from './aggregate-mergable-versions';
import type { Op } from '~/sink/types';

const versionsWithSameEntityId: S.versions.Insertable[] = [
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

const versionsWithDifferentEntityId: S.versions.Insertable[] = [
  {
    id: '0',
    created_at: 0,
    created_at_block: 0,
    created_by_id: '0',
    edit_id: '0',
    entity_id: 'different-1',
  },
  {
    id: '1',
    created_at: 0,
    created_at_block: 0,
    created_by_id: '0',
    edit_id: '0',
    entity_id: 'different-2',
  },
];

describe('aggregateMergableVersions', () => {
  it('should aggregate mergable versions', () => {
    const newVersions = aggregateMergableVersions(versionsWithSameEntityId);
    expect(newVersions).toEqual(new Map([['same', versionsWithSameEntityId]]));
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
    const manyVersionsByEntityId = aggregateMergableVersions(versionsWithSameEntityId);

    const { mergedOpsByVersionId } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
      editType: 'DEFAULT',
    });

    const expectedVersionOps = [...mergedOpsByVersionId.values()];
    const ops = [...opsByVersionId.values()].flat();

    expect(expectedVersionOps[0]).toEqual(ops);
  });

  it('should aggregate new versions from mergable versions for default edited versions', () => {
    const manyVersionsByEntityId = aggregateMergableVersions(versionsWithSameEntityId);

    const { mergedVersions } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
      editType: 'DEFAULT',
    });

    expect(mergedVersions[0]?.id).to.not.equal(versionsWithSameEntityId[0]?.id);
    expect(mergedVersions[0]).toHaveProperty('created_at', 0);
    expect(mergedVersions[0]).toHaveProperty('created_at_block', 0);
    expect(mergedVersions[0]).toHaveProperty('created_by_id', '0');
    expect(mergedVersions[0]).toHaveProperty('edit_id', '0');
    expect(mergedVersions[0]).toHaveProperty('entity_id', 'same');
    expect(mergedVersions[0]).toHaveProperty('id');
  });

  it('aggregate merged version for entities with multiple versions for DEFAULT edit', () => {
    const manyVersionsByEntityId = aggregateMergableVersions(versionsWithSameEntityId);

    const { mergedVersions } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
      editType: 'DEFAULT',
    });

    expect(mergedVersions[0]?.id).to.not.equal(versionsWithSameEntityId[0]?.id);
    expect(mergedVersions[0]).toHaveProperty('created_at', 0);
    expect(mergedVersions[0]).toHaveProperty('created_at_block', 0);
    expect(mergedVersions[0]).toHaveProperty('created_by_id', '0');
    expect(mergedVersions[0]).toHaveProperty('edit_id', '0');
    expect(mergedVersions[0]).toHaveProperty('entity_id', 'same');
    expect(mergedVersions[0]).toHaveProperty('id');
  });

  it('NOT aggregate merged version for entities with single versions for DEFAULT edit', () => {
    const manyVersionsByEntityId = aggregateMergableVersions(versionsWithDifferentEntityId);

    const { mergedVersions } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
      editType: 'DEFAULT',
    });

    expect(mergedVersions.length).toBe(0);
  });

  it('aggregate merged version for entities with single versions for IMPORT edit', () => {
    const manyVersionsByEntityId = aggregateMergableVersions(versionsWithDifferentEntityId);

    const { mergedVersions } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
      editType: 'IMPORT',
    });

    // There's two entities in the versions, each with one version, so there should be
    // two versions
    expect(mergedVersions.length).toBe(2);
  });

  it('aggregate merged version for entities with multiple versions for IMPORT edit', () => {
    const manyVersionsByEntityId = aggregateMergableVersions(versionsWithSameEntityId);

    const { mergedVersions } = aggregateMergableOps({
      manyVersionsByEntityId,
      opsByVersionId: new Map(opsByVersionId),
      block: {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      },
      editType: 'IMPORT',
    });

    // There's two entities in the versions, each with one version, so there should be
    // two versions
    expect(mergedVersions[0]?.id).to.not.equal(versionsWithSameEntityId[0]?.id);
    expect(mergedVersions[0]).toHaveProperty('created_at', 0);
    expect(mergedVersions[0]).toHaveProperty('created_at_block', 0);
    expect(mergedVersions[0]).toHaveProperty('created_by_id', '0');
    expect(mergedVersions[0]).toHaveProperty('edit_id', '0');
    expect(mergedVersions[0]).toHaveProperty('entity_id', 'same');
    expect(mergedVersions[0]).toHaveProperty('id');
  });
});
