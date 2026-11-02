import { describe, expect, it, vi } from 'vitest';

import { generateMetadata } from './page';

const SPACE_ID = '41e851610e13a19441c4d980f2f2ce6b';

vi.mock('../../cached-fetch-space', () => ({
  cachedFetchSpace: async () => ({ id: SPACE_ID, entity: { id: 'topic', name: 'AI', values: [] } }),
}));

// The body pulls in the whole editor; metadata never reaches it.
vi.mock('../space-overview-body', () => ({ SpaceOverviewBody: () => null }));

describe('topic space Overview metadata', () => {
  it("keeps the space's own title, as the bare URL does", async () => {
    // Page metadata is not inherited by sibling routes, so without its own `generateMetadata` this
    // page would fall back to the app's generic title.
    await expect(generateMetadata({ params: Promise.resolve({ id: SPACE_ID }) })).resolves.toMatchObject({
      title: 'AI',
    });
  });
});
