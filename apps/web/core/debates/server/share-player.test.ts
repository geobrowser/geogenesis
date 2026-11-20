import { describe, expect, it, vi } from 'vitest';

import type { DebateMediaArtifact, DebateMediaResponse } from '~/core/debates/api';
import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';

import { DEBATE_TYPE_ID } from '../ontology';
import {
  sharePlayerEnabled,
  sharePlayerHtml,
  sharePlayerMetadata,
  sharePlayerPath,
  sharePlayerResponse,
} from './share-player';

vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat.example');

const DEBATE_HEX = '01a1ef881e697960ae5db5b6d3ebaacd';
const SPACE_HEX = '89bd89bf28ff8a0963faf92a8c905e20';
const ORIGIN = 'https://preview.example';

function artifact(kind: DebateMediaArtifact['kind'], metadata: Record<string, unknown> = {}): DebateMediaArtifact {
  return {
    id: kind,
    kind,
    filename: `${kind}.bin`,
    content_type: kind === 'social_video' ? 'video/mp4' : 'image/jpeg',
    byte_size: 1,
    metadata,
    created_at: '2026-11-20T00:00:00Z',
  };
}

function media(artifacts: DebateMediaArtifact[]): DebateMediaResponse {
  return { artifacts } as DebateMediaResponse;
}

const videoUrl = `https://chat.example/debates/${DEBATE_HEX}/media/artifacts/social_video/content`;
const posterUrl = `https://chat.example/debates/${DEBATE_HEX}/media/artifacts/social_preview_image/content`;

describe('sharePlayerEnabled', () => {
  it('is on for Vercel previews and local dev only', () => {
    expect(sharePlayerEnabled({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(true);
    expect(sharePlayerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(sharePlayerEnabled({ VERCEL_ENV: 'production', NODE_ENV: 'production' })).toBe(false);
    expect(sharePlayerEnabled({ NODE_ENV: 'production' })).toBe(false);
  });
});

describe('sharePlayerMetadata', () => {
  const base = {
    origin: ORIGIN,
    spaceId: SPACE_HEX,
    debateId: DEBATE_HEX,
    title: 'Claim | A vs. B',
    description: 'Line',
  };

  it('keeps the static card for a debate with no share video', () => {
    expect(sharePlayerMetadata({ ...base, media: null })).toBeNull();
    expect(sharePlayerMetadata({ ...base, media: media([artifact('social_preview_image')]) })).toBeNull();
  });

  it('points the player card and og:video at the durable video route, sized like the video', () => {
    const result = sharePlayerMetadata({
      ...base,
      media: media([artifact('social_video', { width: 1080, height: 1920 }), artifact('social_preview_image')]),
    });

    expect(result?.twitter).toMatchObject({
      card: 'player',
      title: 'Claim | A vs. B',
      players: [
        {
          playerUrl: `${ORIGIN}/share-player/debate/${SPACE_HEX}/${DEBATE_HEX}`,
          streamUrl: videoUrl,
          width: 1080,
          height: 1920,
        },
      ],
      images: [posterUrl],
    });
    expect(result?.openGraph).toMatchObject({
      videos: [{ url: videoUrl, secureUrl: videoUrl, type: 'video/mp4', width: 1080, height: 1920 }],
    });
  });

  it('frames the video in a 16:9 player for ?card=wide', () => {
    const result = sharePlayerMetadata({ ...base, shape: 'wide', media: media([artifact('social_video')]) });
    expect(result?.twitter).toMatchObject({ players: [{ width: 1280, height: 720 }] });
  });

  it('falls back to 1080×1920 and leaves the share card as the poster when geo-chat omits them', () => {
    const result = sharePlayerMetadata({ ...base, media: media([artifact('social_video', { width: 'x' })]) });
    expect(result?.twitter).toMatchObject({ players: [{ width: 1080, height: 1920 }] });
    expect(result?.twitter).not.toHaveProperty('images');
  });

  it('resolves a relative geo-chat base against the page origin', () => {
    vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', '/geo-chat-proxy');
    const result = sharePlayerMetadata({ ...base, media: media([artifact('social_video')]) });
    expect(result?.openGraph).toMatchObject({
      videos: [{ url: `${ORIGIN}/geo-chat-proxy/debates/${DEBATE_HEX}/media/artifacts/social_video/content` }],
    });
    vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat.example');
  });
});

describe('sharePlayerPath', () => {
  it('spells the id without hyphens', () => {
    expect(sharePlayerPath('89bd89bf-28ff-8a09-63fa-f92a8c905e20', '01a1ef88-1e69-7960-ae5d-b5b6d3ebaacd')).toBe(
      `/share-player/debate/${SPACE_HEX}/${DEBATE_HEX}`
    );
  });
});

describe('sharePlayerHtml', () => {
  it('plays the durable video with its poster, and escapes the title', () => {
    const html = sharePlayerHtml({ debateId: DEBATE_HEX, title: '<b>"x"</b>' });
    expect(html).toContain(`src="${videoUrl}"`);
    expect(html).toContain(`poster="${posterUrl}"`);
    expect(html).toContain('playsinline');
    expect(html).not.toContain('<b>');
  });
});

// X keeps a card for days, so the player must stop playing a debate hidden or removed after it was
// shared, the way the page, its metadata and its share image already do.
describe('sharePlayerResponse', () => {
  const ids = { spaceId: SPACE_HEX, debateId: DEBATE_HEX };
  const debate = (values: unknown[] = []) => ({ name: 'Claim | A vs. B', types: [{ id: DEBATE_TYPE_ID }], values });
  const deps = (entity: unknown, visibility: 'visible' | 'removed' | 'unknown' = 'visible') => ({
    enabled: true,
    fetchEntity: vi.fn().mockResolvedValue(entity),
    fetchVisibility: vi.fn().mockResolvedValue(visibility),
  });

  it("plays a visible debate, titled with its name, reading the hidden flag in the link's space", async () => {
    const d = deps(debate());
    const response = await sharePlayerResponse(ids, d);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>Claim | A vs. B</title>');
    expect(d.fetchEntity).toHaveBeenCalledWith(DEBATE_HEX, SPACE_HEX, expect.any(AbortSignal));
  });

  it('404s a debate hidden in that space', async () => {
    const hidden = debate([{ property: { id: HIDDEN_PROPERTY_ID }, value: 'true' }]);
    expect((await sharePlayerResponse(ids, deps(hidden))).status).toBe(404);
  });

  it('404s a debate geo-chat reports removed', async () => {
    expect((await sharePlayerResponse(ids, deps(debate(), 'removed'))).status).toBe(404);
  });

  it('plays when geo-chat cannot say, since its content route refuses a removed video itself', async () => {
    expect((await sharePlayerResponse(ids, deps(debate(), 'unknown'))).status).toBe(200);
  });

  it('404s an entity that is not a Debate, or a graph that fails', async () => {
    expect((await sharePlayerResponse(ids, deps({ name: 'x', types: [], values: [] }))).status).toBe(404);
    const failing = { ...deps(null), fetchEntity: vi.fn().mockRejectedValue(new Error('graph down')) };
    expect((await sharePlayerResponse(ids, failing)).status).toBe(404);
  });

  it('404s off previews without reading anything, and a malformed id', async () => {
    const off = { ...deps(debate()), enabled: false };
    expect((await sharePlayerResponse(ids, off)).status).toBe(404);
    expect(off.fetchEntity).not.toHaveBeenCalled();
    expect((await sharePlayerResponse({ ...ids, debateId: 'nope' }, deps(debate()))).status).toBe(404);
    expect((await sharePlayerResponse({ ...ids, spaceId: 'nope' }, deps(debate()))).status).toBe(404);
  });
});
