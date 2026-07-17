import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENTATION_SPACE_ID, PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { AbortError } from '~/core/io/subgraph/errors';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';

import { fetchBrowseSidebarData } from './fetch-browse-sidebar-data';

const mocks = vi.hoisted(() => ({
  fetchEditorSpaceIds: vi.fn(),
  fetchFeaturedSpaces: vi.fn(),
  fetchPendingEditorshipSpaceIds: vi.fn(),
  fetchPendingMembershipSpaceIds: vi.fn(),
  getSpaces: vi.fn(),
  getSpacesWhereMember: vi.fn(),
}));

vi.mock('~/core/io/queries', () => ({
  getSpaces: (...args: unknown[]) => mocks.getSpaces(...args),
  getSpacesWhereMember: (...args: unknown[]) => mocks.getSpacesWhereMember(...args),
}));

vi.mock('~/core/io/subgraph/fetch-editor-space-ids', () => ({
  fetchEditorSpaceIds: (...args: unknown[]) => mocks.fetchEditorSpaceIds(...args),
}));

vi.mock('~/core/io/subgraph/fetch-featured-spaces', () => ({
  fetchFeaturedSpaces: (...args: unknown[]) => mocks.fetchFeaturedSpaces(...args),
}));

vi.mock('~/core/io/subgraph/fetch-pending-membership-space-ids', () => ({
  fetchPendingEditorshipSpaceIds: (...args: unknown[]) => mocks.fetchPendingEditorshipSpaceIds(...args),
  fetchPendingMembershipSpaceIds: (...args: unknown[]) => mocks.fetchPendingMembershipSpaceIds(...args),
}));

function featuredSpace(spaceId: string, name: string, image = `ipfs://${spaceId}`): FeaturedSpace {
  return { spaceId, topicId: `topic-${spaceId}`, name, image, memberCount: 1 };
}

function spaceRow(id: string, name = id, image = PLACEHOLDER_SPACE_IMAGE) {
  return { id, entity: { name, image } };
}

describe('fetchBrowseSidebarData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchEditorSpaceIds.mockResolvedValue([]);
    mocks.fetchFeaturedSpaces.mockResolvedValue([]);
    mocks.fetchPendingEditorshipSpaceIds.mockResolvedValue([]);
    mocks.fetchPendingMembershipSpaceIds.mockResolvedValue([]);
    mocks.getSpaces.mockImplementation(({ spaceIds }: { spaceIds: string[] }) =>
      Effect.succeed(spaceIds.map(id => spaceRow(id)))
    );
    mocks.getSpacesWhereMember.mockReturnValue(Effect.succeed([]));
  });

  it('uses the Explore featured-space traversal as the Browse Featured-spaces source', async () => {
    mocks.fetchFeaturedSpaces.mockResolvedValue([
      featuredSpace('space-b', 'Beta'),
      featuredSpace('space-a', 'Alpha', PLACEHOLDER_SPACE_IMAGE),
    ]);

    const result = await fetchBrowseSidebarData(null);

    expect(result.featured).toEqual([
      { id: 'space-b', name: 'Beta', image: 'ipfs://space-b', unnamed: false },
      { id: 'space-a', name: 'Alpha', image: null, unnamed: false },
    ]);
    expect(mocks.fetchFeaturedSpaces).toHaveBeenCalledOnce();
    expect(mocks.getSpaces).toHaveBeenCalledWith({ spaceIds: [DOCUMENTATION_SPACE_ID], limit: 1 });
  });

  it('reuses a supplied in-flight featured-space traversal', async () => {
    const sharedFeaturedSpaces = Promise.resolve([featuredSpace('space-a', 'Alpha')]);

    const result = await fetchBrowseSidebarData(null, sharedFeaturedSpaces);

    expect(result.featured.map(row => row.id)).toEqual(['space-a']);
    expect(mocks.fetchFeaturedSpaces).not.toHaveBeenCalled();
  });

  it('removes joined and pending spaces from Featured while preserving their Browse sections', async () => {
    const editorId = 'editor-space';
    const pendingMemberId = 'pending-member-space';
    const remainingId = 'remaining-space';
    mocks.fetchFeaturedSpaces.mockResolvedValue([
      featuredSpace(editorId, 'Editor'),
      featuredSpace(pendingMemberId, 'Pending'),
      featuredSpace(remainingId, 'Remaining'),
    ]);
    mocks.fetchEditorSpaceIds.mockResolvedValue([editorId]);
    mocks.fetchPendingMembershipSpaceIds.mockResolvedValue([pendingMemberId]);

    const result = await fetchBrowseSidebarData('personal-space');

    expect(result.featured.map(row => row.id)).toEqual([remainingId]);
    expect(result.editorOf.map(row => row.id)).toEqual([editorId]);
    expect(result.memberOf).toEqual([
      expect.objectContaining({ id: pendingMemberId, pendingLabel: 'Membership pending' }),
    ]);
  });

  it('keeps member and editor sections usable when the featured-space source fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.fetchFeaturedSpaces.mockRejectedValue(new Error('indexer unavailable'));
    mocks.fetchEditorSpaceIds.mockResolvedValue(['editor-space']);

    const result = await fetchBrowseSidebarData('personal-space');

    expect(result.featured).toEqual([]);
    expect(result.editorOf.map(row => row.id)).toEqual(['editor-space']);
    expect(result.personalSpaceId).toBe('personal-space');
    expect(consoleError).toHaveBeenCalledWith(
      'Unable to load Featured spaces for the Browse sidebar',
      expect.any(Error)
    );
    consoleError.mockRestore();
  });

  it('preserves featured-space request cancellation', async () => {
    const abort = new AbortError();
    mocks.fetchFeaturedSpaces.mockRejectedValue(abort);

    await expect(fetchBrowseSidebarData(null)).rejects.toBe(abort);
  });
});
