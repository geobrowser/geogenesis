import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPIC_TYPE_ID } from '~/core/constants';

import DefaultEntityPage from '../default-entity-page';
import { EntityRecordPage } from '../entity-record-page';
import { TopicRecordPage } from '../topic-record-page';
import TopicCommentsPage from './page';

const mocks = vi.hoisted(() => ({
  fetchEntityPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('../cached-fetch-entity', () => ({ cachedFetchEntityPage: mocks.fetchEntityPage }));
vi.mock('../default-entity-page', () => ({ default: () => null }));

const params = {
  id: 'b2c3d4e5f6a7418b9c0d1e2f3a4b5c6d',
  entityId: 'a1b2c3d4e5f6427a8b9c0d1e2f3a4b5c',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchEntityPage.mockResolvedValue({
    entity: { id: params.entityId, types: [{ id: TOPIC_TYPE_ID }], values: [] },
    relations: [],
  });
});

describe('legacy topic comments route', () => {
  it('reaches the shared entity page for a valid topic instead of returning 404', async () => {
    const searchParams = {};
    const route = TopicCommentsPage({
      params: Promise.resolve(params),
      searchParams: Promise.resolve(searchParams),
    });

    // Execute the actual server wrappers and guard. The body has separate coverage for
    // choosing TopicPageView, whose default content is Explore; only that boundary is mocked.
    expect(route.type).toBe(TopicRecordPage);
    const topic = TopicRecordPage(route.props);
    expect(topic.type).toBe(EntityRecordPage);
    const page = await EntityRecordPage(topic.props);

    expect(mocks.fetchEntityPage).toHaveBeenCalledWith(params.entityId, params.id);
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(page.type).toBe(DefaultEntityPage);
    expect(page.props).toEqual({ params, searchParams });
  });
});
