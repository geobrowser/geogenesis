import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { fetchShownPropertyEntitiesForBlocks } from './fetch-block-shown-properties';

const relation = (typeId: string, toEntityId: string, overrides: Record<string, unknown> = {}) =>
  ({ type: { id: typeId }, toEntity: { id: toEntityId }, ...overrides }) as never;

const entity = (id: string, relations: unknown[] = []) => ({ id, relations, values: [] }) as unknown as Entity;

const fetcher = () => vi.fn(async (ids: string[]) => ids.map(id => entity(id)));

describe('fetchShownPropertyEntitiesForBlocks', () => {
  it('fetches the property behind every shown column, in one batch', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover'), relation(SystemIds.PROPERTIES, 'author')]),
        entity('block-relation-b', [relation(SystemIds.SHOWN_COLUMNS, 'video')]),
      ],
      fetchBatch,
      'space-1'
    );

    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch.mock.calls[0][0].sort()).toEqual(['author', 'cover', 'video']);
  });

  it('returns the fetched property entities', async () => {
    const result = await fetchShownPropertyEntitiesForBlocks(
      [entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover')])],
      fetcher(),
      'space-1'
    );

    expect(result.map(e => e.id)).toEqual(['cover']);
  });

  it('de-duplicates a property shown by more than one block', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover')]),
        entity('block-relation-b', [relation(SystemIds.PROPERTIES, 'cover')]),
      ],
      fetchBatch,
      'space-1'
    );

    expect(fetchBatch.mock.calls[0][0]).toEqual(['cover']);
  });

  it('skips properties the caller already fetched as blocks', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover')]), entity('cover')],
      fetchBatch,
      'space-1'
    );

    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it('ignores deleted shown columns and relations of other types', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        entity('block-relation-a', [
          relation(SystemIds.PROPERTIES, 'deleted-column', { isDeleted: true }),
          relation(SystemIds.VIEW_PROPERTY, 'gallery-view'),
          relation(SystemIds.FILTER, 'a-filter'),
        ]),
      ],
      fetchBatch,
      'space-1'
    );

    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it('does not call out for a page with no data blocks', async () => {
    const fetchBatch = fetcher();

    expect(await fetchShownPropertyEntitiesForBlocks([], fetchBatch, 'space-1')).toEqual([]);
    expect(fetchBatch).not.toHaveBeenCalled();
  });
});
