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

const { fetchOverviewSubspaces, resolveSpaceSidebar } = await import('./space-sidebar');

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';

beforeEach(() => {
  mocks.cachedFetchSpace.mockReset().mockResolvedValue({ id: SPACE_ID, topicId: null, entity: { id: SPACE_ID } });
  mocks.fetchCommunityCalls.mockReset().mockResolvedValue([]);
  mocks.fetchSubtopics.mockReset().mockResolvedValue([]);
  mocks.reportError.mockReset();
});

describe('fetchOverviewSubspaces', () => {
  it('returns the space’s subspaces', async () => {
    mocks.fetchSubtopics.mockResolvedValue([{ id: 'topic-1' }, { id: 'topic-2' }]);

    expect(await fetchOverviewSubspaces(SPACE_ID)).toHaveLength(2);
  });

  it('reports a failure and still resolves', async () => {
    // GEOGENESIS-1T: `fetchSubtopics` throws on any transport failure, and while this ran as an
    // uncaught async Server Component above the editor, a retryable upstream blip was a render
    // error on the space page — 1,945 of them, nearly all on `/root`. The rail is decoration and
    // has to fail soft; the signal is still worth keeping, hence the report.
    mocks.fetchSubtopics.mockRejectedValue(new Error('Service temporarily unavailable'));

    expect(await fetchOverviewSubspaces(SPACE_ID)).toEqual([]);
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
  });
});

describe('resolveSpaceSidebar', () => {
  it('does not fetch subspaces', async () => {
    // The `(space)` layout awaits this, so every route under it would pay for a query only
    // Overview renders — /community, /claims, /debates and every `?tabId=` tab. Root would feel it
    // worst, having no other fetch here at all.
    await resolveSpaceSidebar(SPACE_ID);

    expect(mocks.fetchSubtopics).not.toHaveBeenCalled();
  });

  it('seeds the header width on community calls alone', async () => {
    mocks.fetchCommunityCalls.mockResolvedValue([{ id: 'series-1' }]);

    expect((await resolveSpaceSidebar(SPACE_ID)).hasSidebar).toBe(true);
  });

  it('does not seed a width for a space whose only rail content is Overview-only', async () => {
    // `/community` shares this layout and renders neither subspaces nor daily activities. Seeding
    // on one of those would widen its header and then jump when the client reported an empty rail.
    mocks.fetchSubtopics.mockResolvedValue([{ id: 'topic-1' }]);

    expect((await resolveSpaceSidebar(SPACE_ID)).hasSidebar).toBe(false);
  });

  it('does not open a rail for an external-topic space', async () => {
    // Those render through `TopicEntityBody`, which has no rail at all — it keeps the inline
    // gallery instead.
    mocks.cachedFetchSpace.mockResolvedValue({ id: SPACE_ID, topicId: 'other-topic', entity: { id: SPACE_ID } });
    mocks.fetchCommunityCalls.mockResolvedValue([{ id: 'series-1' }]);

    const result = await resolveSpaceSidebar(SPACE_ID);

    expect(result.isExternalTopic).toBe(true);
    expect(result.hasSidebar).toBe(false);
  });
});
