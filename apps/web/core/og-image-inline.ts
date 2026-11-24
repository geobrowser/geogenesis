import sharp from 'sharp';

import { OG_GATEWAY_HOSTS, toSatoriImageSrc } from '~/core/og-share-image';

export type InlinedImage = { src: string | null; timedOut: boolean };

/** One redirect is followed, and only to another allowed host. */
const MAX_REDIRECTS = 1;

/**
 * An image resized to `size`² and inlined as a JPEG data URI, so Satori never decodes a large
 * original. Only our IPFS gateways are fetched: an author-supplied URL must not make the server
 * reach an arbitrary or internal host. Null on a missing, refused or failed image; `timedOut` when
 * the budget ran out.
 */
export async function inlineOgImage(
  value: string | null | undefined,
  size: number,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<InlinedImage> {
  const first = toSatoriImageSrc(value, OG_GATEWAY_HOSTS);
  if (!first) return { src: null, timedOut: false };
  if (first.startsWith('data:')) return { src: first, timedOut: false };
  let src: string = first;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let response = await fetchImpl(src, { signal, redirect: 'manual' });
    for (let hop = 0; isRedirect(response.status); hop++) {
      const location = response.headers.get('location');
      const next: string | null =
        hop < MAX_REDIRECTS && location ? toSatoriImageSrc(new URL(location, src).href, OG_GATEWAY_HOSTS) : null;
      if (!next || next.startsWith('data:')) return { src: null, timedOut: false };
      src = next;
      response = await fetchImpl(src, { signal, redirect: 'manual' });
    }
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
      return { src: null, timedOut: false };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const jpeg = await sharp(buffer).resize(size, size, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
    return { src: `data:image/jpeg;base64,${jpeg.toString('base64')}`, timedOut: false };
  } catch {
    return { src: null, timedOut: signal.aborted };
  }
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}
