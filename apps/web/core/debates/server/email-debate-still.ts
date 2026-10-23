import sharp from 'sharp';

import { FILEBASE_GATEWAY_READ_PATH } from '~/core/constants';
import {
  DEBATE_VIDEOS_PROPERTY_ID,
  IMAGE_URL_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
  WEB_URL_PROPERTY_ID,
} from '~/core/debates/ontology';

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
 * Where a still may be fetched from: the IPFS gateway the app reads, and geo-chat on geobrowser.io,
 * which redirects to its object storage. A key frame's URL is published data, so anything else is
 * refused rather than fetched from the server.
 */
export function isAllowedStillUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return value.startsWith(FILEBASE_GATEWAY_READ_PATH) || url.hostname.endsWith('.geobrowser.io');
  } catch {
    return false;
  }
}

/** A debate id from the path, as the graph stores it (32 hex), or null. */
export function normalizeDebateId(raw: string): string | null {
  const id = raw.replaceAll('-', '').toLowerCase();
  return /^[0-9a-f]{32}$/.test(id) ? id : null;
}

type KeyframeQuery = {
  entity: {
    relationsList: {
      toEntity: {
        relationsList: { toEntity: { valuesList: { propertyId: string; text: string | null }[] } | null }[];
      } | null;
    }[];
  } | null;
};

/**
 * The still's URL: Debate → Videos → Key frame → its `IPFS URL`, else its `Web URL` (geo-chat), as
 * the app's `useDebateKeyframes` reads it. Null when the debate has none we may fetch.
 */
export async function findDebateStillUrl(
  debateId: string,
  graphqlUrl: string,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  const query = `{ entity(id: "${debateId}") { relationsList(filter: { typeId: { is: "${DEBATE_VIDEOS_PROPERTY_ID}" } }) { toEntity { relationsList(filter: { typeId: { is: "${KEY_FRAME_IMAGE_PROPERTY_ID}" } }) { toEntity { valuesList(filter: { propertyId: { in: ["${IMAGE_URL_PROPERTY_ID}", "${WEB_URL_PROPERTY_ID}"] } }) { propertyId text } } } } } } }`;
  const res = await fetcher(graphqlUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: KeyframeQuery };
  const frames = (body.data?.entity?.relationsList ?? []).flatMap(v => v.toEntity?.relationsList ?? []);
  for (const frame of frames) {
    const values = frame.toEntity?.valuesList ?? [];
    const ipfs = values.find(v => v.propertyId === IMAGE_URL_PROPERTY_ID && v.text?.startsWith('ipfs://'))?.text;
    const web = values.find(v => v.propertyId === WEB_URL_PROPERTY_ID && v.text)?.text;
    const url = ipfs ? FILEBASE_GATEWAY_READ_PATH + ipfs.slice('ipfs://'.length) : web;
    if (url && isAllowedStillUrl(url)) return url;
  }
  return null;
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
