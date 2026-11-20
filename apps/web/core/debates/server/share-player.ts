import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import type { DebateMediaResponse } from '~/core/debates/api';
import { ID } from '~/core/id';
import type { Entity } from '~/core/types';

import { isGeoChatDebateId } from '../debate-removal';
import { debateArtifactContentUrl } from '../speaker-still';
import { type DebateVisibility, fetchDebateVisibility } from './debate-visibility';
import {
  type DebateEntity,
  PUBLISHED_DEBATE_LOOKUP_TIMEOUT_MS,
  fetchEntityFromGraph,
  isVisibleDebate,
} from './published-debate-path';

/**
 * GEO-3817 experiment: a playable share card for debate links. X gets a player card (poster with a
 * play button that plays the share video inside the card) and iMessage gets `og:video`.
 *
 * Preview deployments only, so production's cards do not change while we look at how this renders
 * on X and in iMessage. Local dev is included so the tags can be checked before pushing.
 */
export function sharePlayerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === 'preview' || env.NODE_ENV === 'development';
}

/**
 * The page X frames in the card. Outside `/api/`, which robots.txt disallows and X's crawler honours.
 * It carries the space so the player reads the hidden flag in the same scope the debate page does.
 */
export function sharePlayerPath(spaceId: string, debateId: string): string {
  return `/share-player/debate/${ID.uuidToHex(spaceId)}/${ID.uuidToHex(debateId)}`;
}

/** Share videos are 1080×1920; an artifact that does not say otherwise is assumed to be one. */
const DEFAULT_VIDEO_SIZE = { width: 1080, height: 1920 };

/** `?card=wide` frames the same vertical video in a 16:9 player, to compare how X lays out each. */
const WIDE_PLAYER_SIZE = { width: 1280, height: 720 };

export type SharePlayerShape = 'video' | 'wide';

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The player-card and `og:video` tags for a debate, or null when it has no share video (it keeps
 * today's static card). The video and poster are geo-chat's durable content routes, which 302 to a
 * freshly signed URL on every request, so a card X or iMessage cached hours ago still plays.
 */
export function sharePlayerMetadata({
  origin,
  spaceId,
  debateId,
  media,
  title,
  description,
  shape = 'video',
}: {
  origin: string;
  spaceId: string;
  debateId: string;
  media: DebateMediaResponse | null;
  title: string;
  description?: string;
  shape?: SharePlayerShape;
}): Pick<Metadata, 'openGraph' | 'twitter'> | null {
  const video = media?.artifacts.find(artifact => artifact.kind === 'social_video');
  if (!video) return null;

  const videoSize = {
    width: positiveNumber(video.metadata.width) ?? DEFAULT_VIDEO_SIZE.width,
    height: positiveNumber(video.metadata.height) ?? DEFAULT_VIDEO_SIZE.height,
  };
  const playerSize = shape === 'wide' ? WIDE_PLAYER_SIZE : videoSize;
  const hasPoster = media?.artifacts.some(artifact => artifact.kind === 'social_preview_image') ?? false;

  // Absolute, because a crawler resolves nothing; the public base is relative in the dev setup.
  const absolute = (url: string) => new URL(url, origin).toString();
  const videoUrl = absolute(debateArtifactContentUrl(debateId, 'social_video'));
  const playerUrl = absolute(sharePlayerPath(spaceId, debateId));

  return {
    openGraph: {
      title,
      description,
      type: 'video.other',
      videos: [{ url: videoUrl, secureUrl: videoUrl, type: video.content_type || 'video/mp4', ...videoSize }],
    },
    twitter: {
      card: 'player',
      site: '@geobrowser',
      creator: '@geobrowser',
      title,
      description,
      players: [{ playerUrl, streamUrl: videoUrl, ...playerSize }],
      // The poster shown with the play button: the video's own first frame, so the card does not
      // jump from a landscape share card to a vertical video. Without one, the share card stays.
      ...(hasPoster ? { images: [absolute(debateArtifactContentUrl(debateId, 'social_preview_image'))] } : {}),
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
}

/**
 * The page inside X's card iframe: just the video, letterboxed on black so either player shape
 * shows all of it. A route handler rather than a page, because every page sits under the app's
 * client-only Privy provider and would paint nothing until the whole app bundle had loaded.
 */
export function sharePlayerHtml({ debateId, title }: { debateId: string; title: string }): string {
  const src = escapeHtml(debateArtifactContentUrl(debateId, 'social_video'));
  const poster = escapeHtml(debateArtifactContentUrl(debateId, 'social_preview_image'));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
</style>
</head>
<body>
<video src="${src}" poster="${poster}" controls playsinline preload="metadata"></video>
</body>
</html>`;
}

type SharePlayerDeps = {
  enabled?: boolean;
  fetchEntity?: (
    entityId: string,
    spaceId: string,
    signal: AbortSignal
  ) => Promise<(DebateEntity & Pick<Entity, 'name'>) | null>;
  fetchVisibility?: (entityId: string) => Promise<DebateVisibility>;
};

/**
 * The player route's response. X keeps a card for days, so the player itself must stop playing a
 * debate that was hidden or removed after it was shared: it 404s whenever the debate page would not
 * show the debate (hidden in this space, not a Debate, or removed by geo-chat). A graph that cannot
 * be read in time also 404s, as the page would; a geo-chat that cannot be read does not, since its
 * own content route refuses a removed debate's video anyway.
 */
export async function sharePlayerResponse(
  { spaceId, debateId }: { spaceId: string; debateId: string },
  {
    enabled = sharePlayerEnabled(),
    fetchEntity = fetchEntityFromGraph,
    fetchVisibility = id => fetchDebateVisibility(id),
  }: SharePlayerDeps = {}
): Promise<Response> {
  const notFound = () => new Response('Not found', { status: 404 });
  if (!enabled || !IdUtils.isValid(spaceId) || !isGeoChatDebateId(debateId)) return notFound();

  const [entity, visibility] = await Promise.all([
    fetchEntity(debateId, spaceId, AbortSignal.timeout(PUBLISHED_DEBATE_LOOKUP_TIMEOUT_MS)).catch(() => null),
    fetchVisibility(debateId),
  ]);
  if (!isVisibleDebate(entity) || visibility === 'removed') return notFound();

  return new Response(sharePlayerHtml({ debateId, title: entity?.name || 'Geo debate' }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
