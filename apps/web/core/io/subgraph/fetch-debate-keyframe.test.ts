import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchDebateKeyframe } from './fetch-debate-keyframe';

const graphqlMock = vi.fn();

vi.mock('~/core/environment', () => ({
  Environment: { getConfig: () => ({ api: 'https://example.com/graphql' }) },
}));

vi.mock('./graphql', () => ({
  graphql: (...args: unknown[]) => graphqlMock(...args),
}));

const IMAGE_URL = '8a743832c0944a62b6650c3cc2f9c7bc';
const WEB_URL = '412ff593e9154012a43d4c27ec5c68b6';
const DEBATE = '01a15b610e7075709ac5b5acd61c36d5';

const withKeyframes = (...frames: { propertyId: string; text: string | null }[][]) =>
  Effect.succeed({
    entity: { videos: [{ toEntity: { keyframes: frames.map(valuesList => ({ toEntity: { valuesList } })) } }] },
  });

describe('fetchDebateKeyframe', () => {
  beforeEach(() => graphqlMock.mockReset());

  it('prefers the pinned IPFS still over the web URL', async () => {
    graphqlMock.mockReturnValue(
      withKeyframes([
        { propertyId: WEB_URL, text: `https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media` },
        { propertyId: IMAGE_URL, text: 'ipfs://QmStill' },
      ])
    );
    expect(await fetchDebateKeyframe(DEBATE)).toBe('ipfs://QmStill');
    expect((graphqlMock.mock.calls[0]?.[0] as { query: string }).query).toContain(`entity(id: "${DEBATE}")`);
  });

  it("falls back to geo-chat's web URL, then to a later keyframe", async () => {
    const web = `https://chat-api-testnet.geobrowser.io/debates/${DEBATE}/media/artifacts/preview_image/content`;
    graphqlMock.mockReturnValue(
      withKeyframes([{ propertyId: WEB_URL, text: 'not a url' }], [{ propertyId: WEB_URL, text: web }])
    );
    expect(await fetchDebateKeyframe(DEBATE)).toBe(web);
  });

  it('is null with no video, or when the graph fails', async () => {
    graphqlMock.mockReturnValue(Effect.succeed({ entity: { videos: [] } }));
    expect(await fetchDebateKeyframe(DEBATE)).toBeNull();
    graphqlMock.mockReturnValue(Effect.fail(new Error('down')));
    expect(await fetchDebateKeyframe(DEBATE)).toBeNull();
  });
});
