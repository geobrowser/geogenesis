import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPIC_TYPE_ID } from '~/core/constants';

import { fetchEntityPageData } from './fetch-entity-page-data';

// A Topic draws its own template, never its blocks' collections, so its page must not carry the
// collection items: on the Israel-Palestine conflict topic they were 650 KB of an 833 KB page.

const SPACE_ID = '89bd89bf28ff8a0963faf92a8c905e20';
const ENTITY_ID = '90ff85ca38574b39ad441fe5f01b34ac';
const BLOCK_ID = '1116a7de3cbe4f0faa865f21824564a6';
const ITEM = { id: '3a0332854d241561a38b0fd54807e969', name: 'A claim', types: [], relations: [], values: [] };

const fetchEntityPage = vi.fn();
const fetchCollectionItems = vi.fn();

vi.mock('./cached-fetch-entity', () => ({
  cachedFetchEntityPage: (...args: unknown[]) => fetchEntityPage(...args),
  cachedFetchEntitiesBatch: async (ids: string[]) =>
    ids.map(id => ({ id, name: null, types: [], relations: [], values: [] })),
}));
vi.mock('~/app/space/[id]/cached-fetch-space', () => ({ cachedFetchSpace: vi.fn() }));
vi.mock('~/core/blocks/data/fetch-collection-items', () => ({
  fetchCollectionItemsForBlocks: (...args: unknown[]) => fetchCollectionItems(...args),
}));
vi.mock('~/core/blocks/data/fetch-block-shown-properties', () => ({
  fetchShownPropertyEntitiesForBlocks: async () => [],
}));

const page = (typeId: string) => ({
  entity: {
    id: ENTITY_ID,
    name: 'Israel-Palestine conflict',
    spaces: [SPACE_ID],
    types: [{ id: typeId, name: null }],
    values: [],
    relations: [
      {
        id: 'r1',
        entityId: 'r1e',
        type: { id: SystemIds.BLOCKS, name: 'Blocks' },
        fromEntity: { id: ENTITY_ID, name: null },
        toEntity: { id: BLOCK_ID, name: null, value: BLOCK_ID },
        position: 'a0',
        spaceId: SPACE_ID,
      },
    ],
  },
  relations: [],
});

describe('fetchEntityPageData collection items', () => {
  beforeEach(() => {
    fetchEntityPage.mockReset();
    fetchCollectionItems.mockReset();
    fetchCollectionItems.mockResolvedValue({ [BLOCK_ID]: [ITEM] });
  });

  it('does not read or send collection items for a Topic', async () => {
    fetchEntityPage.mockResolvedValue(page(TOPIC_TYPE_ID));

    const data = await fetchEntityPageData(SPACE_ID, ENTITY_ID);

    expect(fetchCollectionItems).not.toHaveBeenCalled();
    expect(data.initialCollectionItems).toEqual({});
    expect(data.initialEntities.map(e => e.id)).not.toContain(ITEM.id);
    // The blocks themselves still travel, for edit mode.
    expect(data.blocks.map(e => e.id)).toContain(BLOCK_ID);
  });

  it('still sends them for an entity whose page draws its blocks', async () => {
    fetchEntityPage.mockResolvedValue(page('a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d'));

    const data = await fetchEntityPageData(SPACE_ID, ENTITY_ID);

    expect(fetchCollectionItems).toHaveBeenCalledTimes(1);
    expect(data.initialCollectionItems).toEqual({ [BLOCK_ID]: [ITEM] });
    expect(data.initialEntities.map(e => e.id)).toContain(ITEM.id);
  });
});
