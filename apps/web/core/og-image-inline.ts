import sharp from 'sharp';

import { toSatoriImageSrc } from '~/core/og-share-image';

export type InlinedImage = { src: string | null; timedOut: boolean };

/**
 * An image resized to `size`² and inlined as a JPEG data URI, so Satori never decodes a large
 * original. Null on a missing or failed image; `timedOut` when the budget ran out.
 */
export async function inlineOgImage(
  value: string | null | undefined,
  size: number,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<InlinedImage> {
  const src = toSatoriImageSrc(value);
  if (!src) return { src: null, timedOut: false };
  if (src.startsWith('data:')) return { src, timedOut: false };
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(src, { signal });
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
