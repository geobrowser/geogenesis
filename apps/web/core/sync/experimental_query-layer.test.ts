import { describe, expect, it } from 'vitest';

import type { Entity } from '~/core/types';

import { EntityQuery } from './experimental_query-layer';

function entity(id: string, createdAt: string | number): Entity {
  return {
    id,
    name: id,
    description: null,
    spaces: [],
    types: [],
    relations: [],
    values: [],
    createdAt,
  };
}

describe('EntityQuery createdAt filtering', () => {
  it('supports numeric rolling-time cutoffs for locally filtered collection rows', () => {
    const entities = [entity('old', 100), entity('new', '200'), entity('iso', '1970-01-01T00:03:20.000Z')];

    expect(
      new EntityQuery(entities)
        .where({ createdAt: { greaterThanOrEqualTo: '150' } })
        .execute()
        .map(item => item.id)
    ).toEqual(['new', 'iso']);
  });
});
