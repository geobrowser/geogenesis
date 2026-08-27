import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { fetchShownPropertyEntitiesForBlocks } from './fetch-block-shown-properties';

const shownColumn = (propertyId: string, overrides: Record<string, unknown> = {}) =>
  ({ type: { id: SystemIds.PROPERTIES }, toEntity: { id: propertyId }, position: 'a0', ...overrides }) as never;

const shownColumnLegacy = (propertyId: string) =>
  ({ type: { id: SystemIds.SHOWN_COLUMNS }, toEntity: { id: propertyId }, position: 'a0' }) as never;

const view = (viewId: string) => ({ type: { id: SystemIds.VIEW_PROPERTY }, toEntity: { id: viewId } }) as never;

const entity = (id: string, relations: unknown[] = []) => ({ id, relations, values: [] }) as unknown as Entity;

/** A BLOCKS relation entity for a gallery block — the only view that reads media dimensions. */
const galleryBlock = (id: string, columns: unknown[]) => entity(id, [view(SystemIds.GALLERY_VIEW), ...columns]);

// Typed like `cachedFetchEntitiesBatch`, whose optional second argument is the whole point of the
// "does not scope the fetch to a space" case below.
const fetcher = () =>
  vi.fn<(ids: string[], spaceId?: string) => Promise<Entity[]>>(async ids => ids.map(id => entity(id)));

describe('fetchShownPropertyEntitiesForBlocks', () => {
  it('fetches the property behind every shown column, in one batch', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        galleryBlock('block-relation-a', [shownColumn('cover'), shownColumn('author')]),
        galleryBlock('block-relation-b', [shownColumnLegacy('video')]),
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

    await fetchShownPropertyEntitiesForBlocks([galleryBlock('block-relation-a', [shownColumn('cover')])], fetchBatch);

    expect(fetchBatch.mock.calls[0][1]).toBeUndefined();
  });

  it('returns the fetched property entities', async () => {
    const result = await fetchShownPropertyEntitiesForBlocks(
      [galleryBlock('block-relation-a', [shownColumn('cover')])],
      fetcher()
    );

    expect(result.map(e => e.id)).toEqual(['cover']);
  });

  it('resolves the property id the way the client does, preferring toEntity.value', () => {
    const fetchBatch = fetcher();

    return fetchShownPropertyEntitiesForBlocks(
      [
        galleryBlock('block-relation-a', [
          shownColumn('stale-target-id', { toEntity: { id: 'stale-target-id', value: 'cover' } }),
        ]),
      ],
      fetchBatch
    ).then(() => {
      expect(fetchBatch.mock.calls[0][0]).toEqual(['cover']);
    });
  });

  it('skips blocks that do not render as a gallery', async () => {
    // Only the gallery sizes itself from these, so nothing else should pay for the request or
    // carry the entities in its serialized page payload.
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        entity('table-block', [view(SystemIds.TABLE_VIEW), shownColumn('cover')]),
        entity('list-block', [view(SystemIds.LIST_VIEW), shownColumn('avatar')]),
        // No view relation at all defaults to a table.
        entity('default-block', [shownColumn('banner')]),
      ],
      fetchBatch
    );

    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it('skips the implicit Name column', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [galleryBlock('block-relation-a', [shownColumn(SystemIds.NAME_PROPERTY), shownColumn('cover')])],
      fetchBatch
    );

    expect(fetchBatch.mock.calls[0][0]).toEqual(['cover']);
  });

  it('de-duplicates a property shown by more than one block', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        galleryBlock('block-relation-a', [shownColumn('cover')]),
        galleryBlock('block-relation-b', [shownColumn('cover')]),
      ],
      fetchBatch
    );

    expect(fetchBatch.mock.calls[0][0]).toEqual(['cover']);
  });

  it('skips properties the caller already fetched as blocks', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [galleryBlock('block-relation-a', [shownColumn('cover')]), entity('cover')],
      fetchBatch
    );

    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it('ignores deleted shown columns and relations of other types', async () => {
    const fetchBatch = fetcher();

    await fetchShownPropertyEntitiesForBlocks(
      [
        galleryBlock('block-relation-a', [
          shownColumn('deleted-column', { isDeleted: true }),
          { type: { id: SystemIds.FILTER }, toEntity: { id: 'a-filter' } } as never,
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
