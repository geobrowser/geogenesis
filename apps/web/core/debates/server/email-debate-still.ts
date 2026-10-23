import sharp from 'sharp';

import { FILEBASE_GATEWAY_READ_PATH } from '~/core/constants';
import { getGeoChatApiBaseUrl } from '~/core/debates/geo-chat-public-base-url';
import { toSatoriImageSrc } from '~/core/og-share-image';

import { geoChatBaseUrl } from './geo-chat-base-url';

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

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

/**
 * Where a still may be fetched from: the IPFS gateway the app reads, and geo-chat (which redirects to
 * its object storage). A keyframe's URL is published data, so anything else is refused rather than
 * fetched from the server.
 */
const stillHosts = () =>
  new Set(
    [FILEBASE_GATEWAY_READ_PATH, getGeoChatApiBaseUrl(), geoChatBaseUrl()]
      .map(hostOf)
      .filter((host): host is string => !!host)
  );

/** The URL to fetch a stored keyframe value from (`ipfs://` through the gateway), or null if refused. */
export function emailStillSource(keyframe: string | null): string | null {
  return toSatoriImageSrc(keyframe, stillHosts());
}

/** A white disc with a dark triangle, centered, at 3×: the app's play button on a still. */
const PLAY_BUTTON = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${STILL_WIDTH}" height="${STILL_HEIGHT}">` +
    `<circle cx="${STILL_WIDTH / 2}" cy="${STILL_HEIGHT / 2}" r="34" fill="#000" fill-opacity="0.18"/>` +
    `<circle cx="${STILL_WIDTH / 2}" cy="${STILL_HEIGHT / 2}" r="32" fill="#fff" fill-opacity="0.94"/>` +
    `<path d="M ${STILL_WIDTH / 2 - 9} ${STILL_HEIGHT / 2 - 14} L ${STILL_WIDTH / 2 + 15} ${STILL_HEIGHT / 2} L ${STILL_WIDTH / 2 - 9} ${STILL_HEIGHT / 2 + 14} Z" fill="#151515"/>` +
    `</svg>`
);

/**
 * The still cropped to fill the portrait frame, with the play button on top. `source` null draws the
 * button on the placeholder grey, so a row still lines up when the still can't be read.
 */
export async function renderEmailStill(source: Buffer | null): Promise<Buffer> {
  const base = source
    ? sharp(source).resize(STILL_WIDTH, STILL_HEIGHT, { fit: 'cover', position: 'attention' })
    : sharp({ create: { width: STILL_WIDTH, height: STILL_HEIGHT, channels: 3, background: PLACEHOLDER } });
  return base
    .composite([{ input: PLAY_BUTTON }])
    .flatten({ background: PLACEHOLDER })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
