import sharp, { type Sharp } from 'sharp';

import { MAX_IMAGE_SIZE_BYTES } from '~/core/constants';

import { debateArtifactContentUrl } from '../speaker-still';

/**
 * A debate's video still for the retention emails' debate rows (GEO-3377): portrait, with the play
 * button drawn into the image. Email clients can't put one on top of an image (Gmail drops
 * `position`, Outlook drops background images), so it has to be part of the picture itself.
 *
 * The email shows it at 52×72; this is 3× for high-resolution screens. It's opaque (a JPEG on the
 * placeholder grey), so Gmail's dark mode can't make it disappear.
 */
export const STILL_WIDTH = 156;
export const STILL_HEIGHT = 216;

/** The emails' placeholder grey (geo-notifications `T.placeholder`). */
const PLACEHOLDER = '#e4e4e4';

/**
 * A real key frame is under 2M pixels; this refuses a small file that decodes to a huge image (a
 * decompression bomb) before sharp allocates it.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Where the still comes from: geo-chat's own preview image for this debate (the key frame the app
 * shows), by its durable route. Built from the id, never read from the graph: a key frame value is
 * published data anyone can add to from their own space, and the server would fetch it.
 */
export const emailStillSourceUrl = (debateId: string) => debateArtifactContentUrl(debateId, 'preview_image');

/**
 * The body, or null when it is not ok or would pass `MAX_IMAGE_SIZE_BYTES`. Read in chunks, so a body
 * with no Content-Length is cut off at the cap rather than buffered whole.
 */
export async function readImageBody(res: Response): Promise<Buffer | null> {
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (!res.ok || !res.body || declared > MAX_IMAGE_SIZE_BYTES) {
    await res.body?.cancel();
    return null;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.byteLength;
    if (total > MAX_IMAGE_SIZE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

/** A white disc with a dark triangle, centered, at 3×: the app's play button on a still. */
const PLAY_BUTTON = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${STILL_WIDTH}" height="${STILL_HEIGHT}">` +
    `<circle cx="${STILL_WIDTH / 2}" cy="${STILL_HEIGHT / 2}" r="34" fill="#000" fill-opacity="0.18"/>` +
    `<circle cx="${STILL_WIDTH / 2}" cy="${STILL_HEIGHT / 2}" r="32" fill="#fff" fill-opacity="0.94"/>` +
    `<path d="M ${STILL_WIDTH / 2 - 9} ${STILL_HEIGHT / 2 - 14} L ${STILL_WIDTH / 2 + 15} ${STILL_HEIGHT / 2} L ${STILL_WIDTH / 2 - 9} ${STILL_HEIGHT / 2 + 14} Z" fill="#151515"/>` +
    `</svg>`
);

const withPlayButton = (base: Sharp) =>
  base
    .composite([{ input: PLAY_BUTTON }])
    .flatten({ background: PLACEHOLDER })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

/** The still cropped to fill the portrait frame, with the play button on top. Throws on a non-image. */
export function renderEmailStill(source: Buffer): Promise<Buffer> {
  return withPlayButton(
    sharp(source, { limitInputPixels: MAX_INPUT_PIXELS }).resize(STILL_WIDTH, STILL_HEIGHT, {
      fit: 'cover',
      position: 'attention',
    })
  );
}

let placeholder: Promise<Buffer> | null = null;

/** The button on the placeholder grey, for a debate with no still: the same bytes every time, made once. */
export function emailStillPlaceholder(): Promise<Buffer> {
  return (placeholder ??= withPlayButton(
    sharp({ create: { width: STILL_WIDTH, height: STILL_HEIGHT, channels: 3, background: PLACEHOLDER } })
  ));
}
