import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPIC_TYPE_ID } from '~/core/constants';

import { generateMetadata } from './layout';

// A Topic page unfurls as the topic card; every other entity keeps the segment's `opengraph-image`,
// which Next only uses while this metadata sets no `images` of its own.

const SPACE_ID = '89bd89bf28ff8a0963faf92a8c905e20';
const ENTITY_ID = '90ff85ca38574b39ad441fe5f01b34ac';

const fetchEntityPage = vi.fn();

vi.mock('./cached-fetch-entity', () => ({
  cachedFetchEntityPage: (...args: unknown[]) => fetchEntityPage(...args),
  cachedFetchDebateVisibility: vi.fn(async () => 'visible'),
  cachedFetchEntitiesBatch: vi.fn(),
  cachedFetchEntity: vi.fn(),
}));

const page = (types: Array<{ id: string }>) => ({
  entity: { id: ENTITY_ID, name: 'Israel-Palestine Conflict', types, values: [], relations: [] },
  relations: [],
});

const metadata = () =>
  generateMetadata({ params: Promise.resolve({ id: SPACE_ID, entityId: ENTITY_ID }), children: null });

const CARD = `/explore/graph/${ENTITY_ID}/card?topic=${ENTITY_ID}&space=${SPACE_ID}&variant=topic&v=1`;

describe('entity layout metadata', () => {
  beforeEach(() => fetchEntityPage.mockReset());

  it('points a Topic’s og:image and twitter:image at the topic card', async () => {
    fetchEntityPage.mockResolvedValue(page([{ id: TOPIC_TYPE_ID }]));
    const result = await metadata();
    expect(result.title).toBe('Israel-Palestine Conflict');
    expect(result.openGraph?.images).toEqual([expect.objectContaining({ url: CARD, width: 1200, height: 630 })]);
    expect(result.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image', images: [CARD] }));
  });

  it('leaves every other type on the file-based image', async () => {
    for (const types of [[{ id: SystemIds.PERSON_TYPE }], [], [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]]) {
      fetchEntityPage.mockResolvedValue(page(types));
      const result = await metadata();
      expect(result.openGraph).toBeUndefined();
      expect(result.twitter).toBeUndefined();
    }
  });
});
