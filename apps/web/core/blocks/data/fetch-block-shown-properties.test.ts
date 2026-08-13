import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { fetchShownPropertyEntitiesForBlocks } from './fetch-block-shown-properties';

const relation = (typeId: string, toEntityId: string, overrides: Record<string, unknown> = {}) =>
  ({ type: { id: typeId }, toEntity: { id: toEntityId }, ...overrides }) as never;

const entity = (id: string, relations: unknown[] = []) => ({ id, relations, values: [] }) as unknown as Entity;

// Mirrors `cachedFetchEntitiesBatch`, whose optional second argument is the whole point of the
// "does not scope the fetch to a space" case below.
const fetcher = () => vi.fn(async (ids: string[], _spaceId?: string) => ids.map(id => entity(id)));

describe('fetchShownPropertyEntitiesForBlocks', () => {
  it('fetches the property behind every shown column, in one batch', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover'), relation(SystemIds.PROPERTIES, 'author')]),
        entity('block-relation-b', [relation(SystemIds.SHOWN_COLUMNS, 'video')]),
      ],
      fetchBatch
    );

    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(fetchBatch.mock.calls[0][0].sort()).toEqual(['author', 'cover', 'video']);
  });

  it('does not scope the fetch to a space', async () => {
    // A property is defined in whatever space owns it, not in the space of a page that shows it,
    // and the batch query scopes the entity lookup *and* its values to whatever space it's given.
    // Passing the page's space here returns nothing at all — silently, since an empty result
    // looks exactly like "this block configures no dimensions".
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover')])],
      fetchBatch
    );

    expect(fetchBatch.mock.calls[0][1]).toBeUndefined();
  });

  it('returns the fetched property entities', async () => {
    const result = await fetchShownPropertyEntitiesForBlocks(
      [entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover')])],
      fetcher()
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
      fetchBatch
    );

    expect(fetchBatch.mock.calls[0][0]).toEqual(['cover']);
  });

  it('skips properties the caller already fetched as blocks', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [entity('block-relation-a', [relation(SystemIds.PROPERTIES, 'cover')]), entity('cover')],
      fetchBatch
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
      fetchBatch
    );

    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it('does not call out for a page with no data blocks', async () => {
    const fetchBatch = fetcher();

    expect(await fetchShownPropertyEntitiesForBlocks([], fetchBatch)).toEqual([]);
    expect(fetchBatch).not.toHaveBeenCalled();
  });
});
