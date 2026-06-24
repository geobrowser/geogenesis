import sharp from 'sharp';

import type { OgTimer } from '~/core/og-timing';

// next/og (Satori) only emits PNG — a detailed photo cover can exceed 500KB and
// time out on X. Re-encode every OG image to JPEG for small, consistent sizes.
export async function ogImageToJpeg(image: Response, timer?: OgTimer): Promise<Response> {
  // `image.arrayBuffer()` is where Satori actually renders the JSX and fetches
  // every remote thumbnail (IPFS), so this span captures render + image I/O.
  const png = timer ? await timer.span('satori-png', () => image.arrayBuffer()) : await image.arrayBuffer();
  const jpeg = timer
    ? await timer.span('jpeg-encode', () => sharp(Buffer.from(png)).jpeg({ quality: 70, mozjpeg: true }).toBuffer())
    : await sharp(Buffer.from(png)).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } });
}
