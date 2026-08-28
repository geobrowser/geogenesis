import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SubtopicGalleryServerContainer } from './subtopic-gallery-server-container';

const mocks = vi.hoisted(() => ({
  cachedFetchSpace: vi.fn(),
  fetchSubtopics: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock('~/app/space/[id]/cached-fetch-space', () => ({ cachedFetchSpace: mocks.cachedFetchSpace }));
vi.mock('~/core/io/subgraph/fetch-subtopics', () => ({ fetchSubtopics: mocks.fetchSubtopics }));
vi.mock('~/core/telemetry/logger', () => ({ reportError: mocks.reportError }));
vi.mock('~/partials/space-page/subtopic-gallery', () => ({
  SubtopicGallery: ({ spaceId, subtopics }: { spaceId: string; subtopics: unknown[] }) => (
    <div data-testid="gallery" data-space-id={spaceId} data-count={subtopics.length} />
  ),
}));

const SPACE_ID = 'a19c345ab9866679b001d7d2138d88a1';

beforeEach(() => {
  mocks.cachedFetchSpace.mockReset().mockResolvedValue({ id: SPACE_ID });
  mocks.fetchSubtopics.mockReset();
  mocks.reportError.mockReset();
});

describe('SubtopicGalleryServerContainer', () => {
  it('renders the gallery when subtopics resolve', async () => {
    mocks.fetchSubtopics.mockResolvedValue([{ id: 'topic-1' }, { id: 'topic-2' }]);

    const result = await SubtopicGalleryServerContainer({ spaceId: SPACE_ID });

    expect(result).not.toBeNull();
    expect(result?.props.subtopics).toHaveLength(2);
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it('renders nothing when the space has no subtopics', async () => {
    mocks.fetchSubtopics.mockResolvedValue([]);

    expect(await SubtopicGalleryServerContainer({ spaceId: SPACE_ID })).toBeNull();
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  /**
   * GEOGENESIS-1T. The upstream returns transient 503s under database pressure, `fetchSubtopics`
   * turns any transport failure into a throw, and this is an async Server Component — so before
   * this the throw escaped and took the whole space page's render with it, 1,945 times since March.
   */
  it('degrades to nothing instead of throwing when the subtopics lookup fails', async () => {
    const failure = new Error(`Failed to fetch subtopics for space ${SPACE_ID}`);
    mocks.fetchSubtopics.mockRejectedValue(failure);

    await expect(SubtopicGalleryServerContainer({ spaceId: SPACE_ID })).resolves.toBeNull();
  });

  it('still reports the failure, as handled', async () => {
    const failure = new Error('Service temporarily unavailable due to database pressure; please retry.');
    mocks.fetchSubtopics.mockRejectedValue(failure);

    await SubtopicGalleryServerContainer({ spaceId: SPACE_ID });

    expect(mocks.reportError).toHaveBeenCalledWith(failure, {
      tags: { surface: 'subtopic-gallery' },
      contexts: { space: { spaceId: SPACE_ID } },
    });
  });

  it('renders nothing, and asks for no subtopics, when the space itself is missing', async () => {
    mocks.cachedFetchSpace.mockResolvedValue(null);

    expect(await SubtopicGalleryServerContainer({ spaceId: SPACE_ID })).toBeNull();
    expect(mocks.fetchSubtopics).not.toHaveBeenCalled();
  });
});
