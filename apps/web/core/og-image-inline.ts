import sharp from 'sharp';

import { OG_GATEWAY_HOSTS, toSatoriImageSrc } from '~/core/og-share-image';

export type InlinedImage = { src: string | null; timedOut: boolean };

/** One redirect is followed, and only to another allowed host. */
const MAX_REDIRECTS = 1;
/** Decoded size caps for an author's data URI and a fetched image. */
const MAX_DATA_URI_BYTES = 512 * 1024;
const MAX_FETCH_BYTES = 8 * 1024 * 1024;
/** Raster formats only: SVG never reaches sharp's renderer or Satori. */
const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);
const RASTER_DATA_URI = /^data:image\/(?:png|jpeg|webp|gif);base64,/i;

/**
 * The image as a `size`² JPEG data URI, fetched only from our gateways so an author's URL can't
 * reach other hosts. Null when missing, refused or failed; `timedOut` when the budget ran out.
 */
export async function inlineOgImage(
  value: string | null | undefined,
  size: number,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<InlinedImage> {
  const first = toSatoriImageSrc(value, OG_GATEWAY_HOSTS);
  if (!first) return { src: null, timedOut: false };
  if (first.startsWith('data:')) return { src: await inlineDataUri(first, size), timedOut: false };
  let src: string = first;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let response = await fetchImpl(src, { signal, redirect: 'manual' });
    for (let hop = 0; isRedirect(response.status); hop++) {
      discard(response);
      const location = response.headers.get('location');
      const next: string | null =
        hop < MAX_REDIRECTS && location ? toSatoriImageSrc(new URL(location, src).href, OG_GATEWAY_HOSTS) : null;
      if (!next || next.startsWith('data:')) return { src: null, timedOut: false };
      src = next;
      response = await fetchImpl(src, { signal, redirect: 'manual' });
    }
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
      discard(response);
      return { src: null, timedOut: false };
    }
    const buffer = await readCapped(response, MAX_FETCH_BYTES);
    return { src: buffer ? await toJpeg(buffer, size) : null, timedOut: false };
  } catch {
    return { src: null, timedOut: signal.aborted };
  }
}

async function inlineDataUri(uri: string, size: number): Promise<string | null> {
  const prefix = RASTER_DATA_URI.exec(uri)?.[0];
  if (!prefix) return null;
  const body = uri.slice(prefix.length);
  if ((body.length * 3) / 4 > MAX_DATA_URI_BYTES + 2) return null;
  const buffer = Buffer.from(body, 'base64');
  if (buffer.length > MAX_DATA_URI_BYTES) return null;
  try {
    return await toJpeg(buffer, size);
  } catch {
    return null;
  }
}

/** A `size`² JPEG data URI; throws unless the bytes are a raster image. */
async function toJpeg(buffer: Buffer, size: number): Promise<string> {
  const image = sharp(buffer);
  const { format } = await image.metadata();
  if (!format || !RASTER_FORMATS.has(format)) throw new Error(`Refused image format ${format}`);
  const jpeg = await image.resize(size, size, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/** The body, or null past `cap` bytes: by Content-Length up front, else while reading. */
async function readCapped(response: Response, cap: number): Promise<Buffer | null> {
  if (Number(response.headers.get('content-length')) > cap || !response.body) {
    discard(response);
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
}

function discard(response: Response) {
  response.body?.cancel().catch(() => {});
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}
