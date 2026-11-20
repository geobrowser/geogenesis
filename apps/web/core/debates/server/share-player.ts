import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import type { DebateMediaResponse } from '~/core/debates/api';
import { ID } from '~/core/id';
import type { Entity } from '~/core/types';

import { isGeoChatDebateId } from '../debate-removal';
import { debateArtifactContentUrl } from '../speaker-still';
import { fetchDebatePageMedia } from './debate-page-media';
import { type DebateVisibility, fetchDebateVisibility } from './debate-visibility';
import {
  type DebateEntity,
  PUBLISHED_DEBATE_LOOKUP_TIMEOUT_MS,
  fetchEntityFromGraph,
  isVisibleDebate,
} from './published-debate-path';
import { type ShareTestExperience, type ShareTestRect, shareTestExperience } from './share-test-experience';

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

/**
 * The player's frame on X. X draws a portrait player card compact (a small thumbnail beside the text),
 * so the default is a 16:9 frame with the landscape card as its image, which X draws full width like
 * a large-image card; the vertical video plays centred on black inside it. `?card=tall` keeps the
 * frame the video's own 9:16, for comparison.
 */
const WIDE_PLAYER_SIZE = { width: 1280, height: 720 };

export type SharePlayerShape = 'tall' | 'wide';

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
  shape = 'wide',
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
  // The hand-made landscape video, where this debate has one (`share-test-experience.ts`).
  const experience = shareTestExperience(debateId);
  if (!video && !experience) return null;

  const videoSize = experience
    ? experience.video
    : {
        width: positiveNumber(video?.metadata.width) ?? DEFAULT_VIDEO_SIZE.width,
        height: positiveNumber(video?.metadata.height) ?? DEFAULT_VIDEO_SIZE.height,
      };
  const playerSize = experience ? experience.video : shape === 'wide' ? WIDE_PLAYER_SIZE : videoSize;
  const hasPoster = media?.artifacts.some(artifact => artifact.kind === 'social_preview_image') ?? false;

  // Absolute, because a crawler resolves nothing; the public base is relative in the dev setup.
  const absolute = (url: string) => new URL(url, origin).toString();
  const videoUrl = experience ? experience.videoUrl : absolute(debateArtifactContentUrl(debateId, 'social_video'));
  const playerUrl = absolute(sharePlayerPath(spaceId, debateId));
  // The image X shows with the play button, matched to the frame: the landscape card (cut from the
  // first frame) in the wide one, the vertical first frame itself in the tall one. A render with no
  // recorded layout can't be cut, so it falls back to the vertical frame; with no frame at all, the
  // page's share card stays.
  const posterUrl = experience
    ? experience.cardUrl
    : !hasPoster
      ? null
      : shape === 'wide' && shareVideoLayout(media)
        ? absolute(sharePlayerCardPath(spaceId, debateId))
        : absolute(debateArtifactContentUrl(debateId, 'social_preview_image'));

  return {
    openGraph: {
      title,
      description,
      type: 'video.other',
      videos: [{ url: videoUrl, secureUrl: videoUrl, type: video?.content_type || 'video/mp4', ...videoSize }],
    },
    twitter: {
      card: 'player',
      site: '@geobrowser',
      creator: '@geobrowser',
      title,
      description,
      players: [{ playerUrl, streamUrl: videoUrl, ...playerSize }],
      ...(posterUrl ? { images: [posterUrl] } : {}),
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
}

/**
 * The page inside X's card iframe: the video, letterboxed on black so either player shape shows all
 * of it, plus the way out to the debate. X frames the whole card, so taps never reach the debate page
 * on their own; an "Open on Geo" link sits in the corner while it plays, and an end screen offers the
 * full debate and a replay. Both open a new tab, so the card keeps its place in the timeline.
 *
 * A route handler rather than a page, because every page sits under the app's client-only Privy
 * provider and would paint nothing until the whole app bundle had loaded.
 */
export function sharePlayerHtml({
  debateId,
  title,
  debateUrl,
  headTags = '',
}: {
  debateId: string;
  title: string;
  /** Where the click-through goes: the debate's page. Absent, the player has no way out. */
  debateUrl?: string;
  headTags?: string;
}): string {
  const experience = shareTestExperience(debateId);
  const src = escapeHtml(experience?.videoUrl ?? debateArtifactContentUrl(debateId, 'social_video'));
  const poster = escapeHtml(experience?.cardUrl ?? debateArtifactContentUrl(debateId, 'social_preview_image'));
  const href = debateUrl ? escapeHtml(debateUrl) : null;
  const clickThrough =
    experience && debateUrl
      ? experienceOverlay(experience, debateUrl)
      : href
        ? `
<a class="open" href="${href}" target="_blank" rel="noopener">Open on Geo</a>
<div class="end" hidden>
  <a class="full" href="${href}" target="_blank" rel="noopener">See the full debate on Geo</a>
  <button class="replay" type="button">Replay</button>
</div>
<script>
  (function () {
    var video = document.querySelector('video');
    var end = document.querySelector('.end');
    var open = document.querySelector('.open');
    video.addEventListener('ended', function () { end.hidden = false; open.hidden = true; });
    video.addEventListener('play', function () { end.hidden = true; open.hidden = false; });
    document.querySelector('.replay').addEventListener('click', function () {
      video.currentTime = 0;
      video.play();
    });
  })();
</script>`
        : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>${headTags ? `\n${headTags}` : ''}
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  body { position: relative; font: 600 14px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
  a { color: #fff; text-decoration: none; }
  .open {
    position: absolute; top: 12px; right: 12px; padding: 8px 12px; border-radius: 999px;
    background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  }
  .end {
    position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; background: rgba(0, 0, 0, 0.7);
  }
  .end[hidden], .open[hidden], .hot[hidden] { display: none; }
  .stage { position: absolute; inset: 0; }
  /* The made-for-it video is 16:9 with its buttons drawn in; the stage keeps the links on them. */
  .stage.fixed { margin: auto; aspect-ratio: 16 / 9; width: min(100vw, calc(100vh * 16 / 9)); height: auto; }
  .hot { position: absolute; border-radius: 999px; }
  .hot:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .full { padding: 12px 20px; border-radius: 999px; background: #fff; color: #000; font-size: 16px; }
  .replay {
    padding: 10px 16px; border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 999px;
    background: transparent; color: #fff; font: inherit; cursor: pointer;
  }
</style>
</head>
<body>
<div class="stage${experience ? ' fixed' : ''}"><video src="${src}" poster="${poster}" controls playsinline preload="metadata"></video>${clickThrough}</div>
</body>
</html>`;
}

/**
 * Real links laid over the buttons drawn into a made-for-it share video, each shown only while its
 * screen is on: Agree and Disagree on the claim screen, Watch on Geo while the reel plays, and all
 * three on the end screen, which stays once the video ends. Agree and Disagree open the debate with
 * `?side=`, which casts the vote there (kept on the device and the save sheet for a visitor). Every
 * link carries `stay=1`, so a visitor from X lands on this debate rather than the debates app.
 */
function experienceOverlay(experience: ShareTestExperience, debateUrl: string): string {
  const link = (side?: 'agree' | 'disagree') => {
    const url = new URL(debateUrl);
    if (side) url.searchParams.set('side', side);
    url.searchParams.set('stay', '1');
    return escapeHtml(url.toString());
  };
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  const hot = (group: string, rect: ShareTestRect, href: string, label: string) =>
    `<a class="hot" data-group="${group}" hidden href="${href}" target="_blank" rel="noopener" aria-label="${label}" style="left:${pct(rect.x)};top:${pct(rect.y)};width:${pct(rect.w)};height:${pct(rect.h)}"></a>`;
  const { claim, reel, end } = experience;
  return `
${hot('claim', claim.agree, link('agree'), 'Agree')}
${hot('claim', claim.disagree, link('disagree'), 'Disagree')}
${hot('reel', reel.watch, link(), 'Watch on Geo')}
${hot('end', end.agree, link('agree'), 'Agree')}
${hot('end', end.disagree, link('disagree'), 'Disagree')}
${hot('end', end.full, link(), 'Watch the full debate on Geo')}
<script>
  (function () {
    var video = document.querySelector('video');
    var spans = { claim: [${claim.start}, ${claim.end}], reel: [${reel.start}, ${reel.end}], end: [${end.start}, Infinity] };
    var links = document.querySelectorAll('.hot');
    function sync() {
      var t = video.ended ? Infinity : video.currentTime;
      links.forEach(function (a) {
        var span = spans[a.dataset.group];
        a.hidden = !(t >= span[0] && t < span[1]);
      });
    }
    ['timeupdate', 'seeked', 'ended', 'play'].forEach(function (e) { video.addEventListener(e, sync); });
  })();
</script>`;
}

/** Social previews size an image they're told the size of; the poster still is 540×960. */
const POSTER_SIZE = { width: 540, height: 960 };

/** The landscape share image, at the 1.91:1 every link preview is shaped for. */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

/** The share image cut from the video's first frame (`share-player-card.ts`). */
export function sharePlayerCardPath(spaceId: string, debateId: string): string {
  return `${sharePlayerPath(spaceId, debateId)}/card.jpg`;
}

type Region = { x: number; y: number; width: number; height: number };

/** Where the header and the two speakers sit in the share video, as geo-chat recorded the render. */
export type ShareVideoLayout = {
  canvas: Region;
  header: Region;
  slot_1_video: Region;
  slot_2_video: Region;
  /** The VS badge straddling the two speakers; absent on renders that did not record it. */
  vs_badge?: Region;
};

function isRegion(value: unknown): value is Region {
  if (!value || typeof value !== 'object') return false;
  const region = value as Record<string, unknown>;
  return (['x', 'y', 'width', 'height'] as const).every(key => typeof region[key] === 'number');
}

/** The share video's layout, or null on a render that did not record one (the card can't be cut). */
export function shareVideoLayout(media: DebateMediaResponse | null): ShareVideoLayout | null {
  const layout = media?.artifacts.find(artifact => artifact.kind === 'social_video')?.metadata.layout;
  if (!layout || typeof layout !== 'object') return null;
  const { canvas, header, slot_1_video, slot_2_video, vs_badge } = layout as Record<string, unknown>;
  return isRegion(canvas) && isRegion(header) && isRegion(slot_1_video) && isRegion(slot_2_video)
    ? { canvas, header, slot_1_video, slot_2_video, ...(isRegion(vs_badge) ? { vs_badge } : {}) }
    : null;
}

/**
 * The player page's own unfurl tags, so the page itself can be shared (GEO-3817). iMessage sized the
 * debate page's card from its landscape share image and cropped the vertical video into it, and the
 * debate page can't swap that image: Next's file-based `opengraph-image` always wins over metadata.
 * Here the image is a landscape card cut from the video's first frame (claim on top, the speakers side
 * by side), so the box iMessage draws is the right shape for it; a render with no recorded layout
 * falls back to the vertical frame. Same video and player tags as `sharePlayerMetadata` builds.
 */
export function sharePlayerHeadTags(input: Parameters<typeof sharePlayerMetadata>[0]): string {
  const metadata = sharePlayerMetadata(input);
  if (!metadata) return '';
  const og = metadata.openGraph as { videos: Array<Record<string, string | number>> };
  const twitter = metadata.twitter as {
    players: Array<{ playerUrl: string; streamUrl: string; width: number; height: number }>;
    images?: string[];
  };
  const video = og.videos[0];
  const player = twitter.players[0];
  const poster = twitter.images?.[0];
  const experience = shareTestExperience(input.debateId);
  const card = experience
    ? { url: experience.cardUrl, ...SHARE_CARD_SIZE }
    : poster && shareVideoLayout(input.media)
      ? {
          url: new URL(sharePlayerCardPath(input.spaceId, input.debateId), input.origin).toString(),
          ...SHARE_CARD_SIZE,
        }
      : poster
        ? { url: poster, ...POSTER_SIZE }
        : null;
  const tags: Array<[attribute: 'property' | 'name', key: string, value: string | number | undefined]> = [
    ['property', 'og:title', input.title],
    ['property', 'og:description', input.description],
    ['property', 'og:type', 'video.other'],
    ['property', 'og:url', player.playerUrl],
    ['property', 'og:image', card?.url],
    ['property', 'og:image:width', card?.width],
    ['property', 'og:image:height', card?.height],
    ['property', 'og:video', video.url],
    ['property', 'og:video:secure_url', video.secureUrl],
    ['property', 'og:video:type', video.type],
    ['property', 'og:video:width', video.width],
    ['property', 'og:video:height', video.height],
    ['name', 'twitter:card', 'player'],
    ['name', 'twitter:site', '@geobrowser'],
    ['name', 'twitter:title', input.title],
    ['name', 'twitter:description', input.description],
    ['name', 'twitter:image', poster],
    ['name', 'twitter:player', player.playerUrl],
    ['name', 'twitter:player:stream', player.streamUrl],
    ['name', 'twitter:player:width', player.width],
    ['name', 'twitter:player:height', player.height],
  ];
  return tags
    .filter(([, , value]) => value !== undefined && value !== '')
    .map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escapeHtml(String(value))}">`)
    .join('\n');
}

export type SharePlayerDeps = {
  enabled?: boolean;
  fetchEntity?: (
    entityId: string,
    spaceId: string,
    signal: AbortSignal
  ) => Promise<(DebateEntity & Pick<Entity, 'name'>) | null>;
  fetchVisibility?: (entityId: string) => Promise<DebateVisibility>;
  fetchMedia?: (entityId: string) => Promise<DebateMediaResponse | null>;
};

/**
 * The debate behind a player URL, or null when the player must not show it. X keeps a card for days,
 * so the player itself must stop playing a debate that was hidden or removed after it was shared: it
 * refuses whenever the debate page would not show the debate (hidden in this space, not a Debate, or
 * removed by geo-chat). A graph that cannot be read in time refuses too, as the page would; a geo-chat
 * that cannot be read does not, since its own content route refuses a removed debate's video anyway.
 */
export async function loadSharePlayerDebate(
  { spaceId, debateId }: { spaceId: string; debateId: string },
  {
    enabled = sharePlayerEnabled(),
    fetchEntity = fetchEntityFromGraph,
    fetchVisibility = id => fetchDebateVisibility(id),
    fetchMedia = id => fetchDebatePageMedia(id),
  }: SharePlayerDeps = {}
): Promise<{ title: string; media: DebateMediaResponse | null } | null> {
  if (!enabled || !IdUtils.isValid(spaceId) || !isGeoChatDebateId(debateId)) return null;

  const [entity, visibility, media] = await Promise.all([
    fetchEntity(debateId, spaceId, AbortSignal.timeout(PUBLISHED_DEBATE_LOOKUP_TIMEOUT_MS)).catch(() => null),
    fetchVisibility(debateId),
    fetchMedia(debateId).catch(() => null),
  ]);
  if (!isVisibleDebate(entity) || visibility === 'removed') return null;
  return { title: entity?.name || 'Geo debate', media };
}

/** The player route's response: 404 wherever `loadSharePlayerDebate` refuses. */
export async function sharePlayerResponse(
  { spaceId, debateId, origin }: { spaceId: string; debateId: string; origin: string },
  deps: SharePlayerDeps = {}
): Promise<Response> {
  const debate = await loadSharePlayerDebate({ spaceId, debateId }, deps);
  if (!debate) return new Response('Not found', { status: 404 });

  const { title, media } = debate;
  const headTags = sharePlayerHeadTags({ origin, spaceId, debateId, media, title });
  // Production's own URL shape, on whatever host served the player (the preview while testing).
  // `stay=1`: a visitor from X would otherwise be sent on to the debates app (GEO-3695).
  const debateUrl = new URL(`/space/${ID.uuidToHex(spaceId)}/${ID.uuidToHex(debateId)}?stay=1`, origin).toString();
  return new Response(sharePlayerHtml({ debateId, title, debateUrl, headTags }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
