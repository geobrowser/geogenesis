import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, generateOgImage } from '~/core/opengraph';

export const alt = 'Geo Genesis';
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image() {
  return generateOgImage();
}
