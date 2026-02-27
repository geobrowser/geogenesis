import { ImageResponse } from 'next/og';

import { getImagePath } from '~/core/utils/utils';

export const OG_IMAGE_SIZE = { width: 600, height: 315 };
export const OG_IMAGE_CONTENT_TYPE = 'image/png';

const DEFAULT_OG_IMAGE = 'https://www.geobrowser.io/static/geo-social-image-v2.png';

export function firstLine(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const line = text.split(/\r?\n/)[0] ?? text;
  return line.trim() || undefined;
}

export async function generateOgImage(imageUrl?: string) {
  const src = imageUrl ? getImagePath(imageUrl) : DEFAULT_OG_IMAGE;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#fff',
      }}
    >
      <img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </div>,
    OG_IMAGE_SIZE
  );
}
