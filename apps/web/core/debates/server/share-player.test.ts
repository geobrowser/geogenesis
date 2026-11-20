import { describe, expect, it, vi } from 'vitest';

import type { DebateMediaArtifact, DebateMediaResponse } from '~/core/debates/api';

import { sharePlayerEnabled, sharePlayerHtml, sharePlayerMetadata, sharePlayerPath } from './share-player';

vi.stubEnv('NEXT_PUBLIC_GEO_CHAT_API_BASE_URL', 'https://chat.example');

const DEBATE_HEX = '01a1ef881e697960ae5db5b6d3ebaacd';
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
  const base = { origin: ORIGIN, debateId: DEBATE_HEX, title: 'Claim | A vs. B', description: 'Line' };

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
        { playerUrl: `${ORIGIN}/share-player/debate/${DEBATE_HEX}`, streamUrl: videoUrl, width: 1080, height: 1920 },
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
    expect(sharePlayerPath('01a1ef88-1e69-7960-ae5d-b5b6d3ebaacd')).toBe(`/share-player/debate/${DEBATE_HEX}`);
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
