import { describe, expect, it, vi } from 'vitest';

import { fetchTopicTaggedInSpace } from './use-topic-tagged-in-space';

const TOPIC = '4ed3162278994f29bde7a6f7cf60e28e';
const SPACE = '89bd89bf28ff8a0963faf92a8c905e20';

describe('fetchTopicTaggedInSpace', () => {
  it('asks once per distinct id, walks every page and returns hex ids', async () => {
    const fetchPage = vi.fn(async ({ after }: { fromEntityIds: string[]; after: string | undefined }) =>
      after
        ? { items: ['bbbbbbbb-0000-4000-8000-000000000002'], endCursor: '2', hasNextPage: false }
        : { items: ['aaaaaaaa000040008000000000000001'], endCursor: '1', hasNextPage: true }
    );

    const tagged = await fetchTopicTaggedInSpace({
      topicId: TOPIC,
      spaceId: SPACE,
      entityIds: [
        'aaaaaaaa-0000-4000-8000-000000000001',
        'aaaaaaaa000040008000000000000001',
        'bbbbbbbb000040008000000000000002',
      ],
      fetchPage,
    });

    expect(fetchPage.mock.calls[0]![0].fromEntityIds).toEqual([
      'aaaaaaaa000040008000000000000001',
      'bbbbbbbb000040008000000000000002',
    ]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect([...tagged].sort()).toEqual(['aaaaaaaa000040008000000000000001', 'bbbbbbbb000040008000000000000002']);
  });

  it('asks for nothing without ids', async () => {
    const fetchPage = vi.fn();
    expect(await fetchTopicTaggedInSpace({ topicId: TOPIC, spaceId: SPACE, entityIds: [], fetchPage })).toEqual(
      new Set()
    );
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
