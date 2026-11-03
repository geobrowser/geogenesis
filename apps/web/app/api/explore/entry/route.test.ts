import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ context: vi.fn(), feed: vi.fn(), playable: vi.fn() }));
vi.mock('~/core/explore/resolve-explore-feed-request-context', () => ({
  resolveExploreFeedRequestContext: mocks.context,
}));
vi.mock('~/core/explore/fetch-explore-feed', () => ({
  fetchExploreFeed: mocks.feed,
  debateHasProcessedVideo: mocks.playable,
}));

const ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DEBATE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const claim = { entityId: ID, types: [] };
const debate = { entityId: DEBATE, types: [{ id: DEBATE_TYPE_ID }] };
const request = (id = ID) => new Request(`https://www.geobrowser.io/api/explore/entry?entityId=${id}`);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    browse: { featured: [] },
    memberOrEditorSpaceIds: ['member'],
    personalMemberSpaceId: 'personal',
    walletAddress: null,
  });
  mocks.feed.mockResolvedValue({ items: [claim, debate] });
  mocks.playable.mockResolvedValue(true);
});
describe('selected Explore entry', () => {
  it('rejects invalid ids before querying the graph', async () => {
    expect((await GET(request('bad'))).status).toBe(400);
    expect(mocks.feed).not.toHaveBeenCalled();
  });
  it('finds a playable debate for a claim using the viewer’s normal space scope', async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ item: debate });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.feed).toHaveBeenCalledWith(
      expect.objectContaining({
        browse: { featured: [] },
        memberOrEditorSpaceIds: ['member'],
        viewerMemberSpaceId: 'personal',
        spaceFilterIds: null,
        time: 'all',
        entityFilter: {
          or: [
            { id: { is: ID } },
            { relations: { some: { typeId: { is: DEBATE_CLAIMS_PROPERTY_ID }, toEntityId: { is: ID } } } },
          ],
        },
      })
    );
  });
  it('preserves the selected debate when it is playable', async () => {
    const selected = { ...debate, entityId: ID };
    mocks.feed.mockResolvedValue({ items: [debate, selected] });
    expect(await (await GET(request())).json()).toEqual({ item: selected });
  });
  it('falls back to the claim when its debates have no processed media', async () => {
    mocks.playable.mockResolvedValue(false);
    expect(await (await GET(request())).json()).toEqual({ item: claim });
  });
  it('does not synthesize a card for an unavailable entity', async () => {
    mocks.feed.mockResolvedValue({ items: [] });
    expect(await (await GET(request())).json()).toEqual({ item: null });
  });
  it('returns a retryable failure when the graph cannot be read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.feed.mockRejectedValue(new Error('unavailable'));
    expect((await GET(request())).status).toBe(503);
    log.mockRestore();
  });
});
