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
  .end[hidden], .open[hidden] { display: none; }
  .stage { position: absolute; inset: 0; }
  /* The made-for-it video is 16:9 and leaves room for its buttons; the stage keeps them in it. Its
     size is the container, so the buttons scale with the card however large X draws it. */
  .stage.fixed {
    margin: auto; aspect-ratio: 16 / 9; width: min(100vw, calc(100vh * 16 / 9)); height: auto;
    container-type: size; font-family: Geist, -apple-system, BlinkMacSystemFont, sans-serif;
  }
${SHARE_TEST_BUTTON_CSS}  .full { padding: 12px 20px; border-radius: 999px; background: #fff; color: #000; font-size: 16px; }
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

/** The Geo Debate Clip's pill (label and a round go button), as the X player's live buttons. */
const SHARE_TEST_BUTTON_CSS = `
  @font-face { font-family: Geist; src: url('/fonts/Geist-Medium.ttf'); font-weight: 500; }
  .btn {
    position: absolute; z-index: 2; display: flex; align-items: center; justify-content: space-between;
    gap: 1.1cqw; padding: 0 0.7cqw 0 2cqw; border-radius: 999px; box-sizing: border-box;
    font-weight: 500; font-size: 2.35cqw; letter-spacing: -0.04em; white-space: nowrap; text-decoration: none;
    box-shadow: 0 0.6cqw 2cqw rgba(0, 0, 0, 0.28);
    cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease, color 160ms ease, opacity 220ms ease;
    opacity: 0; transform: translateY(1cqw); pointer-events: none;
  }
  .btn.on { opacity: 1; transform: none; pointer-events: auto; }
  /* Hover: lifts and shades, the go circle grows and its arrow nudges on. Press: sinks. */
  .btn.on:hover { transform: translateY(-0.4cqw); box-shadow: 0 1.2cqw 3cqw rgba(0, 0, 0, 0.38); }
  .btn.light.on:hover { background: #ececec; }
  .btn.dark.on:hover { background: #333; }
  .btn.on:hover .go { transform: scale(1.12); }
  .btn.on:hover .go svg { transform: translateX(0.2cqw); }
  .btn .go svg { transition: transform 160ms ease; }
  .btn.on:active { transform: translateY(0.1cqw) scale(0.95); box-shadow: 0 0.3cqw 1cqw rgba(0, 0, 0, 0.3); transition-duration: 60ms; }
  .btn.light.on:active { background: #dcdcdc; }
  .btn.dark.on:active { background: #000; }
  /* Clicked: Geo purple with a check, for a moment, so the press is plainly acknowledged. */
  .btn.on.clicked, .btn.on.clicked:hover { background: #9a4eff; color: #fff; }
  .btn.clicked .go { background: #fff; color: #9a4eff; }
  .btn .check { display: none; }
  .btn.clicked .arrow { display: none; }
  .btn.clicked .check { display: block; }
  .btn:focus-visible { outline: 0.25cqw solid #9a4eff; outline-offset: 0.3cqw; }
  .btn .go {
    flex: none; display: grid; place-items: center; width: 4.4cqw; height: 4.4cqw; border-radius: 50%;
    transition: transform 160ms ease;
  }
  .btn .go svg { width: 2cqw; height: 2cqw; }
  .btn.light { background: #fff; color: #151515; }
  .btn.light .go { background: #151515; color: #fff; }
  .btn.dark { background: #151515; color: #fff; }
  .btn.dark .go { background: #fff; color: #151515; }
  .btn .mark { width: 1.6cqw; height: 1.9cqw; margin-right: -0.4cqw; }
  /* Read as tappable without hover (phones): every button rings softly, staggered, the main one
     stronger, and each arrow nudges on. */
  .btn.on::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    animation: ring 2.4s ease-out infinite; animation-delay: var(--delay, 0s); opacity: 0.6;
  }
  .btn.on .go svg.arrow { animation: nudge 1.6s ease-in-out infinite; animation-delay: var(--delay, 0s); }
  @keyframes nudge { 0%, 60%, 100% { transform: translateX(0); } 30% { transform: translateX(0.35cqw); } }
  .btn.pulse.on::after {
    animation-duration: 1.8s; opacity: 1;
  }
  @keyframes ring {
    0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.7); }
    100% { box-shadow: 0 0 0 1.6cqw rgba(255, 255, 255, 0); }
  }
  .btn.dark.on::after { animation-name: ring-dark; }
  @keyframes ring-dark {
    0% { box-shadow: 0 0 0 0 rgba(21, 21, 21, 0.45); }
    100% { box-shadow: 0 0 0 1.6cqw rgba(21, 21, 21, 0); }
  }
  .btn.watch { top: 3.6cqh; right: 2.6cqw; height: 6.2cqh; font-size: 1.9cqw; padding-left: 1.4cqw; }
  .btn.watch .go { width: 3.6cqw; height: 3.6cqw; }
  @media (prefers-reduced-motion: reduce) {
    .btn, .btn .go { transition: none; }
    .btn.on::after, .btn.on .go svg.arrow { animation: none; }
  }
`;

const GO_ARROW =
  '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
  '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const GEO_MARK =
  '<svg class="mark" viewBox="0 0 25.8662 30" fill="none"><path d="M23.6374 28.2346C23.9907 28.8166 23.5717 29.5611 22.8909 29.5611H2.9992C2.31839 29.5611 1.8994 28.8167 2.25264 28.2347L4.00242 25.3518C4.25863 24.9296 4.81249 24.806 5.24126 25.0509C7.48535 26.333 10.117 27.0718 12.9319 27.0719C15.7543 27.0719 18.3928 26.3292 20.6408 25.0409C21.0697 24.7951 21.6242 24.9185 21.8807 25.341L23.6374 28.2346ZM12.1985 11.8531C12.5386 11.2931 13.3516 11.2933 13.6917 11.8531L19.5432 21.4924C19.7837 21.8887 19.6743 22.4069 19.2749 22.6424C17.4349 23.7272 15.2616 24.3561 12.9319 24.3561C10.6105 24.356 8.44448 23.7315 6.60858 22.6537C6.20827 22.4187 6.09825 21.8997 6.33918 21.5029L12.1985 11.8531Z" fill="currentColor"/><path d="M12.9326 23.5588C6.60632 23.5586 1.55672 18.5905 1.55666 12.5578C1.55666 6.52517 6.60628 1.55711 12.9326 1.55686C19.2592 1.55686 24.3096 6.52502 24.3096 12.5578C24.3095 18.5906 19.2592 23.5588 12.9326 23.5588Z" stroke="currentColor" stroke-width="3.11332"/></svg>';

/**
 * The X player's buttons over a made-for-it share video, each live only while its screen is on:
 * Agree and Disagree on the claim screen, Watch on Geo while the reel plays, and all three on the
 * end screen, which stays once the video ends. They are page elements, not pixels in the video, so
 * they animate in, pulse, and answer hover and press; the video leaves room for them and reads as
 * finished without them, which is how it plays everywhere else.
 *
 * Agree and Disagree open the debate with `?side=`, which casts the vote there (kept on the device
 * and the save sheet for a visitor). Every link carries `stay=1`, so a visitor from X lands on this
 * debate rather than the debates app.
 */
function experienceOverlay(experience: ShareTestExperience, debateUrl: string): string {
  const link = (side?: 'agree' | 'disagree') => {
    const url = new URL(debateUrl);
    if (side) url.searchParams.set('side', side);
    url.searchParams.set('stay', '1');
    return escapeHtml(url.toString());
  };
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  const at = (rect: ShareTestRect) =>
    `left:${pct(rect.x)};top:${pct(rect.y)};width:${pct(rect.w)};height:${pct(rect.h)}`;
  const button = (group: string, cls: string, href: string, label: string, style = '') =>
    `<a class="btn ${cls}" data-group="${group}" href="${href}" target="_blank" rel="noopener" style="${style}">${label}<span class="go">${GO_ARROW}</span></a>`;
  const { claim, reel, end } = experience;
  return `
${button('claim', 'light pulse', link('agree'), 'Agree', at(claim.agree))}
${button('claim', 'light', link('disagree'), 'Disagree', at(claim.disagree))}
${button('reel', 'light watch', link(), `${GEO_MARK}Watch on Geo`)}
${button('end', 'dark', link('agree'), 'Agree', at(end.agree))}
${button('end', 'dark', link('disagree'), 'Disagree', at(end.disagree))}
${button('end', 'dark pulse', link(), 'Watch the full debate on Geo', at(end.full))}
<script>
  (function () {
    var video = document.querySelector('video');
    var spans = { claim: [${claim.start}, ${claim.end}], reel: [${reel.start}, ${reel.end}], end: [${end.start}, Infinity] };
    var buttons = document.querySelectorAll('.btn');
    function sync() {
      var t = video.ended ? Infinity : video.currentTime;
      buttons.forEach(function (a, i) {
        var span = spans[a.dataset.group];
        var on = t >= span[0] && t < span[1];
        if (on === a.classList.contains('on')) return;
        // In one after another, so a screen's buttons arrive rather than appear.
        a.style.transitionDelay = on ? (i % 3) * 90 + 'ms' : '0ms';
        a.style.setProperty('--delay', (i % 3) * 0.5 + 's');
        a.classList.toggle('on', on);
        a.tabIndex = on ? 0 : -1;
      });
    }
    ['timeupdate', 'seeked', 'ended', 'play'].forEach(function (e) { video.addEventListener(e, sync); });
    // iOS Safari only shows :active on a touch when the page listens for touches.
    document.addEventListener('touchstart', function () {}, { passive: true });
    buttons.forEach(function (a) {
      a.addEventListener('click', function () {
        a.classList.add('clicked');
        setTimeout(function () { a.classList.remove('clicked'); }, 1600);
      });
    });
    sync();
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
