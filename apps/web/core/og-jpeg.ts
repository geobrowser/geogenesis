import sharp from 'sharp';

// next/og (Satori) only emits PNG — a detailed photo cover can exceed 500KB and
// time out on X. Re-encode every OG image to JPEG for small, consistent sizes.
export async function ogImageToJpeg(image: Response): Promise<Response> {
  const png = await image.arrayBuffer();
  const jpeg = await sharp(Buffer.from(png)).jpeg({ quality: 70, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg' } });
}
