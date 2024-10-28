import { describe, expect, it } from 'vitest';

import { Triple } from '~/core/database/Triple';

import { prepareTriplesForPublishing } from './triples';

const TRIPLE = Triple.make({
  attributeId: 'test-attribute',
  attributeName: 'test-attribute-name',
  entityId: 'test-entity',
  entityName: 'test-entity-name',
  space: 'test-space',
  value: {
    type: 'TEXT',
    value: 'test value',
  },
});

describe('prepareTriplesForPublishing', () => {
  it('maps triples to SET_TRIPLE op', () => {
    const result = prepareTriplesForPublishing([TRIPLE], TRIPLE.space);
    expect(result).toEqual([
      {
        type: 'SET_TRIPLE',
        triple: {
          entity: TRIPLE.entityId,
          attribute: TRIPLE.attributeId,
          value: {
            type: TRIPLE.value.type,
            value: TRIPLE.value.value,
          },
        },
      },
    ]);
  });

  it('maps triples to DELETE op', () => {
    const result = prepareTriplesForPublishing([{ ...TRIPLE, isDeleted: true }], TRIPLE.space);
    expect(result).toEqual([
      {
        type: 'DELETE_TRIPLE',
        triple: {
          entity: TRIPLE.entityId,
          attribute: TRIPLE.attributeId,
        },
      },
    ]);
  });

  it('filters triples from different space', () => {
    const result = prepareTriplesForPublishing([TRIPLE], 'different test space');
    expect(result.length).toEqual(0);
  });

  it('filters already-published triples', () => {
    const result = prepareTriplesForPublishing([{ ...TRIPLE, hasBeenPublished: true }], TRIPLE.space);
    expect(result.length).toEqual(0);
  });

  it('filters triples with empty entity id', () => {
    const result = prepareTriplesForPublishing([{ ...TRIPLE, entityId: '' }], TRIPLE.space);
    expect(result.length).toEqual(0);
  });

  it('filters triples with empty attribute id', () => {
    const result = prepareTriplesForPublishing([{ ...TRIPLE, attributeId: '' }], TRIPLE.space);
    expect(result.length).toEqual(0);
  });
});
