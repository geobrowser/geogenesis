import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateMediaResponse } from '~/core/debates/api';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';

import { generateMetadata } from './page';

// GEO-3817: the playable share card is preview-only, and a hidden or removed debate must never gain
// one. The layout guards its own metadata; this is the page's, which the layout's does not cover.

const SPACE_ID = '89bd89bf28ff8a0963faf92a8c905e20';
const DEBATE_ID = '01a1ef881e697960ae5db5b6d3ebaacd';

const fetchEntityPage = vi.fn();
const fetchVisibility = vi.fn();
const fetchMedia = vi.fn();

vi.mock('./cached-fetch-entity', () => ({
  cachedFetchEntityPage: (...args: unknown[]) => fetchEntityPage(...args),
  cachedFetchDebateVisibility: (...args: unknown[]) => fetchVisibility(...args),
  cachedFetchDebatePageMedia: (...args: unknown[]) => fetchMedia(...args),
  cachedReadDebateVisibility: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'preview.example' }) }));
// The page's render path, which these tests never reach.
vi.mock('./default-entity-page', () => ({ default: () => null }));
vi.mock('./post-entity-page', () => ({ default: () => null }));
vi.mock('./profile-entity-server-container', () => ({ ProfileEntityServerContainer: () => null }));
vi.mock('~/core/debates/browse/debate-entity-view', () => ({ DebateEntityView: () => null }));
vi.mock('~/core/debates/browse/debate-removed-view', () => ({ DebateRemovedView: () => null }));
vi.mock('~/partials/bounties/bounty-detail-header', () => ({ BountyDetailHeader: () => null }));
vi.mock('~/partials/bounties/bounty-detail-sections', () => ({ BountyDetailSections: () => null }));
vi.mock('~/partials/community-calls/community-call-recording', () => ({ CommunityCallRecording: () => null }));
vi.mock('~/core/auth/server/wallet-session', () => ({ readWalletSession: vi.fn() }));

const debate = (values: unknown[] = []) => ({
  entity: { id: DEBATE_ID, name: 'Claim | A vs. B', types: [{ id: DEBATE_TYPE_ID }], values, relations: [] },
  relations: [],
});

const withVideo = {
  artifacts: [{ id: 'v', kind: 'social_video', content_type: 'video/mp4', metadata: {} }],
} as unknown as DebateMediaResponse;

const props = (searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({ id: SPACE_ID, entityId: DEBATE_ID }),
  searchParams: Promise.resolve(searchParams),
});

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat.example');
  fetchEntityPage.mockResolvedValue(debate());
  fetchVisibility.mockResolvedValue('visible');
  fetchMedia.mockResolvedValue(withVideo);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('debate page generateMetadata (GEO-3817)', () => {
  it('gives a visible debate with a share video the player card, at the request origin and its space', async () => {
    const metadata = await generateMetadata(props());
    expect(metadata.twitter).toMatchObject({
      card: 'player',
      players: [
        {
          playerUrl: `https://preview.example/share-player/debate/${SPACE_ID}/${DEBATE_ID}`,
          width: 1080,
          height: 1920,
        },
      ],
    });
    expect(fetchEntityPage).toHaveBeenCalledWith(DEBATE_ID, SPACE_ID);
  });

  it('sizes the player 16:9 for ?card=wide', async () => {
    const metadata = await generateMetadata(props({ card: 'wide' }));
    expect(metadata.twitter).toMatchObject({ players: [{ width: 1280, height: 720 }] });
  });

  it('adds nothing in production, without reading the graph or geo-chat', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');
    expect(await generateMetadata(props())).toEqual({});
    expect(fetchEntityPage).not.toHaveBeenCalled();
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it('adds nothing for a hidden debate', async () => {
    fetchEntityPage.mockResolvedValue(debate([{ property: { id: HIDDEN_PROPERTY_ID }, value: 'true' }]));
    expect(await generateMetadata(props())).toEqual({});
  });

  it('adds nothing for a debate geo-chat reports removed', async () => {
    fetchVisibility.mockResolvedValue('removed');
    expect(await generateMetadata(props())).toEqual({});
  });

  it('adds nothing for an entity that is not a Debate', async () => {
    fetchEntityPage.mockResolvedValue({ entity: { ...debate().entity, types: [] }, relations: [] });
    expect(await generateMetadata(props())).toEqual({});
  });
});
