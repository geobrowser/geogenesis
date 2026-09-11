import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cachedFetchSpace: vi.fn(),
  fetchCommunityCalls: vi.fn(),
  fetchSubtopics: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock('../cached-fetch-space', () => ({ cachedFetchSpace: mocks.cachedFetchSpace }));
vi.mock('~/core/community-calls/fetch-community-calls', () => ({ fetchCommunityCalls: mocks.fetchCommunityCalls }));
vi.mock('~/core/io/subgraph/fetch-subtopics', () => ({ fetchSubtopics: mocks.fetchSubtopics }));
vi.mock('~/core/telemetry/logger', () => ({ reportError: mocks.reportError }));
vi.mock('~/core/constants', () => ({ ROOT_SPACE: 'root000000000000000000000000000' }));

const { resolveSpaceSidebar } = await import('./space-sidebar');

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';

beforeEach(() => {
  mocks.cachedFetchSpace.mockReset().mockResolvedValue({ id: SPACE_ID, topicId: null, entity: { id: SPACE_ID } });
  mocks.fetchCommunityCalls.mockReset().mockResolvedValue([]);
  mocks.fetchSubtopics.mockReset().mockResolvedValue([]);
  mocks.reportError.mockReset();
});

describe('resolveSpaceSidebar', () => {
  it('carries the space’s subspaces so the rail can render them', async () => {
    mocks.fetchSubtopics.mockResolvedValue([{ id: 'topic-1' }, { id: 'topic-2' }]);

    const result = await resolveSpaceSidebar(SPACE_ID);

    expect(result.subspaces).toHaveLength(2);
  });

  it('reports a subtopics failure and still resolves', async () => {
    // GEOGENESIS-1T: `fetchSubtopics` throws on any transport failure, and while this ran as an
    // uncaught async Server Component above the editor, a retryable upstream blip was a render
    // error on the space page — 1,945 of them, nearly all on `/root`. The rail is decoration and
    // has to fail soft; the signal is still worth keeping, hence the report.
    mocks.fetchSubtopics.mockRejectedValue(new Error('Service temporarily unavailable'));

    const result = await resolveSpaceSidebar(SPACE_ID);

    expect(result.subspaces).toEqual([]);
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
  });

  it('gives a space with only subspaces a rail', async () => {
    mocks.fetchSubtopics.mockResolvedValue([{ id: 'topic-1' }]);

    const result = await resolveSpaceSidebar(SPACE_ID);

    // Seeds the header width. Before subspaces moved in, community calls were the only thing that
    // could open the rail, so a space with subspaces and no calls would have been laid out for a
    // rail it then rendered.
    expect(result.hasSidebar).toBe(true);
  });

  it('leaves a space with neither without one', async () => {
    const result = await resolveSpaceSidebar(SPACE_ID);

    expect(result.hasSidebar).toBe(false);
  });

  it('does not open a rail for an external-topic space', async () => {
    // Those render through `TopicEntityBody`, which has no rail at all — it keeps the inline
    // gallery instead.
    mocks.cachedFetchSpace.mockResolvedValue({ id: SPACE_ID, topicId: 'other-topic', entity: { id: SPACE_ID } });
    mocks.fetchSubtopics.mockResolvedValue([{ id: 'topic-1' }]);

    const result = await resolveSpaceSidebar(SPACE_ID);

    expect(result.isExternalTopic).toBe(true);
    expect(result.hasSidebar).toBe(false);
  });
});
