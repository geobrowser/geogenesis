import sharp from 'sharp';

import { ID } from '~/core/id';

import { readImageBody } from './email-debate-still';
import { geoChatBaseUrl } from './geo-chat-base-url';
import {
  SHARE_CARD_SIZE,
  type SharePlayerDeps,
  type ShareVideoLayout,
  loadSharePlayerDebate,
  shareVideoLayout,
} from './share-player';

type Region = ShareVideoLayout['header'];

/** The gap around and between the two speakers on the card, in card pixels. */
const GUTTER = 16;

/** The header band's own colour, read from its corner, so the card continues it without a seam. */
async function headerColour(still: Buffer, region: { left: number; top: number }) {
  const { data } = await sharp(still)
    .extract({ ...region, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0] ?? 255, g: data[1] ?? 255, b: data[2] ?? 255 };
}

/**
 * The speakers without the VS badge, which straddles the edge between them in the vertical video and
 * would leave a fragment on each tile side by side: the first is cut off above it, the second below.
 */
function withoutBadge(layout: ShareVideoLayout): [Region, Region] {
  const { slot_1_video: one, slot_2_video: two, vs_badge: badge } = layout;
  if (!badge) return [one, two];
  const oneBottom = Math.min(one.y + one.height, badge.y);
  const twoTop = Math.max(two.y, badge.y + badge.height);
  return [
    { ...one, height: Math.max(1, oneBottom - one.y) },
    { ...two, y: twoTop, height: Math.max(1, two.y + two.height - twoTop) },
  ];
}

/** A layout region scaled onto the still, clamped inside it so `extract` cannot throw. */
function onStill(region: Region, scale: number, still: { width: number; height: number }) {
  const left = Math.max(0, Math.round(region.x * scale));
  const top = Math.max(0, Math.round(region.y * scale));
  return {
    left,
    top,
    width: Math.max(1, Math.min(still.width - left, Math.round(region.width * scale))),
    height: Math.max(1, Math.min(still.height - top, Math.round(region.height * scale))),
  };
}

/**
 * The landscape share image for a debate (GEO-3817), cut from the share video's first frame: the
 * video's header (Geo mark and the claim) across the top, and the two speakers side by side below.
 *
 * Link previews draw a box about 1.91:1 and crop whatever doesn't fit, so the vertical frame lost both
 * the claim and the second speaker. Cut from the frame rather than drawn afresh because older debates
 * have no speaker stills, which the published share card needs, but every rendered debate has this
 * frame and the layout it was drawn with.
 */
export async function renderShareCard(still: Buffer, layout: ShareVideoLayout): Promise<Buffer> {
  const image = sharp(still);
  const { width = 0, height = 0 } = await image.metadata();
  const size = { width, height };
  const scale = width / layout.canvas.width;

  const slotWidth = (SHARE_CARD_SIZE.width - GUTTER * 3) / 2;
  const slotHeight = Math.round((slotWidth * layout.slot_1_video.height) / layout.slot_1_video.width);
  const slotTop = SHARE_CARD_SIZE.height - GUTTER - slotHeight;
  const headerHeight = slotTop - GUTTER / 2;

  const background = await headerColour(still, onStill(layout.header, scale, size));
  const [speaker1, speaker2] = withoutBadge(layout);

  // The header keeps its proportions on the band's colour; a speaker fills its tile, trimmed evenly.
  const cut = (region: Region, target: { width: number; height: number }, fit: 'contain' | 'cover') =>
    sharp(still)
      .extract(onStill(region, scale, size))
      .resize({ ...target, fit, background })
      .toBuffer();

  const [header, slot1, slot2] = await Promise.all([
    cut(layout.header, { width: SHARE_CARD_SIZE.width, height: headerHeight }, 'contain'),
    cut(speaker1, { width: slotWidth, height: slotHeight }, 'cover'),
    cut(speaker2, { width: slotWidth, height: slotHeight }, 'cover'),
  ]);

  return sharp({ create: { ...SHARE_CARD_SIZE, channels: 3, background } })
    .composite([
      { input: header, left: 0, top: 0 },
      { input: slot1, left: GUTTER, top: slotTop },
      { input: slot2, left: GUTTER * 2 + slotWidth, top: slotTop },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

type CardDeps = SharePlayerDeps & { fetchImpl?: typeof fetch };

/**
 * The card route's response: 404 wherever the player itself would (hidden, removed, not a Debate, off
 * previews), or when the render recorded no layout or the still can't be read.
 */
export async function sharePlayerCardResponse(
  params: { spaceId: string; debateId: string },
  { fetchImpl = fetch, ...deps }: CardDeps = {}
): Promise<Response> {
  const notFound = () => new Response('Not found', { status: 404 });
  const debate = await loadSharePlayerDebate(params, deps);
  const layout = shareVideoLayout(debate?.media ?? null);
  if (!debate || !layout) return notFound();

  // Built from the id on geo-chat's durable route, never from the graph: the server fetches it.
  const stillUrl = `${geoChatBaseUrl()}/debates/${ID.uuidToHex(params.debateId)}/media/artifacts/social_preview_image/content`;
  const still = await fetchImpl(stillUrl, { signal: AbortSignal.timeout(10_000) })
    .then(readImageBody)
    .catch(() => null);
  if (!still) return notFound();

  const card = await renderShareCard(still, layout).catch(() => null);
  if (!card) return notFound();
  return new Response(new Uint8Array(card), {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' },
  });
}
